"""
AEO Services - Consolidated
Main service orchestrator that imports from separate service files
Updated to CONNECT Multi-AI Service (OpenAI + Gemini + Claude)
"""

from .ai_presence import AIPresenceService
from .competitor_analysis import CompetitorAnalysisService
from .knowledge_base import KnowledgeBaseService
from .answerability import AnswerabilityService
from ..module_A.crawler_accessibility import CrawlerAccessibilityService
from ..module_B.structured_data import StructuredDataService

# --- Import the Multi-AI Service ---
from .multi_ai_service import MultiAIService
# ----------------------------------------

import logging
import time
import requests
import datetime

class AEOServiceOrchestrator:
    """Main orchestrator for all AEO analysis services"""
    
    def __init__(self):
        self.ai_presence_service = AIPresenceService()
        self.competitor_service = CompetitorAnalysisService()
        self.knowledge_base_service = KnowledgeBaseService()
        self.answerability_service = AnswerabilityService()
        self.crawler_accessibility_service = CrawlerAccessibilityService()
        self.structured_data_service = StructuredDataService()
        
        # --- Initialize Multi-AI Service ---
        self.multi_ai_service = MultiAIService()
        # ----------------------------------------
    
    # --- Wrapper Methods ---
    
    # --- UPDATED: Accepts target_models filter ---
    def analyze_ai_presence(self, url: str, target_models: list = None) -> dict:
        """Analyze basic AI bot accessibility (robots.txt, blocking)"""
        # Pass target_models down to the service to prevent unwanted API calls
        return self.ai_presence_service.analyze_ai_presence(url, target_models=target_models)
    
    # --- UPDATED: Accepts target_models filter ---
    def analyze_multi_ai(self, content: str, url: str, target_models: list = None) -> dict:
        """
        Analyze content understanding using Multi-Model AI (OpenAI, Gemini, Claude).
        :param target_models: Optional list of specific models to use.
        """
        return self.multi_ai_service.analyze_content_understanding(content, url, providers=target_models)

    # --- NEW: Wrapper for Answer Simulation ---
    def generate_simulated_answer(self, content: str, query: str) -> dict:
        """Generate simulated AI answers based on content"""
        return self.multi_ai_service.generate_simulated_answer(content, query)
    # ------------------------------------------
    
    def analyze_competitor_landscape(self, target_url: str, competitor_urls: list) -> dict:
        """Analyze competitor landscape"""
        return self.competitor_service.analyze_competitor_landscape(target_url, competitor_urls)
    
    def analyze_knowledge_base(self, url: str, html_content: str) -> dict:
        """Analyze knowledge base quality"""
        return self.knowledge_base_service.analyze_knowledge_base(url, html_content)
    
    def analyze_answerability(self, url: str, html_content: str) -> dict:
        """Analyze answerability and Q&A content"""
        return self.answerability_service.analyze_answerability(url, html_content)
    
    def analyze_crawler_accessibility(self, url: str, html_content: str) -> dict:
        """Analyze crawler accessibility"""
        return self.crawler_accessibility_service.analyze_crawler_accessibility(url, html_content)
    
    def analyze_structured_data(self, url: str, html_content: str = None) -> dict:
        """Analyze structured data"""
        return self.structured_data_service.analyze_structured_data(url, html_content)
    
    # --- UPDATED: Accepts target_models filter ---
    def run_complete_analysis(self, url: str, html_content: str = None, competitor_urls: list = None, target_models: list = None) -> dict:
        """
        Run complete AEO analysis with STRICT Metric Reporting.
        """
        
        try:
            # 1. Fetch HTML (Safe Mode)
            if not html_content:
                try:
                    logging.info(f"Fetching HTML for {url}...")
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Referer': 'https://www.google.com/'
                    }
                    response = requests.get(url, headers=headers, timeout=15)
                    html_content = response.text
                except Exception as e:
                    logging.error(f"Failed to fetch HTML: {str(e)}")
                    return {'error': f'Failed to fetch content: {str(e)}', 'url': url}
            
            results = {}
            
            # --- EXECUTE MODULES ---
            # A. Basic AI Presence
            try:
                results['ai_presence'] = self.analyze_ai_presence(url, target_models=target_models)
            except Exception as e:
                results['ai_presence'] = {'score': 0, 'error': str(e)}

            # B. Multi-AI Understanding
            try:
                results['multi_ai'] = self.analyze_multi_ai(html_content, url, target_models=target_models)
            except Exception as e:
                results['multi_ai'] = {'overall_score': 0, 'error': str(e)}

            # C. Knowledge Base (Entities & Readability)
            try:
                results['knowledge_base'] = self.analyze_knowledge_base(url, html_content)
            except Exception as e:
                results['knowledge_base'] = {'score': 0, 'readability_score': 0, 'entity_coverage': {}, 'error': str(e)}

            # D. Answerability
            try:
                results['answerability'] = self.analyze_answerability(url, html_content)
            except Exception as e:
                results['answerability'] = {'score': 0, 'error': str(e)}

            # E. Crawler Accessibility
            try:
                results['crawler_accessibility'] = self.analyze_crawler_accessibility(url, html_content)
            except Exception as e:
                results['crawler_accessibility'] = {'score': 0, 'error': str(e)}

            # F. Structured Data
            try:
                results['structured_data'] = self.analyze_structured_data(url, html_content)
            except Exception as e:
                results['structured_data'] = {'score': 0, 'metrics': {'completeness': 0}, 'error': str(e)}

            # G. Competitor Analysis
            try:
                results['competitor_analysis'] = self.analyze_competitor_landscape(url, competitor_urls or [])
            except Exception as e:
                results['competitor_analysis'] = {'score': 0, 'error': str(e)}
            
            # --- STRICT METRIC CALCULATION (PER INSTRUCTIONS) ---
            
            # 1. LLM-Friendliness Score (0-100)
            s_answerability = results.get('answerability', {}).get('score', 0)
            s_knowledge = results.get('knowledge_base', {}).get('score', 0)
            s_structure = results.get('structured_data', {}).get('score', 0)
            s_multi_ai = results.get('multi_ai', {}).get('overall_score', 0)
            s_basic_presence = results.get('ai_presence', {}).get('score', 0)
            s_final_presence = max(s_multi_ai, s_basic_presence)
            
            # Weighted Formula including Readability implicitly via Knowledge Base or Explicitly here
            overall_score = (
                (s_answerability * 0.30) +
                (s_knowledge * 0.25) +
                (s_structure * 0.25) +
                (s_final_presence * 0.20)
            )
            llm_friendliness_score = round(overall_score, 1)

            # 2. Entity Presence Ratio
            kb_data = results.get('knowledge_base', {})
            ec_data = kb_data.get('entity_coverage', {})
            found_entities = len(ec_data.get('found_entities', []))
            missing_entities = len(ec_data.get('missing_entities', []))
            total_entities = found_entities + missing_entities
            
            if total_entities > 0:
                entity_presence_ratio = round((found_entities / total_entities) * 100, 1)
            else:
                entity_presence_ratio = 0.0

            # 3. Structured Data Completeness
            sd_data = results.get('structured_data', {})
            sd_completeness = sd_data.get('metrics', {}).get('completeness', 0)

            # 4. Readability Score
            readability_score = kb_data.get('readability_score', 0)

            # --- CONSTRUCT FINAL RESPONSE ---
            return {
                'url': url,
                'overall_score': llm_friendliness_score,
                
                # THIS IS THE STRICT "METRICS" BLOCK THE CLIENT WANTS
                'metrics': {
                    'llm_friendliness_score': llm_friendliness_score,
                    'entity_presence_ratio': entity_presence_ratio,
                    'structured_data_completeness': round(sd_completeness, 1),
                    'readability_score': readability_score
                },
                
                'module_scores': {
                    'ai_presence': s_final_presence,
                    'knowledge_base': s_knowledge,
                    'structured_data': s_structure,
                    'answerability': s_answerability,
                    'crawler_accessibility': results.get('crawler_accessibility', {}).get('score', 0),
                    'competitor_analysis': results.get('competitor_analysis', {}).get('score', 0)
                },
                'detailed_analysis': {
                    'ai_presence': results.get('ai_presence', {}),
                    'multi_ai': results.get('multi_ai', {}),
                    'knowledge_base': results.get('knowledge_base', {}),
                    'structured_data': results.get('structured_data', {}),
                    'answerability': results.get('answerability', {}),
                    'competitor_analysis': results.get('competitor_analysis', {}),
                    'crawler_accessibility': results.get('crawler_accessibility', {})
                },
                'recommendations': self._generate_recommendations(results),
                'analysis_timestamp': datetime.datetime.now().isoformat()
            }
            
        except Exception as e:
            logging.critical(f"Critical Orchestrator Failure: {str(e)}")
            return {'error': f'Complete analysis failed: {str(e)}', 'url': url}
    
    def _generate_recommendations(self, results: dict) -> list:
        """Generate prioritized, actionable recommendations from analysis results"""
        all_recommendations = []
        priority_map = {
            'high': [],
            'medium': [],
            'low': []
        }
        
        # Generic/error recommendations to filter out
        generic_patterns = [
            'retry',
            'check',
            'configure',
            'failed',
            'error',
            'unavailable',
            'try again'
        ]
        
        # Collect all recommendations with metadata
        for key, analysis in results.items():
            if isinstance(analysis, dict) and 'recommendations' in analysis:
                module_score = analysis.get('score', 0)
                # If Multi-AI, use overall_score
                if key == 'multi_ai':
                    module_score = analysis.get('overall_score', 0)
                
                for rec in analysis.get('recommendations', []):
                    if rec and isinstance(rec, str):
                        # Filter out generic/error recommendations
                        rec_lower = rec.lower()
                        if any(pattern in rec_lower for pattern in generic_patterns):
                            continue
                        
                        # Determine priority based on score and module
                        priority = self._determine_priority(rec, module_score, key)
                        priority_map[priority].append(rec)
                        all_recommendations.append(rec)
        
        # Remove duplicates while preserving order
        seen = set()
        filtered_recommendations = []
        
        # Add high priority first
        for rec in priority_map['high']:
            if rec not in seen:
                seen.add(rec)
                filtered_recommendations.append(rec)
        
        # Then medium priority
        for rec in priority_map['medium']:
            if rec not in seen:
                seen.add(rec)
                filtered_recommendations.append(rec)
        
        # Finally low priority
        for rec in priority_map['low']:
            if rec not in seen:
                seen.add(rec)
                filtered_recommendations.append(rec)
        
        return filtered_recommendations[:20]  # Limit to top 20 recommendations
    
    def _determine_priority(self, recommendation: str, score: float, module: str) -> str:
        """Determine priority level based on DATA Logic + Keywords"""
        rec_lower = recommendation.lower()
        
        # LOGIC 1: Critical Score Failures = HIGH Priority
        if score < 40:
            return 'high'
        
        # LOGIC 2: Critical Keywords
        high_priority_keywords = [
            'noindex', 'blocked', 'robots.txt', 'schema', 'structured data',
            'missing', 'error', 'failed', 'critical'
        ]
        if any(k in rec_lower for k in high_priority_keywords):
            return 'high'
            
        # LOGIC 3: Mediocre Scores = MEDIUM Priority
        if score < 70:
            return 'medium'
            
        # LOGIC 4: Optimization Keywords
        medium_priority_keywords = ['improve', 'optimize', 'better', 'enhance']
        if any(k in rec_lower for k in medium_priority_keywords):
            return 'medium'
            
        return 'low'