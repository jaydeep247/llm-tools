import re
import json
import logging
from typing import Dict, List
from enum import Enum
from bs4 import BeautifulSoup
from orchestrator.checkpoint.executor import execute_task

# Entity Type Enum for strict validation
class EntityType(str, Enum):
    PERSON = "Person"
    PRODUCT = "Product"
    LOCATION = "Location"
    CONCEPT = "Concept"
    EVENT = "Event"
    ORGANIZATION = "Organization"
    UNKNOWN = "Unknown"

VALID_ENTITY_TYPES = {e.value for e in EntityType}

class KnowledgeBaseModule:
    """
    Analyzes content for entities, fact density, and clarity.
    """
    def __init__(self):
        pass

    def _validate_and_normalize_entity_type(self, entity_type: str) -> str:
        """
        Validate and normalize entity type to match predefined categories.
        Returns normalized type or 'Unknown' if invalid.
        """
        # Normalize to title case
        normalized = entity_type.strip().title()
        
        # Check if valid
        if normalized in VALID_ENTITY_TYPES:
            return normalized
        
        # Try fuzzy matching for common variations
        type_mapping = {
            "person": EntityType.PERSON.value,
            "people": EntityType.PERSON.value,
            "individual": EntityType.PERSON.value,
            "product": EntityType.PRODUCT.value,
            "service": EntityType.PRODUCT.value,
            "tool": EntityType.PRODUCT.value,
            "app": EntityType.PRODUCT.value,
            "application": EntityType.PRODUCT.value,
            "location": EntityType.LOCATION.value,
            "place": EntityType.LOCATION.value,
            "concept": EntityType.CONCEPT.value,
            "idea": EntityType.CONCEPT.value,
            "technology": EntityType.CONCEPT.value,
            "event": EntityType.EVENT.value,
            "organization": EntityType.ORGANIZATION.value,
            "company": EntityType.ORGANIZATION.value,
            "org": EntityType.ORGANIZATION.value,
            "business": EntityType.ORGANIZATION.value,
        }
        
        return type_mapping.get(entity_type.lower(), EntityType.UNKNOWN.value)

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
                
                data = json.loads(content)
                
                # VALIDATE AND NORMALIZE ENTITY TYPES
                if 'entites_analysis' in data:
                    for entity in data['entites_analysis']:
                        if 'type' in entity:
                            original_type = entity['type']
                            entity['type'] = self._validate_and_normalize_entity_type(original_type)
                            
                            # Log if type was changed for debugging
                            if entity['type'] != original_type:
                                logging.debug(f"Normalized entity type: '{original_type}' -> '{entity['type']}'")
                
                # Calculate expected entities (Union of found + missing)
                found = data.get('found_entities', [])
                missing = data.get('missing_entities', [])
                # Use set to avoid duplicates if any overlap
                expected = list(set(found + missing))
                data['expected_entities'] = expected

                # Calculate Critical vs Minor counts
                critical_count = 0
                minor_count = 0
                if 'entites_analysis' in data:
                    for entity in data['entites_analysis']:
                        importance = entity.get('importance', 'Minor')
                        if importance == 'Critical':
                            critical_count += 1
                        else:
                            minor_count += 1
                
                data['critical_entities_count'] = critical_count
                data['minor_entities_count'] = minor_count

                # Calculate Gap Percentage
                total_expected = len(expected)
                missing_count = len(missing)
                gap_percentage = (missing_count / total_expected * 100) if total_expected > 0 else 0
                data['gap_percentage'] = round(gap_percentage, 1)
                
                return data
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
