"""
OpenAI Integration Service
Provides AI-powered content analysis and understanding
SAFE MODE: Returns fallback data if API Quota is exceeded.
"""

import os
import re
import json
import math
import logging
from typing import Dict, List, Optional
from datetime import datetime
from openai import OpenAI
from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync

try:
    from bs4 import BeautifulSoup
except Exception:
    BeautifulSoup = None

class OpenAIService:
    """Service for OpenAI-powered content analysis"""
    
    def __init__(self):
        self.client = None
        self.api_key = os.getenv('OPENAI_API_KEY')
        
        if self.api_key:
            try:
                self.client = OpenAI(api_key=self.api_key)
                logging.info("OpenAI client initialized successfully")
            except Exception as e:
                logging.error(f"Failed to initialize OpenAI client: {str(e)}")
                self.client = None
        else:
            logging.warning("OPENAI_API_KEY not found in environment variables")
    
    def _is_available(self) -> bool:
        """Check if OpenAI service is available"""
        return self.client is not None
    
    def analyze_content_understanding(self, content: str, url: str) -> Dict:
        """
        Analyze if AI can understand the content clearly using GPT-4o (Upgraded)
        SAFE MODE: Returns mock data if API fails.
        """
        # Default Fallback Result (Used if API fails)
        fallback_result = {
            'score': 50,
            'understanding_level': 'Fair (Safe Mode)',
            'key_topics': ['Content Analysis (Offline)', 'Safe Mode Active'],
            'clarity_score': 70,
            'main_issues': ['AI API Quota Exceeded - Running in Safe Mode'],
            'recommendations': ['Check OpenAI Billing'],
            'ai_feedback': "AI is currently offline due to quota limits. Basic analysis only."
        }

        if not self._is_available():
            return fallback_result
        
        try:
            # --- ATTEMPT REAL AI CALL ---
            # GPT-4o has a huge context window, so we increase the limit significantly
            if len(content) > 15000:
                content = content[:15000] + "..."
            
            prompt = f"""You are an AEO (Answer Engine Optimization) Expert. Analyze this content from {url}.
            
            Determine how well an AI Search Engine (like SearchGPT or Perplexity) would understand this page.
            
            Content:
            {content}
            
            Return a JSON object with:
            - understanding_level: (Poor, Fair, Good, Excellent)
            - key_topics: [List of top 3 entities/topics]
            - clarity_score: (0-100)
            - main_issues: [List of structural or clarity issues]
            - recommendations: [Specific actionable fixes for AEO]
            """
            
            response = self.client.chat.completions.create(
                model="gpt-4o",  # ✅ Using GPT-4o for best AEO analysis
                messages=[
                    {"role": "system", "content": "You are an expert AI Search Analyst. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            # Parse JSON response
            response_content = response.choices[0].message.content.strip()
            result = json.loads(response_content)
            
            # Calculate score based on understanding level
            scores = {'Poor': 25, 'Fair': 50, 'Good': 75, 'Excellent': 95}
            score = scores.get(result.get('understanding_level', 'Fair'), 50)
            
            return {
                'score': score,
                'understanding_level': result.get('understanding_level', 'Unknown'),
                'key_topics': result.get('key_topics', []),
                'clarity_score': result.get('clarity_score', 0),
                'main_issues': result.get('main_issues', []),
                'recommendations': result.get('recommendations', []),
                'ai_feedback': "Analyzed by GPT-4o"
            }
            
        except Exception as e:
            logging.error(f"OpenAI analysis failed (Swapping to Safe Mode): {str(e)}")
            # RETURN FALLBACK INSTEAD OF CRASHING
            return fallback_result

    # --- NEW METHOD START: Schema Generation ---
    def generate_schema(self, content: str, url: str, schema_type: str = 'auto') -> Dict:
        """Generate JSON-LD Schema (Safe Mode)"""
        if not self._is_available():
            return {'success': False, 'error': 'OpenAI key missing'}

        try:
            if len(content) > 10000: content = content[:10000]

            prompt = f"""Generate valid JSON-LD schema for this content. 
            URL: {url}
            Type preference: {schema_type}
            
            Return ONLY the JSON object.
            """

            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a Schema.org expert. Output strictly valid JSON-LD."},
                    {"role": "user", "content": prompt + "\n\nContent:\n" + content}
                ],
                response_format={"type": "json_object"}
            )
            
            schema = json.loads(response.choices[0].message.content)
            return {'success': True, 'schema': schema}
            
        except Exception as e:
            logging.error(f"Schema generation failed: {str(e)}")
            return {'success': False, 'error': f"Quota Exceeded (Safe Mode): {str(e)}"}
    # --- NEW METHOD END ---

    # --- EXISTING DEVELOPER CODE PRESERVED BELOW (Unchanged Logic, Added Safety) ---
    
    def analyze_tone_and_sentiment(self, content: str) -> Dict:
        """
        Analyze content tone and sentiment using OpenAI
        SAFE MODE: Returns mock data on failure.
        """
        # Default Fallback
        fallback_result = {
            'score': 50,
            'tone': 'Neutral (Safe Mode)',
            'sentiment': 'Neutral',
            'confidence': 0,
            'emotional_indicators': [],
            'recommendations': ['Check OpenAI Billing'],
            'ai_feedback': "Service Unavailable (Quota Exceeded)"
        }

        if not self._is_available():
            return fallback_result
        
        try:
            # Truncate content to reduce costs
            max_content_length = 1500
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            # Shorter prompt to reduce costs
            prompt = f"""Analyze tone and sentiment: {content}

Provide tone, sentiment, confidence (0-100), emotional indicators, and recommendations.

JSON:
{{
    "tone": "string",
    "sentiment": "string", 
    "confidence": number,
    "emotional_indicators": ["indicator1", "indicator2"],
    "recommendations": ["rec1", "rec2"]
}}"""
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Tone and sentiment analyst. JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                max_completion_tokens=300,
                temperature=0.3
            )
            
            response_content = response.choices[0].message.content.strip()
            logging.debug(f"OpenAI tone analysis response: {response_content[:200]}...")
            result = json.loads(response_content)
            
            # Calculate score based on sentiment and tone appropriateness
            sentiment_scores = {'Positive': 80, 'Neutral': 60, 'Negative': 20}
            tone_scores = {'Professional': 90, 'Academic': 85, 'Technical': 80, 'Friendly': 75, 'Casual': 60}
            
            sentiment_score = sentiment_scores.get(result.get('sentiment', 'Neutral'), 60)
            tone_score = tone_scores.get(result.get('tone', 'Casual'), 50)
            
            # Average the scores
            score = (sentiment_score + tone_score) // 2
            
            return {
                'score': score,
                'tone': result.get('tone', 'Unknown'),
                'sentiment': result.get('sentiment', 'Neutral'),
                'confidence': result.get('confidence', 0),
                'emotional_indicators': result.get('emotional_indicators', []),
                'recommendations': result.get('recommendations', []),
                'ai_feedback': response.choices[0].message.content
            }
            
        except Exception as e:
            logging.error(f"OpenAI tone analysis failed (Swapping to Safe Mode): {str(e)}")
            return fallback_result
    
    def analyze_answerability(self, content: str, questions: List[str] = None) -> Dict:
        """
        Analyze content answerability using AI feedback
        SAFE MODE: Returns mock data on failure.
        """
        # Default Fallback
        fallback_result = {
            'score': 50,
            'ai_answerability_score': 50,
            'answered_questions': [],
            'unanswered_questions': [],
            'clarity_issues': ['Quota Exceeded'],
            'recommendations': ['Check OpenAI Billing'],
            'gpt_feedback': 'Service Unavailable'
        }

        if not self._is_available():
            return fallback_result
        
        try:
            # Truncate content to reduce costs
            max_content_length = 1500
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            # Generate questions if not provided
            if not questions:
                questions = [
                    "What is the main topic?",
                    "What problem does this solve?",
                    "What are the key benefits?",
                    "What action should be taken?"
                ]
            
            # Shorter prompt to reduce costs
            prompt = f"""Analyze answerability: {content}

Questions: {', '.join(questions)}

Rate how well content answers questions (0-100), what's answered clearly, what's unclear, and recommendations.

JSON:
{{
    "ai_answerability_score": number,
    "answered_questions": ["q1", "q2"],
    "unanswered_questions": ["q1", "q2"],
    "clarity_issues": ["issue1", "issue2"],
    "recommendations": ["rec1", "rec2"]
}}"""
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Answerability analyst. JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                max_completion_tokens=400,
                temperature=0.3
            )
            
            response_content = response.choices[0].message.content.strip()
            logging.debug(f"OpenAI answerability response: {response_content[:200]}...")
            result = json.loads(response_content)
            
            return {
                'score': result.get('ai_answerability_score', 0),
                'ai_answerability_score': result.get('ai_answerability_score', 0),
                'answered_questions': result.get('answered_questions', []),
                'unanswered_questions': result.get('unanswered_questions', []),
                'clarity_issues': result.get('clarity_issues', []),
                'recommendations': result.get('recommendations', []),
                'gpt_feedback': response.choices[0].message.content
            }
            
        except Exception as e:
            logging.error(f"OpenAI answerability analysis failed (Swapping to Safe Mode): {str(e)}")
            return fallback_result
    
    def generate_content_summary(self, content: str, max_length: int = 200) -> str:
        """
        Generate AI-powered content summary
        SAFE MODE: Returns simple string on failure.
        """
        if not self._is_available():
            return "OpenAI service not available for summarization"
        
        try:
            # Truncate content to reduce costs
            max_content_length = 1000
            if len(content) > max_content_length:
                content = content[:max_content_length] + "..."
            
            # Shorter prompt to reduce costs
            prompt = f"""Summarize in {max_length} chars: {content}"""
            
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Concise summarizer."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=200,
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logging.error(f"OpenAI summarization failed: {str(e)}")
            return "Summary unavailable (Quota Exceeded)"
      
    def analyze_content_metrics(self, content: str, url: str) -> Dict:
        """
        Analyze three key metrics + prompt intent clustering:
        1. Accuracy of content type suggestion
        2. Match with prompt intent
        3. Potential impact on visibility
        4. Prompt clusters across intent types (informational, commercial, comparative, transactional, agent-style)
        
        Returns comprehensive metrics for AEO optimization, including:
        - High-level scores (content_type_accuracy, prompt_intent_match, visibility_impact)
        - Prompt intent details with:
          - matched_intents
          - confidence
          - search_queries
          - intent_clusters (per-intent counts and examples)
          - cluster_metrics (accuracy, coverage, totals)
        """
        fallback_result = {
            'content_type_accuracy': 50,
            'prompt_intent_match': 50,
            'visibility_impact': 50,
            'suggested_content_type': 'Unknown (Safe Mode)',
            'prompt_intent_details': {
                'matched_intents': [],
                'confidence': 0,
                'search_queries': [],
                'intent_clusters': {
                    'informational': {'prompt_count': 0, 'example_prompts': []},
                    'commercial': {'prompt_count': 0, 'example_prompts': []},
                    'comparative': {'prompt_count': 0, 'example_prompts': []},
                    'transactional': {'prompt_count': 0, 'example_prompts': []},
                    'agent_style': {'prompt_count': 0, 'example_prompts': []},
                },
                'cluster_metrics': {
                    'total_prompts': 0,
                    'categorized_prompts': 0,
                    'coverage_percentage': 0.0,
                    'clustering_accuracy': 0.0,
                },
            },
            'visibility_factors': {
                'factors': ['Service Unavailable'],
                'score_breakdown': {},
                'recommendations': ['Check OpenAI Billing']
            }
        }

        if not self._is_available():
            return fallback_result
        
        try:
            # Truncate content for cost efficiency
            if len(content) > 12000:
                content = content[:12000] + "..."
            
            prompt = f"""You are an AEO (Answer Engine Optimization) Expert. Analyze this content from {url}.

Content:
{content}

Analyze and return a JSON object with:

1. **Content Type Accuracy** (0-100): How accurately can you identify the content type?
   - Analyze: blog post, product page, FAQ, landing page, article, tutorial, documentation, etc.
   - Consider: structure, formatting, headings, call-to-actions, metadata
   - Score: 0-100 based on how clear/obvious the content type is

2. **Prompt Intent Match** (0-100): How well does this content match user search intent?
   - Primary intent types to consider:
     - informational
     - commercial (commercial investigation, product/service research)
     - comparative (comparing options or alternatives)
     - transactional (purchase or action-focused)
     - agent_style (chatbot/assistant style queries or interactions)
   - Consider: question patterns, keyword alignment, user journey stage
   - Score: 0-100 based on how well content satisfies likely search queries

3. **Visibility Impact** (0-100): Potential impact on search visibility/ranking
   - Factors: keyword relevance, content depth, freshness, authority signals, schema markup potential
   - Consider: uniqueness, comprehensiveness, E-A-T signals, technical SEO
   - Score: 0-100 based on potential to rank and gain visibility

4. **Prompt Intent Clusters**: Examine the implicit and explicit prompts/queries a user might ask that this content answers.
   - Cluster those prompts into the 5 intent types above.
   - For each cluster, estimate:
       - prompt_count: how many prompts you would assign to this cluster
       - example_prompts: list of 1-3 example natural-language prompts typical for this intent on this page
   - Also calculate:
       - total_prompts: total prompts you considered across all clusters
       - categorized_prompts: how many of those prompts you could confidently assign to one of the 5 clusters
       - coverage_percentage: (categorized_prompts / max(total_prompts,1)) * 100, rounded to 1 decimal place
       - clustering_accuracy: your estimated accuracy (0-1 range) of the clustering you produced

Return JSON:
{{
    "content_type_accuracy": number,
    "suggested_content_type": "string (e.g., 'blog', 'product', 'faq', 'landing_page')",
    "prompt_intent_match": number,
    "prompt_intent_details": {{
        "matched_intents": ["informational", "transactional", "commercial", "comparative", "agent_style"],
        "confidence": number (0-100),
        "search_queries": ["example query 1", "example query 2"],
        "intent_clusters": {{
            "informational": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
            "commercial": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
            "comparative": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
            "transactional": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
            "agent_style": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}}
        }},
        "cluster_metrics": {{
            "total_prompts": number,
            "categorized_prompts": number,
            "coverage_percentage": number,
            "clustering_accuracy": number
        }}
    }},
    "visibility_impact": number,
    "visibility_factors": {{
        "factors": ["factor1", "factor2"],
        "score_breakdown": {{
            "keyword_relevance": number,
            "content_depth": number,
            "freshness": number,
            "authority_signals": number
        }},
        "recommendations": ["rec1", "rec2"]
    }}
}}"""

            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert AEO analyst. Output JSON only with accurate metrics."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            response_content = response.choices[0].message.content.strip()
            result = json.loads(response_content)
            
            prompt_intent_details = result.get('prompt_intent_details', {}) or {}

            # Ensure nested structures exist so frontend can safely rely on them
            intent_clusters = prompt_intent_details.get('intent_clusters') or {
                'informational': {'prompt_count': 0, 'example_prompts': []},
                'commercial': {'prompt_count': 0, 'example_prompts': []},
                'comparative': {'prompt_count': 0, 'example_prompts': []},
                'transactional': {'prompt_count': 0, 'example_prompts': []},
                'agent_style': {'prompt_count': 0, 'example_prompts': []},
            }
            cluster_metrics = prompt_intent_details.get('cluster_metrics') or {
                'total_prompts': 0,
                'categorized_prompts': 0,
                'coverage_percentage': 0.0,
                'clustering_accuracy': 0.0,
            }

            # Backfill into prompt_intent_details object
            prompt_intent_details.setdefault('matched_intents', [])
            prompt_intent_details.setdefault('confidence', 0)
            prompt_intent_details.setdefault('search_queries', [])
            prompt_intent_details['intent_clusters'] = intent_clusters
            prompt_intent_details['cluster_metrics'] = cluster_metrics

            visibility_factors = result.get('visibility_factors', {}) or {}
            visibility_factors.setdefault('factors', [])
            visibility_factors.setdefault('score_breakdown', {})
            visibility_factors.setdefault('recommendations', [])

            return {
                'content_type_accuracy': result.get('content_type_accuracy', 50),
                'prompt_intent_match': result.get('prompt_intent_match', 50),
                'visibility_impact': result.get('visibility_impact', 50),
                'suggested_content_type': result.get('suggested_content_type', 'Unknown'),
                'prompt_intent_details': prompt_intent_details,
                'visibility_factors': visibility_factors,
            }
            
        except Exception as e:
            logging.error(f"Content metrics analysis failed (Safe Mode): {str(e)}")
            return fallback_result
    
    def analyze_entity_relevance(self, content: str, url: str, found_entities: list, expected_entities: list) -> Dict:
        """
        Analyze how relevant the found entities are to the user's search intent/prompt.
        Returns relevance score (0-100) based on how well entities match search intent.
        """
        fallback_result = {
            'entity_relevance_score': 50,
            'relevance_explanation': 'Analysis unavailable',
            'relevant_entities': [],
            'irrelevant_entities': []
        }
        
        if not self._is_available():
            return fallback_result
        
        try:
            if len(content) > 10000:
                content = content[:10000] + "..."
            
            # Prepare entity lists
            found_str = ", ".join(found_entities[:20]) if found_entities else "None"
            expected_str = ", ".join(expected_entities[:20]) if expected_entities else "None"
            
            prompt = f"""You are an AEO (Answer Engine Optimization) Expert. Analyze entity relevance for content from {url}.

Content Preview:
{content}

Found Entities: {found_str}
Expected Entities: {expected_str}

Analyze how RELEVANT the found entities are to typical user search queries and search intent for this content.

Return JSON:
{{
    "entity_relevance_score": number (0-100),
    "relevance_explanation": "string explaining relevance",
    "relevant_entities": ["list of entities highly relevant to search intent"],
    "irrelevant_entities": ["list of entities that don't match search intent well"]
}}

Scoring Guide:
- 80-100: Entities perfectly match search intent and user queries
- 60-79: Most entities are relevant, some minor gaps
- 40-59: Mixed relevance, some entities don't match intent
- 0-39: Entities poorly match search intent"""
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert AEO analyst. Output JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            response_content = response.choices[0].message.content.strip()
            result = json.loads(response_content)
            
            return {
                'entity_relevance_score': result.get('entity_relevance_score', 50),
                'relevance_explanation': result.get('relevance_explanation', ''),
                'relevant_entities': result.get('relevant_entities', []),
                'irrelevant_entities': result.get('irrelevant_entities', [])
            }
            
        except Exception as e:
            logging.error(f"Entity relevance analysis failed: {str(e)}")
            return fallback_result

    def calculate_prompt_tracking_metrics(self, job_id: str, url: str, prompts: List[str]) -> Dict:
        mongo_manager.connect()

        cleaned_prompts = []
        for p in prompts or []:
            if isinstance(p, str):
                s = p.strip()
                if s:
                    cleaned_prompts.append(s)

        prompt_tracking_col = mongo_manager.db.prompt_tracking
        existing = prompt_tracking_col.find_one({"jobId": job_id}) or {}

        existing_tracked = existing.get("tracked_prompts") or []
        tracked_prompts = sorted(set([p for p in existing_tracked if isinstance(p, str) and p.strip()] + cleaned_prompts))

        content_doc = mongo_manager.content_metrics.find_one({"jobId": job_id, "url": url}) or {}
        content_metrics = content_doc.get("content_metrics") or {}
        prompt_intent_details = content_metrics.get("prompt_intent_details") or {}
        linked_queries = prompt_intent_details.get("search_queries") or []
        if not isinstance(linked_queries, list):
            linked_queries = []
        linked_queries = [q for q in linked_queries if isinstance(q, str) and q.strip()]

        module_e_doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
        ranking_analysis = module_e_doc.get("ranking_analysis") or {}
        ranking_rows = ranking_analysis.get("ranking_position_per_prompt") or []
        if not isinstance(ranking_rows, list):
            ranking_rows = []

        raw_html = ""
        try:
            raw_html = load_raw_html_sync(job_id) or ""
        except Exception:
            raw_html = ""

        visible_text = ""
        heading_text = ""
        if raw_html and BeautifulSoup is not None:
            try:
                soup = BeautifulSoup(raw_html, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                title_text = ""
                try:
                    title_text = soup.title.get_text(" ", strip=True) if soup.title else ""
                except Exception:
                    title_text = ""
                try:
                    h_nodes = soup.find_all(["h1", "h2"], limit=8)
                    heading_text = " ".join([h.get_text(" ", strip=True) for h in h_nodes if h])
                except Exception:
                    heading_text = ""
                visible_text = soup.get_text(separator=" ", strip=True)
                visible_text = " ".join((visible_text or "").split())
            except Exception:
                visible_text = ""
                heading_text = ""

        page_prompt_intent_match = content_metrics.get("prompt_intent_match")
        page_visibility_impact = content_metrics.get("visibility_impact")
        page_scores: List[float] = []
        if isinstance(page_prompt_intent_match, (int, float)):
            page_scores.append(float(page_prompt_intent_match))
        if isinstance(page_visibility_impact, (int, float)):
            page_scores.append(float(page_visibility_impact))
        page_quality_score = round(sum(page_scores) / len(page_scores), 2) if page_scores else 50.0

        stopwords = {
            "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "at", "by", "from", "as",
            "is", "are", "was", "were", "be", "been", "being", "it", "this", "that", "these", "those",
            "i", "you", "we", "they", "he", "she", "them", "us", "our", "your", "my", "me",
            "what", "how", "why", "when", "where", "who", "which",
            "best", "top", "near", "vs", "versus",
        }

        def tokenize(text: str) -> List[str]:
            toks = re.findall(r"[a-z0-9]+", (text or "").lower())
            return [t for t in toks if len(t) > 2 and t not in stopwords]

        content_token_list = tokenize(visible_text[:30000]) if visible_text else []
        content_tokens = set(content_token_list) if content_token_list else set()
        heading_tokens = set(tokenize(heading_text)) if heading_text else set()
        query_tokens = [set(tokenize(q)) for q in linked_queries[:50]]

        def similarity_to_queries(prompt_tokens: set) -> float:
            if not prompt_tokens:
                return 0.0
            best = 0.0
            for qt in query_tokens:
                if not qt:
                    continue
                inter = len(prompt_tokens.intersection(qt))
                score = inter / max(len(prompt_tokens), 1)
                if score > best:
                    best = score
            return best

        content_counts: Dict[str, int] = {}
        for t in content_token_list:
            content_counts[t] = content_counts.get(t, 0) + 1
        total_terms = len(content_token_list)
        max_idf = (math.log(total_terms + 1) + 1.0) if total_terms > 0 else 1.0

        def idf_norm(tf: int) -> float:
            return (math.log((total_terms + 1) / (tf + 1)) + 1.0) / max_idf if max_idf > 0 else 0.0

        def content_relevance(prompt_tokens: List[str]) -> float:
            toks = sorted(set(prompt_tokens))
            if not toks:
                return 0.0
            denom = float(len(toks))
            tf_cap = 8
            strength_den = math.log(1 + tf_cap)
            s = 0.0
            for tok in toks:
                tf = content_counts.get(tok, 0)
                if tf <= 0:
                    continue
                strength = math.log(1 + tf) / strength_den if strength_den > 0 else 0.0
                if strength > 1.0:
                    strength = 1.0
                s += idf_norm(tf) * strength
            return s / denom

        def clamp(n: float, lo: float, hi: float) -> float:
            return max(lo, min(hi, n))

        def position_to_visibility(position: Optional[float]) -> float:
            if position is None:
                return 0.0
            try:
                p = int(position)
            except Exception:
                return 0.0
            if p <= 0 or p > 10:
                return 0.0
            return round(((11 - p) / 10) * 100, 2)

        history = existing.get("history") or {}
        if not isinstance(history, dict):
            history = {}

        now = datetime.utcnow().isoformat()
        metrics: List[Dict] = []

        for prompt in tracked_prompts:
            rows = [r for r in ranking_rows if isinstance(r, dict) and (r.get("prompt") or "") == prompt]

            model_ranking: Dict[str, Optional[int]] = {}
            visibility_components: List[float] = []
            engagement_components: List[float] = []
            traffic_components: List[float] = []

            for r in rows:
                model = r.get("model")
                if isinstance(model, str) and model:
                    pos = r.get("position")
                    model_ranking[model] = int(pos) if isinstance(pos, (int, float)) else None
                visibility_components.append(position_to_visibility(r.get("position")))

                cq = r.get("content_quality_score")
                cr = r.get("credibility_score")
                vals: List[float] = []
                if isinstance(cq, (int, float)):
                    vals.append(float(cq))
                if isinstance(cr, (int, float)):
                    vals.append(float(cr))
                if vals:
                    engagement_components.append(sum(vals) / len(vals))

                total_cited = r.get("total_cited")
                citation_count = r.get("citation_count")
                if isinstance(citation_count, (int, float)):
                    traffic_components.append(float(citation_count))
                elif isinstance(total_cited, (int, float)):
                    traffic_components.append(float(total_cited))

            prompt_visibility_score = (
                round(sum(visibility_components) / len(visibility_components), 2) if visibility_components else 0.0
            )
            engagement_score = (
                round(sum(engagement_components) / len(engagement_components), 2) if engagement_components else page_quality_score
            )
            traffic_estimate = (
                round(sum(traffic_components) / len(traffic_components), 2) if traffic_components else 0.0
            )
            ctr_percent = round((prompt_visibility_score / 100) * (engagement_score / 100) * 25, 2)

            if not rows:
                ptok_list = tokenize(prompt)
                ptok_set = set(ptok_list)
                qsim = similarity_to_queries(ptok_set)
                csim = content_relevance(ptok_list)
                hsim = (len(ptok_set.intersection(heading_tokens)) / max(len(ptok_set), 1)) if heading_tokens and ptok_set else 0.0

                phrase_bonus = 0.0
                if visible_text and prompt and len(prompt.split()) >= 2:
                    try:
                        phrase_bonus = 0.15 if prompt.lower() in visible_text.lower() else 0.0
                    except Exception:
                        phrase_bonus = 0.0

                relevance = clamp((0.6 * csim) + (0.25 * qsim) + (0.15 * hsim) + phrase_bonus, 0, 1)
                if len(ptok_set) == 1:
                    single = next(iter(ptok_set), "")
                    tf = content_counts.get(single, 0)
                    if tf > 0 and idf_norm(tf) < 0.18:
                        relevance = min(relevance, 0.35)
                    relevance *= 0.75

                prompt_visibility_score = round(clamp(10 + 90 * relevance * (0.55 + (page_quality_score / 220)), 0, 100), 2)
                engagement_score = round(clamp(30 + 70 * ((page_quality_score / 100) * 0.6 + relevance * 0.4), 0, 100), 2)
                traffic_estimate = round(clamp((prompt_visibility_score / 100) * (engagement_score / 100) * (5 + min(len(linked_queries), 20) / 2), 0, 25), 2)
                ctr_percent = round(clamp((prompt_visibility_score / 100) * (engagement_score / 100) * 30, 0, 30), 2)

            prompt_history = history.get(prompt) or []
            if not isinstance(prompt_history, list):
                prompt_history = []

            trend_point = {
                "date": now,
                "visibility_score": prompt_visibility_score,
                "ctr_percent": ctr_percent,
                "engagement_score": engagement_score,
                "traffic_estimate": traffic_estimate,
            }
            prompt_history.append(trend_point)
            prompt_history = prompt_history[-60:]
            history[prompt] = prompt_history

            previous = prompt_history[-2] if len(prompt_history) >= 2 else None
            visibility_change = None
            if previous and isinstance(previous.get("visibility_score"), (int, float)):
                visibility_change = round(prompt_visibility_score - float(previous["visibility_score"]), 2)

            metrics.append(
                {
                    "prompt": prompt,
                    "prompt_visibility_score": prompt_visibility_score,
                    "ctr_percent": ctr_percent,
                    "engagement_score": engagement_score,
                    "traffic_estimate": traffic_estimate,
                    "ai_model_ranking": model_ranking,
                    "linked_queries": linked_queries,
                    "visibility_change": visibility_change,
                    "trend": prompt_history[-14:],
                    "updated_at": now,
                    "calculation_method": "ranking" if rows else "estimated",
                }
            )

        doc = {
            "jobId": job_id,
            "url": url,
            "tracked_prompts": tracked_prompts,
            "metrics": metrics,
            "history": history,
            "updatedAt": datetime.utcnow(),
        }

        prompt_tracking_col.update_one(
            {"jobId": job_id},
            {"$set": doc, "$setOnInsert": {"createdAt": datetime.utcnow()}},
            upsert=True,
        )

        doc["updatedAt"] = now
        doc["createdAt"] = (existing.get("createdAt") or datetime.utcnow()).isoformat() if hasattr((existing.get("createdAt") or datetime.utcnow()), "isoformat") else now
        return doc
