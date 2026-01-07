"""
Knowledge Base Analysis Service
Analyzes content for entities, facts, and clarity
"""

import re
import json
import logging
from typing import Dict, List, Set
from urllib.parse import urlparse

# --- OUR NEW CODE START: Import OpenAI ---
try:
    from .openai_service import OpenAIService
except ImportError:
    from openai_service import OpenAIService
# --- OUR NEW CODE END ---

class KnowledgeBaseService:
    """Service for analyzing knowledge base and content quality"""
    
    def __init__(self):
        # --- OUR NEW CODE START: Init OpenAI ---
        self.openai_service = OpenAIService()
        # --- OUR NEW CODE END ---

        # --- EXISTING CODE START (UNCHANGED) ---
        # 1. People: Looks for "Name Surname" (e.g., "Saunak Ahir")
        self.entity_patterns = {
            'people': r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',
            
            # 2. Places: Looks for Cities, Countries (e.g., "Surat", "India", "New York")
            'places': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b',
            
            # 3. Organizations: Now catches "Organics", "Foods", "Store", "Tea", "Brand"
            'organizations': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Inc|Corp|LLC|Ltd|Pvt|Limited|Company|Organization|Organics|Foods|Tea|Store|Shop|Brand|Solutions|Technologies|Group)\b',
            
            # 4. Products (NEW): Catches "Green Tea", "Slimming Tea" (Capitalized words that aren't the others)
            'products': r'\b[A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Tea|Coffee|Powder|Oil|Masala|Pack|Box|Kit|Software|App|Platform|Tool)\b',
            
            'dates': r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            'years': r'\b(?:19|20)\d{2}\b',
            'percentages': r'\b\d+(?:\.\d+)?%\b',
            'numbers': r'\b\d+(?:,\d{3})*(?:\.\d+)?\b'
        }
        # --- EXISTING CODE END ---
    
    def _extract_entities(self, text: str) -> Dict[str, List[str]]:
        """Extract entities from text using regex patterns"""
        entities = {}
        
        for entity_type, pattern in self.entity_patterns.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            entities[entity_type] = list(set(matches))  # Remove duplicates
        
        return entities

    # --- OUR NEW CODE START: Missing Entity Logic ---
    def _analyze_entity_coverage(self, content: str, url: str) -> Dict:
        """
        Use GPT-4o to find MISSING entities (Genuine AI Logic).
        """
        if not self.openai_service or not self.openai_service._is_available():
            return {}

        try:
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
            
            Content (First 8000 chars):
            {content[:8000]}
            """
            
            response = self.openai_service.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an Entity Analysis AI. Output valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            logging.error(f"Entity coverage analysis failed: {e}")
            return {}
    # --- OUR NEW CODE END ---
    
    # --- EXISTING CODE START (UNCHANGED HELPERS) ---
    def _count_syllables(self, word: str) -> int:
        """Count syllables in a word (Simple Heuristic)"""
        word = word.lower()
        count = 0
        vowels = "aeiouy"
        if len(word) == 0:
            return 0
        if word[0] in vowels:
            count += 1
        for i in range(1, len(word)):
            if word[i] in vowels and word[i - 1] not in vowels:
                count += 1
        if word.endswith("e"):
            count -= 1
        if count == 0:
            count += 1
        return count

    def _calculate_flesch_kincaid(self, text: str) -> float:
        """Calculate Flesch-Kincaid Reading Ease Score"""
        # Clean and split text
        words = re.findall(r'\b\w+\b', text)
        sentences = re.split(r'[.!?]+', text)
        sentences = [s for s in sentences if len(s.strip()) > 0]
        
        total_words = len(words)
        total_sentences = len(sentences)
        
        if total_words == 0 or total_sentences == 0:
            return 0.0
            
        total_syllables = sum(self._count_syllables(w) for w in words)
        
        # The Formula: 206.835 - (1.015 x ASL) - (84.6 x ASW)
        asl = total_words / total_sentences  # Avg Sentence Length
        asw = total_syllables / total_words  # Avg Syllables per Word
        
        score = 206.835 - (1.015 * asl) - (84.6 * asw)
        return min(100, max(0, score)) # Cap between 0 and 100
    
    def _calculate_fact_density(self, text: str) -> float:
        """Calculate fact density based on numbers, dates, and specific terms"""
        fact_indicators = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',  # Numbers
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',  # Dates
            r'\b(?:19|20)\d{2}\b',  # Years
            r'\b\d+(?:\.\d+)?%\b',  # Percentages
            r'\b(?:million|billion|thousand|hundred)\b',  # Quantifiers
            r'\b(?:according to|studies show|research indicates|data shows)\b'  # Fact indicators
        ]
        
        total_facts = 0
        for pattern in fact_indicators:
            total_facts += len(re.findall(pattern, text, re.IGNORECASE))
        
        word_count = len(text.split())
        return (total_facts / word_count * 100) if word_count > 0 else 0
    
    def _extract_facts(self, text: str) -> List[Dict[str, str]]:
        """Extract candidate factual statements (simple heuristic)."""
        # Split into sentences crudely
        sentences = re.split(r'[.!?]+\s+', text)
        sentences = [s.strip() for s in sentences if s and len(s.strip()) > 0]

        fact_triggers = [
            r'\b\d+(?:,\d{3})*(?:\.\d+)?\b',
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            r'\b(?:19|20)\d{2}\b',
            r'\b\d+(?:\.\d+)?%\b',
            r'\b(?:according to|studies show|research indicates|data shows)\b',
        ]

        # Terms that suggest JS/analytics/noise to skip
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
                # Skip if sentence looks like code/JS/noise
                if any(re.search(pn, s, re.IGNORECASE) for pn in noise_patterns):
                    continue
                # Require some alphabetic content and a reasonable length
                if not re.search(r'[A-Za-z]', s):
                    continue
                if len(s.split()) < 6:
                    continue
                facts.append({
                    'statement': s[:300],  # cap length
                    'trigger': trigger_matched
                })
        return facts[:50]
    
    def _assess_clarity(self, text: str) -> Dict[str, float]:
        """Assess content clarity metrics"""
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        if not sentences:
            return {'avg_sentence_length': 0, 'clarity_score': 0}
        
        # Calculate average sentence length
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)
        
        # Clarity indicators
        clarity_indicators = [
            r'\b(?:therefore|however|moreover|furthermore|consequently)\b',  # Transition words
            r'\b(?:for example|for instance|such as|including)\b',  # Examples
            r'\b(?:in other words|that is|specifically)\b',  # Clarifications
            r'\b(?:first|second|third|finally|next|then)\b'  # Structure words
        ]
        
        clarity_score = 0
        for pattern in clarity_indicators:
            clarity_score += len(re.findall(pattern, text, re.IGNORECASE))
        
        # Normalize clarity score (0-100)
        clarity_score = min(100, (clarity_score / len(sentences)) * 20)
        
        return {
            'avg_sentence_length': avg_sentence_length,
            'clarity_score': clarity_score,
            'sentence_count': len(sentences)
        }
    
    def _assess_linkability(self, text: str) -> Dict[str, int]:
        """Assess content linkability potential"""
        # Look for potential link targets
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
        """Analyze usage of different content formats"""
        formats = {
            'headings': len(re.findall(r'^#{1,6}\s+', text, re.MULTILINE)),
            'lists': len(re.findall(r'^\s*[-*+]\s+', text, re.MULTILINE)) + len(re.findall(r'^\s*\d+\.\s+', text, re.MULTILINE)),
            'bold': len(re.findall(r'\*\*[^*]+\*\*', text)) + len(re.findall(r'__[^_]+__', text)),
            'italic': len(re.findall(r'\*[^*]+\*', text)) + len(re.findall(r'_[^_]+_', text)),
            'code': len(re.findall(r'`[^`]+`', text)),
            'links': len(re.findall(r'\[([^\]]+)\]\([^)]+\)', text))
        }
        
        return formats
    
    # --- EXISTING CODE END (HELPERS) ---

    def analyze_knowledge_base(self, url: str, html_content: str) -> Dict:
        """Analyze knowledge base quality and content structure"""
        try:
            # Remove scripts/styles/noscript and comments first
            cleaned = re.sub(r'', ' ', html_content, flags=re.DOTALL)
            cleaned = re.sub(r'<script[\s\S]*?</script>', ' ', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'<style[\s\S]*?</style>', ' ', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'<noscript[\s\S]*?</noscript>', ' ', cleaned, flags=re.IGNORECASE)
            # Extract text content
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
                    'recommendations': ['Add more text content']
                }
            
            # --- EXISTING METRICS ---
            entities = self._extract_entities(text_content)
            fact_density = self._calculate_fact_density(text_content)
            clarity_metrics = self._assess_clarity(text_content)
            linkability_metrics = self._assess_linkability(text_content)
            format_usage = self._analyze_format_usage(text_content)
            facts = self._extract_facts(text_content)
            readability_score = self._calculate_flesch_kincaid(text_content)
            
            # --- OUR NEW CODE START: Get AI Missing Entities ---
            # We call our new function here
            entity_coverage = self._analyze_entity_coverage(text_content, url)
            # --- OUR NEW CODE END ---

            # Calculate overall score (Updated Weights)
            score = 0
            
            # --- UPDATED SCORING LOGIC ---
            # If we have genuine AI coverage, give it weight
            if entity_coverage and 'coverage_score' in entity_coverage:
                 score += entity_coverage['coverage_score'] * 0.4  # 40% Weight for Coverage
                 score += min(20, fact_density * 4)                # 20% Facts
                 score += min(20, clarity_metrics['clarity_score']) # 20% Clarity
                 score += min(20, readability_score * 0.2)         # 20% Readability
            else:
                # Fallback to old scoring if AI fails
                score += min(20, fact_density * 2) 
                score += min(20, clarity_metrics['clarity_score']) 
                score += min(15, linkability_metrics['linkability_score']) 
                score += min(15, min(100, sum(format_usage.values()) * 2)) 
                score += min(30, readability_score * 0.3) 
            
            # Generate specific, actionable recommendations
            recommendations = []
            
            # --- OUR NEW CODE START: Add Missing Entity Recs ---
            if entity_coverage and 'missing_entities' in entity_coverage:
                missing = entity_coverage['missing_entities']
                if missing:
                    rec_text = f"Add missing entities: {', '.join(missing[:5])}"
                    recommendations.append(rec_text)
            # --- OUR NEW CODE END ---

            if readability_score < 60:
                recommendations.append(f'Improve Readability: Your Flesch-Kincaid score is {int(readability_score)}/100. Shorten sentences and use simpler words to help AI understand.')
            
            if fact_density < 2:
                recommendations.append('Add more factual content with specific numbers, dates, and statistics to improve AI understanding and credibility')
            if clarity_metrics['clarity_score'] < 50:
                avg_sentence = clarity_metrics.get('avg_sentence_length', 0)
                if avg_sentence > 25:
                    recommendations.append('Reduce average sentence length (currently {:.1f} words) to improve readability and AI comprehension'.format(avg_sentence))
                else:
                    recommendations.append('Improve content clarity with better structure, clear transitions, and shorter paragraphs')
            if linkability_metrics['linkability_score'] < 30:
                recommendations.append('Add more linkable content (industry terms, key concepts) and internal linking opportunities to enhance context')
            if sum(format_usage.values()) < 5:
                missing_formats = [fmt for fmt, count in format_usage.items() if count == 0]
                if missing_formats:
                    recommendations.append('Use more formatting elements like {} to improve content structure and scannability'.format(', '.join(missing_formats[:3])))
                else:
                    recommendations.append('Use more formatting elements like headings, lists, and emphasis to improve content structure')
            
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
                'entity_coverage': entity_coverage,  # Sending genuine AI data to frontend
                'recommendations': recommendations
            }
            
        except Exception as e:
            return {
                'score': 0,
                'error': f'Knowledge base analysis failed: {str(e)}',
                'entities': {},
                'fact_density': 0,
                'clarity': {},
                'linkability': {},
                'format_usage': {},
                'recommendations': ['Retry analysis']
            }