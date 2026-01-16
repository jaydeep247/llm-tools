"""
Knowledge Base Analysis Service
Analyzes content for entities, facts, and clarity
"""

import re
import json
import logging
from typing import Dict, List, Set
from urllib.parse import urlparse

# --- Import OpenAI Service ---
try:
    from .openai_service import OpenAIService
except ImportError:
    try:
        from openai_service import OpenAIService
    except ImportError:
        import sys
        import os
        sys.path.append(os.path.dirname(__file__))
        from openai_service import OpenAIService

class KnowledgeBaseService:
    """Service for analyzing knowledge base and content quality"""
    
    def __init__(self):
        self.openai_service = OpenAIService()

        self.entity_patterns = {
            'people': r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',
            'places': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b',
            'organizations': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Inc|Corp|LLC|Ltd|Pvt|Limited|Company|Organization|Organics|Foods|Tea|Store|Shop|Brand|Solutions|Technologies|Group)\b',
            'products': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Tea|Coffee|Powder|Oil|Masala|Pack|Box|Kit|Software|App|Platform|Tool)\b',
            'dates': r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            'years': r'\b(?:19|20)\d{2}\b',
            'percentages': r'\b\d+(?:\.\d+)?%\b',
            'numbers': r'\b\d+(?:,\d{3})*(?:\.\d+)?\b'
        }
    
    def _extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract entities from text using regex patterns"""
        entities = {}
        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            entities[entity_type] = list(set(matches))  # Remove duplicates
        return entities

    # --- UPDATED: Uses gpt-4o-mini to solve RATE LIMIT error ---
    def _analyze_entity_coverage(self, content: str, url: str) -> Dict:
        """
        Use GPT-4o-mini to find MISSING entities (Cost Efficient).
        """
        if not self.openai_service or not self.openai_service._is_available():
            return {}

        try:
            # Truncate content slightly more to save tokens
            truncated_content = content[:6000]

            prompt = f"""
            Analyze the 'Entity Coverage' of this content for AEO.
            URL: {url}
            
            1. Identify the Main Topic.
            2. List 5-10 entities that MUST be present for this topic.
            3. Check if they are in the content.
            4. Return JSON:
               - "topic": "string"
               - "coverage_score": 0-100
               - "found_entities": ["list"]
               - "missing_entities": ["list"]
               - "relevance_explanation": "string"
            
            Content:
            {truncated_content}
            """
            
            response = self.openai_service.client.chat.completions.create(
                model="gpt-4o-mini",  # <--- CHANGED FROM gpt-4o TO gpt-4o-mini
                messages=[
                    {"role": "system", "content": "You are an Entity Analysis AI. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                max_completion_tokens=500,
                temperature=0.3
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            # Handle rate limits gracefully so it doesn't crash the loop
            if "429" in str(e):
                logging.error("OpenAI Rate Limit hit in Knowledge Base.")
            else:
                logging.error(f"Entity coverage analysis failed: {e}")
            return {}
    
    # --- EXISTING HELPERS (UNCHANGED) ---
    def _count_syllables(self, word: str) -> int:
        word = word.lower()
        count = 0
        vowels = "aeiouy"
        if len(word) == 0: return 0
        if word[0] in vowels: count += 1
        for i in range(1, len(word)):
            if word[i] in vowels and word[i - 1] not in vowels:
                count += 1
        if word.endswith("e"): count -= 1
        if count == 0: count += 1
        return count

    def _calculate_flesch_kincaid(self, text: str) -> float:
        words = re.findall(r'\b\w+\b', text)
        sentences = re.split(r'[.!?]+', text)
        sentences = [s for s in sentences if len(s.strip()) > 0]
        
        total_words = len(words)
        total_sentences = len(sentences)
        
        if total_words == 0 or total_sentences == 0: return 0.0
            
        total_syllables = sum(self._count_syllables(w) for w in words)
        asl = total_words / total_sentences
        asw = total_syllables / total_words
        score = 206.835 - (1.015 * asl) - (84.6 * asw)
        return min(100, max(0, score))
    
    def _calculate_fact_density(self, text: str) -> float:
        fact_indicators = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            r'\b(?:19|20)\d{2}\b',
            r'\b\d+(?:\.\d+)?%\b',
            r'\b(?:million|billion|thousand|hundred)\b',
            r'\b(?:according to|studies show|research indicates|data shows)\b'
        ]
        total_facts = 0
        for pattern in fact_indicators:
            total_facts += len(re.findall(pattern, text, re.IGNORECASE))
        word_count = len(text.split())
        return (total_facts / word_count * 100) if word_count > 0 else 0
    
    def _extract_facts(self, text: str) -> List[Dict[str, str]]:
        sentences = re.split(r'[.!?]+\s+', text)
        sentences = [s.strip() for s in sentences if s and len(s.strip()) > 0]

        fact_triggers = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            r'\b(?:19|20)\d{2}\b',
            r'\b\d+(?:\.\d+)?%\b',
            r'\b(?:according to|studies show|research indicates|data shows)\b',
        ]
        noise_patterns = [
            r'\b(?:window|document|function|var|let|const|gtag|dataLayer|google-analytics|googletag)\b',
            r'\b(?:jQuery|\$\(|owlCarousel|addEventListener|onclick|script)\b',
            r'\bmailto:|@\w+\.\w+\b',
            r'\{\s*\}|=>|<\/?\w+[^>]*>'
        ]

        facts: List[Dict[str, str]] = []
        for s in sentences:
            trigger_matched = None
            for pat in fact_triggers:
                if re.search(pat, s, re.IGNORECASE):
                    trigger_matched = pat
                    break
            if trigger_matched:
                if any(re.search(pn, s, re.IGNORECASE) for pn in noise_patterns): continue
                if not re.search(r'[A-Za-z]', s): continue
                if len(s.split()) < 6: continue
                facts.append({'statement': s[:300], 'trigger': trigger_matched})
        return facts[:50]
    
    def _assess_clarity(self, text: str) -> Dict[str, float]:
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        if not sentences: return {'avg_sentence_length': 0, 'clarity_score': 0}
        
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)
        clarity_indicators = [
            r'\b(?:therefore|however|moreover|furthermore|consequently)\b',
            r'\b(?:for example|for instance|such as|including)\b',
            r'\b(?:in other words|that is|specifically)\b',
            r'\b(?:first|second|third|finally|next|then)\b'
        ]
        clarity_score = 0
        for pattern in clarity_indicators:
            clarity_score += len(re.findall(pattern, text, re.IGNORECASE))
        
        clarity_score = min(100, (clarity_score / len(sentences)) * 20)
        return {
            'avg_sentence_length': avg_sentence_length,
            'clarity_score': clarity_score,
            'sentence_count': len(sentences)
        }
    
    def _assess_linkability(self, text: str) -> Dict[str, int]:
        linkable_terms = [
            r'\b(?:website|site|page|article|blog|post)\b',
            r'\b(?:company|organization|business|firm)\b',
            r'\b(?:product|service|solution|offering)\b',
            r'\b(?:contact|email|phone|address)\b',
            r'\b(?:learn more|read more|find out|discover)\b'
        ]
        linkability_score = 0
        for pattern in linkable_terms:
            linkability_score += len(re.findall(pattern, text, re.IGNORECASE))
        return {
            'linkability_score': min(100, linkability_score * 5),
            'linkable_terms_found': linkability_score
        }
    
    def _analyze_format_usage(self, text: str) -> Dict[str, int]:
        formats = {
            'headings': len(re.findall(r'^#{1,6}\s+', text, re.MULTILINE)),
            'lists': len(re.findall(r'^\s*[-*+]\s+', text, re.MULTILINE)) + len(re.findall(r'^\s*\d+\.\s+', text, re.MULTILINE)),
            'bold': len(re.findall(r'\*\*[^*]+\*\*', text)) + len(re.findall(r'__[^_]+__', text)),
            'italic': len(re.findall(r'\*[^*]+\*', text)) + len(re.findall(r'_[^_]+_', text)),
            'code': len(re.findall(r'`[^`]+`', text)),
            'links': len(re.findall(r'\[([^\]]+)\]\([^)]+\)', text))
        }
        return formats

    def analyze_knowledge_base(self, url: str, html_content: str) -> Dict:
        """Analyze knowledge base quality and content structure"""
        try:
            from ..module_B.nlp_utils import calculate_difficulty_score, calculate_complexity_level, calculate_ai_generation_feasibility
            
            # Clean HTML
            cleaned = re.sub(r'', ' ', html_content, flags=re.DOTALL)
            cleaned = re.sub(r'<script[\s\S]*?</script>', ' ', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'<style[\s\S]*?</style>', ' ', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'<noscript[\s\S]*?</noscript>', ' ', cleaned, flags=re.IGNORECASE)
            text_content = re.sub(r'<[^>]+>', ' ', cleaned)
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            
            if not text_content:
                return {
                    'score': 0,
                    'error': 'No text content found',
                    'entities': {},
                    'fact_density': 0,
                    'clarity': {},
                    'linkability': {},
                    'format_usage': {},
                    'metrics': {
                        'difficulty_score': 0,
                        'complexity_level': 'Low',
                        'ai_generation_feasibility': 0
                    },
                    'recommendations': ['Add more text content']
                }
            
            # --- EXISTING METRICS ---
            entities = self._extract_entities(text_content)
            fact_density = self._calculate_fact_density(text_content)
            clarity_metrics = self._assess_clarity(text_content)
            linkability_metrics = self._assess_linkability(text_content)
            format_usage = self._analyze_format_usage(text_content)
            facts = self._extract_facts(text_content)
            
            # Calculate NEW METRICS
            difficulty_score = calculate_difficulty_score(text_content)
            
            # Parse HTML for structural elements
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            structural_elements = len(soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table']))
            
            complexity_level = calculate_complexity_level(
                difficulty_score,
                len(text_content),
                structural_elements
            )
            
            ai_generation_feasibility = calculate_ai_generation_feasibility(
                text_content,
                structure_score=clarity_metrics.get('clarity_score', 50),
                faq_score=50,  # Knowledge base doesn't have FAQ score
                clarity_score=clarity_metrics.get('clarity_score', 50)
            )
            readability_score = self._calculate_flesch_kincaid(text_content)
            
            # --- UPDATED: Call New Function (gpt-4o-mini) ---
            entity_coverage = self._analyze_entity_coverage(text_content, url)
            # ------------------------------------------------

            # Calculate overall score
            score = 0
            if entity_coverage and 'coverage_score' in entity_coverage:
                 score += entity_coverage['coverage_score'] * 0.4  # 40% Weight for Coverage
                 score += min(20, fact_density * 4)                # 20% Facts
                 score += min(20, clarity_metrics['clarity_score']) # 20% Clarity
                 score += min(20, readability_score * 0.2)         # 20% Readability
            else:
                score += min(20, fact_density * 2) 
                score += min(20, clarity_metrics['clarity_score']) 
                score += min(15, linkability_metrics['linkability_score']) 
                score += min(15, min(100, sum(format_usage.values()) * 2)) 
                score += min(30, readability_score * 0.3) 
            
            # Generate recommendations
            recommendations = []
            
            if entity_coverage and 'missing_entities' in entity_coverage:
                missing = entity_coverage['missing_entities']
                if missing:
                    rec_text = f"Add missing entities: {', '.join(missing[:5])}"
                    recommendations.append(rec_text)

            if readability_score < 60:
                recommendations.append(f'Improve Readability: Your Flesch-Kincaid score is {int(readability_score)}/100. Shorten sentences and use simpler words.')
            
            if fact_density < 2:
                recommendations.append('Add more factual content with specific numbers, dates, and statistics.')
            if clarity_metrics['clarity_score'] < 50:
                if clarity_metrics.get('avg_sentence_length', 0) > 25:
                    recommendations.append('Reduce average sentence length.')
                else:
                    recommendations.append('Improve content clarity with better structure.')
            if linkability_metrics['linkability_score'] < 30:
                recommendations.append('Add more linkable content and internal linking opportunities.')
            if sum(format_usage.values()) < 5:
                missing_formats = [fmt for fmt, count in format_usage.items() if count == 0]
                if missing_formats:
                    recommendations.append('Use more formatting elements like {} to improve content structure and scannability'.format(', '.join(missing_formats[:3])))
                else:
                    recommendations.append('Use more formatting elements like headings, lists, and emphasis to improve content structure')
            
            # Add recommendations based on new metrics
            if difficulty_score > 70:
                recommendations.append('Simplify knowledge base language for broader accessibility (current difficulty: {:.1f}/100)'.format(difficulty_score))
            if complexity_level == "High":
                recommendations.append('Break down complex knowledge into smaller, more focused articles or sections')
            if ai_generation_feasibility < 40:
                recommendations.append('Add more structured templates and patterns to improve AI understanding and generation capability')
            
            return {
                'score': min(100, int(score)),
                'readability_score': round(readability_score, 1),
                'entities': entities,
                'entities_count': sum(len(v) for v in entities.values()), 
                'fact_density': round(fact_density, 1),
                'facts': facts,
                'clarity': clarity_metrics,
                'linkability': linkability_metrics,
                'format_usage': format_usage,
                'metrics': {
                    'difficulty_score': difficulty_score,
                    'complexity_level': complexity_level,
                    'ai_generation_feasibility': ai_generation_feasibility
                },
                'entity_coverage': entity_coverage,
                'recommendations': recommendations
            }
            
        except Exception as e:
            logging.error(f"Knowledge Base analysis failed: {str(e)}")
            return {
                'score': 0,
                'error': f'Knowledge base analysis failed: {str(e)}',
                'entities': {},
                'fact_density': 0,
                'clarity': {},
                'linkability': {},
                'format_usage': {},
                'metrics': {
                    'difficulty_score': 0,
                    'complexity_level': 'Low',
                    'ai_generation_feasibility': 0
                },
                'recommendations': ['Retry analysis']
            }