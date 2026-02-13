import re
import json
import logging
from typing import Dict, List
from bs4 import BeautifulSoup
from orchestrator.checkpoint.executor import execute_task

class KnowledgeBaseModule:
    """
    Analyzes content for entities, fact density, and clarity.
    """
    def __init__(self):
        pass

    async def _analyze_entity_coverage(self, text: str, url: str) -> Dict:
        """Use AI to find missing entities and classify them"""
        prompt = f"""
        Analyze 'Entity Coverage' for AEO (Answer Engine Optimization).
        URL: {url}
        
        1. Identify the Main Topic.
        2. List 5-10 entities that MUST be present for a complete answer.
        3. Check if they are in the content.
        4. Classify each entity by Type (Person, Product, Location, Concept, Event, Organization).
        5. Assign a Relevance Score (1-10) for how critical the entity is to the topic.
        
        Return JSON ONLY:
        {{
            "topic": "string",
            "coverage_score": 0-100,
            "entites_analysis": [
                {{
                    "entity": "string",
                    "type": "string",
                    "relevance_score": 1-10,
                    "status": "Found" | "Missing",
                    "importance": "Critical" | "Minor"
                }}
            ],
            "recommendations": [
                {{
                    "action": "string",
                    "priority": "High" | "Medium" | "Low",
                    "impact": 1-10
                }}
            ],
            "found_entities": ["list of entity names"],
            "missing_entities": ["list of entity names"],
            "relevance_explanation": "string"
        }}
        
        Content:
        {text[:6000]}
        """
        
        resp = await execute_task(
            task_name="aeo_knowledge_base_audit",
            input_data={"messages": [{"role": "user", "content": prompt}]}, 
            provider="openai", # Defaulting to OpenAI for best entity logic
            options={"model": "gpt-4o-mini"} # Using 4o-mini for speed/cost balance
        )
        
        if resp.success:
            try:
                content = resp.data
                if "```json" in content: content = content.split("```json")[1].split("```")[0]
                elif "```" in content: content = content.split("```")[1].split("```")[0]
                
                return json.loads(content)
            except Exception as e:
                logging.error(f"Failed to parse entity analysis: {e}")
                return {}
        return {}

    def _calculate_fact_density(self, text: str) -> float:
        # Simple regex based fact density
        fact_indicators = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b',
            r'\b(?:19|20)\d{2}\b', # Years
            r'\b\d+%\b'
        ]
        matches = 0
        for pat in fact_indicators:
            matches += len(re.findall(pat, text))
        
        words = len(text.split())
        return (matches / words * 100) if words > 0 else 0

    async def run_analysis(self, html_content: str, url: str) -> Dict:
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            text_content = soup.get_text()
            
            # 1. Fact Density
            fact_density = self._calculate_fact_density(text_content)
            
            # 2. Entity Analysis (AI)
            entity_data = await self._analyze_entity_coverage(text_content, url)
            
            # 3. Scoring
            score = 0
            if entity_data:
                score += entity_data.get('coverage_score', 0) * 0.6
            score += min(40, fact_density * 10)
            
            return {
                "score": int(min(100, score)),
                "fact_density": fact_density,
                "entity_coverage": entity_data
            }
        except Exception as e:
            logging.error(f"Knowledge Base Error: {e}")
            return {"score": 0, "error": str(e)}
