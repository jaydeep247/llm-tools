"""
OpenAI Integration Service
Provides AI-powered content analysis and understanding
SAFE MODE: Returns fallback data if API Quota is exceeded.
"""

import os
import re
import json
import logging
from typing import Dict, List, Optional
from openai import OpenAI

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