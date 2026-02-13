import re
import json
import logging
from urllib.parse import urljoin, urlparse
from typing import Dict, List
from bs4 import BeautifulSoup

# Import from orchestrator
from orchestrator.checkpoint.executor import execute_task

class AIPresenceModule:
    """
    Analyzes AI bot accessibility and brand recognition.
    Ported to use Unified API Checkpoint.
    """
    
    def __init__(self):
        self.ai_bot_agents = [
            ('GPTBot', re.compile(r'(?i)gptbot')),
            ('Google-Extended', re.compile(r'(?i)google-extended')),
            ('ClaudeBot', re.compile(r'(?i)claudebot|anthropic-ai')),
        ]
        self.bot_to_provider = {
            'GPTBot': 'openai',
            'Google-Extended': 'gemini',
            'ClaudeBot': 'claude'
        }

    def _parse_robots_rules(self, robots_txt: str) -> Dict:
        """Parse robots.txt rules for AI bots"""
        # (Same logic as before, abbreviated for conciseness logic remains identical)
        checks = {}
        lines = [l.strip() for l in robots_txt.splitlines()]
        blocks = []
        current_agents = []
        current_rules = []
        
        for line in lines:
            if not line or line.startswith('#'): continue
            if line.lower().startswith('user-agent:'):
                if current_agents or current_rules:
                    blocks.append((current_agents, current_rules))
                current_agents = [line.split(':', 1)[1].strip()]
                current_rules = []
            else:
                current_rules.append(line)
        if current_agents or current_rules:
            blocks.append((current_agents, current_rules))

        def is_allowed_for(agent_name: str) -> bool:
            allowed = True
            for agents, rules in blocks:
                if any(a == '*' or a.lower() == agent_name.lower() for a in agents):
                    for r in rules:
                        lower = r.lower()
                        if lower.startswith('disallow:'):
                            path = lower.split(':', 1)[1].strip()
                            if path == '/': allowed = False
                        if lower.startswith('allow:'): pass
            return allowed

        for label, _ in self.ai_bot_agents:
            checks[f'robots_{label.lower()}'] = is_allowed_for(label)

        checks['sitemap_present'] = any(l.lower().startswith('sitemap:') for l in lines)
        return checks

    def _extract_org_and_meta(self, html: str) -> Dict:
        """Extract schema and meta tags"""
        # (Logic ported from original _extract_org_and_meta)
        checks = {
            'org_schema_present': False, 'org_logo_present': False,
            'sameas_wikidata_or_wikipedia': False, 'sameas_major_profiles_count': 0,
            'open_graph_present': False, 'twitter_card_present': False,
        }
        
        soup = BeautifulSoup(html, 'html.parser')
        jsonld = []
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                content = script.string
                if content:
                    parsed = json.loads(content)
                    if isinstance(parsed, list): jsonld.extend(parsed)
                    else: jsonld.append(parsed)
            except: continue

        same_as_links = []
        for obj in jsonld:
            t = obj.get('@type')
            is_org = False
            if isinstance(t, list): is_org = 'Organization' in t
            elif t == 'Organization': is_org = True
            
            if is_org:
                checks['org_schema_present'] = True
                same = obj.get('sameAs', [])
                if isinstance(same, str): same = [same]
                same_as_links.extend(same)
                
                logo = obj.get('logo')
                if logo: checks['org_logo_present'] = True

        major_domains = ['linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'crunchbase.com', 'github.com', 'facebook.com']
        major_count = sum(1 for link in same_as_links if any(d in link for d in major_domains))
        checks['sameas_major_profiles_count'] = major_count
        checks['sameas_wikidata_or_wikipedia'] = any('wikidata.org' in l or 'wikipedia' in l for l in same_as_links)

        lower_html = html.lower()
        checks['open_graph_present'] = 'og:' in lower_html
        checks['twitter_card_present'] = 'twitter:' in lower_html
        
        return checks

    async def _analyze_content_understanding(self, text_content: str, url: str) -> Dict[str, Dict]:
        """
        Runs the Multi-AI understanding check using execute_task.
        """
        truncated_text = text_content[:15000] # Limit tokens
        prompt = f"""
        Analyze this content from an AI Search Engine perspective.
        URL: {url}
        
        Task: Determine how well an AI can understand the main topic and purpose of this page.
        
        Return JSON ONLY:
        {{
            "understanding_level": "High" | "Medium" | "Low",
            "clarity_score": (0-100),
            "key_topics": ["topic1", "topic2"],
            "main_issues": ["issue1"],
            "recommendations": [
                {{
                    "action": "string",
                    "priority": "High" | "Medium" | "Low",
                    "impact": 1-10
                }}
            ]
        }}
        
        Content:
        {truncated_text}
        """
        
        results = {}
        
        # Parallel execution could be done here, but doing sequential for simplicity in this artifact
        # or use asyncio.gather in runner.
        for label, provider_key in self.bot_to_provider.items():
            # Special handling: map 'openai' etc to the correct provider string expected by executor
            # In our registry we use 'openai', 'gemini', 'claude'.
            
            resp = await execute_task(
                task_name="aeo_content_understanding",
                input_data={"messages": [{"role": "user", "content": prompt}]}, 
                provider=provider_key,
                options={"model": "gpt-4o-mini" if provider_key == 'openai' else None} # Use cheaper model 
            )
            
            if resp.success:
                try:
                    # Parse JSON from response
                    content = resp.data
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0]
                        
                    data = json.loads(content.strip())
                    
                    # Normalize score
                    results[provider_key] = {
                        "score": data.get("clarity_score", 0),
                        "understanding_level": data.get("understanding_level", "Low"),
                        "recommendations": data.get("recommendations", [])
                    }
                except Exception as e:
                     results[provider_key] = {"error": f"Parse error: {str(e)}", "score": 0}
            else:
                results[provider_key] = {"error": resp.error, "score": 0}
                
        return results

    async def run_analysis(self, url: str, html_content: str, robots_txt: str = "") -> Dict:
        """
        Main entry point for AI Presence Analysis.
        """
        try:
            # 1. Robots Checks
            robots_checks = self._parse_robots_rules(robots_txt)
            
            # 2. Content Checks
            content_checks = self._extract_org_and_meta(html_content)
            
            # 3. Multi-AI Understanding (The expensive part)
            soup = BeautifulSoup(html_content, 'html.parser')
            text_content = soup.get_text()
            ai_understanding = await self._analyze_content_understanding(text_content, url)
            
            # 4. Scoring Logic (Simplified from original for clarity, but keeping logic)
            score = 0
            
            # Robots pts (30)
            robot_points = 0
            for label, _ in self.ai_bot_agents:
                if robots_checks.get(f'robots_{label.lower()}', True):
                    robot_points += 4
            if robots_checks.get('sitemap_present'): robot_points += 6
            score += min(30, robot_points)
            
            # Org/Meta pts (40)
            if content_checks.get('org_schema_present'): score += 10
            if content_checks.get('org_logo_present'): score += 10
            if content_checks.get('sameas_wikidata_or_wikipedia'): score += 20
            score += min(40, score) # Cap it properly if logic changes
            
            # OG/Twitter (15)
            if content_checks.get('open_graph_present'): score += 8
            if content_checks.get('twitter_card_present'): score += 7
            
            # AI Understanding (15)
            # AI Understanding (15)
            # Average the valid scores from allowed bots
            valid_scores = []
            model_scores = {}
            for label, provider in self.bot_to_provider.items():
                if robots_checks.get(f'robots_{label.lower()}', True):
                    prov_data = ai_understanding.get(provider, {})
                    if prov_data.get('score'):
                        s = prov_data['score']
                        valid_scores.append(s)
                        model_scores[provider] = s
            
            avg_ai_score = sum(valid_scores) / len(valid_scores) if valid_scores else 0
            score += min(15, avg_ai_score * 0.15) # 15% weight
            
            # Consensus Logic
            consensus_data = self._calculate_model_consensus(model_scores)
            
            final_score = min(100, score)
            
            return {
                "score": final_score,
                "robots_checks": robots_checks,
                "content_checks": content_checks,
                "ai_understanding": ai_understanding,
                "multi_model_consensus": consensus_data,
                "recommendations": self._generate_recommendations(robots_checks, content_checks)
            }

    def _calculate_model_consensus(self, scores: Dict[str, float]) -> Dict:
        """Calculate consistency across different AI models"""
        if len(scores) < 2:
            return {
                "consistency_score": 100,
                "variation_rating": "N/A (Single Model)",
                "variance": 0
            }
            
        values = list(scores.values())
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = variance ** 0.5
        
        # consistency score (100 = perfect match, 0 = huge disagreement)
        # assuming max spread is around 100, so std_dev of 50 would be very low consistency
        consistency = max(0, 100 - (std_dev * 2))
        
        rating = "High"
        if std_dev > 15: rating = "Low"
        elif std_dev > 5: rating = "Medium"
        
        return {
            "consistency_score": int(consistency),
            "variation_rating": rating,
            "variance": round(variance, 2),
            "model_agreement": f"{rating} Agreement (Deviation: {round(std_dev, 1)})"
        }
            
        except Exception as e:
            logging.error(f"AI Presence Module Error: {e}")
            return {"score": 0, "error": str(e)}

    def _generate_recommendations(self, robots: Dict, content: Dict) -> List[Dict]:
        recs = []
        if not robots.get('sitemap_present'):
            recs.append({"action": "Add Sitemap URL to robots.txt", "priority": "High", "impact": 8})
        if not content.get('org_schema_present'):
            recs.append({"action": "Add Organization schema markup", "priority": "High", "impact": 9})
        if not content.get('open_graph_present'):
            recs.append({"action": "Add Open Graph meta tags", "priority": "Medium", "impact": 5})
        return recs
