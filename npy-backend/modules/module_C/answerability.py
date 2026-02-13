import re
import json
import logging
from typing import Dict, List
from bs4 import BeautifulSoup
from orchestrator.checkpoint.executor import execute_task

class AnswerabilityModule:
    """
    Analyzes content for Q&A patterns and answerability.
    """
    def __init__(self):
         self.question_patterns = [
            r'\b(?:what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did|will|have|has|had)\b',
            r'\?'
        ]

    def _extract_questions_answers(self, text: str) -> Dict:
        """Basic regex extraction (Simplified for speed)"""
        sentences = re.split(r'[.!?]+', text)
        questions = []
        for s in sentences:
            s = s.strip()
            if '?' in s and len(s) > 10:
                questions.append(s[:200])
        return {"questions": questions[:20], "count": len(questions)}

    async def _analyze_with_ai(self, text: str, questions: List[str]) -> Dict:
        """Run AI analysis on answerability"""
        if not text: return {}
        
        prompt = f"""
        Analyze the 'Answerability' of this content for AEO.
        
        1. Review these potential user questions: {str(questions[:5])}
        2. Determine if the content provides clear, direct answers.
        3. Calculate the percentage of questions fully answered (0-100%).
        
        Return JSON ONLY:
        {{
            "ai_answerability_score": 0-100,
            "percent_questions_answered": 0-100,
            "answered_questions": ["list"],
            "missing_answers_gaps": ["list of questions not adequately answered"],
            "recommendations": [
                {{
                    "action": "string",
                    "priority": "High" | "Medium" | "Low",
                    "impact": 1-10
                }}
            ]
        }}
        
        Content:
        {text[:10000]}
        """
        
        resp = await execute_task(
            task_name="aeo_answerability_audit",
            input_data={"messages": [{"role": "user", "content": prompt}]}, 
            provider="openai",
            options={"model": "gpt-4o-mini"} 
        )
        
        if resp.success:
            try:
                content = resp.data
                if "```json" in content: content = content.split("```json")[1].split("```")[0]
                elif "```" in content: content = content.split("```")[1].split("```")[0]
                return json.loads(content)
            except Exception as e:
                logging.error(f"Failed to parse answerability analysis: {e}")
                return {}
        return {}

    async def run_analysis(self, html_content: str) -> Dict:
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            text_content = soup.get_text()
            
            # 1. Basic Extraction
            qa_data = self._extract_questions_answers(text_content)
            
            # 2. AI Analysis
            ai_data = await self._analyze_with_ai(text_content, qa_data['questions'])
            
            # 3. Scoring
            # Blend regex count (max 50) + AI score (max 50)
            regex_score = min(50, qa_data['count'] * 5)
            ai_score = ai_data.get('ai_answerability_score', 0) * 0.5
            
            total_score = regex_score + ai_score
            
            return {
                "score": int(total_score),
                "questions_found": qa_data['questions'],
                "ai_analysis": ai_data,
                "recommendations": ai_data.get('recommendations', [])
            }
            
        except Exception as e:
            logging.error(f"Answerability Error: {e}")
            return {"score": 0, "error": str(e)}
