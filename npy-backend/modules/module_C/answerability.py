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
        """Extract questions using question words OR question marks"""
        sentences = re.split(r'[.!?]+', text)
        questions = []
        
        for s in sentences:
            s = s.strip()
            if len(s) < 10:
                continue
            
            # Check for question words (what, how, why, etc.)
            has_question_word = any(
                re.search(pattern, s, re.IGNORECASE) 
                for pattern in self.question_patterns
            )
            has_question_mark = '?' in s
            
            # Accept if either condition is met
            if has_question_word or has_question_mark:
                questions.append(s[:200])
        
        return {"questions": questions[:20], "count": len(questions)}
    
    def _extract_answers(self, text: str) -> Dict:
        """Extract potential answers from text using answer indicators"""
        answer_indicators = [
            r'\b(?:answer|solution|explanation|because|due to|as a result|therefore|thus|hence)\b',
            r'\b(?:step|process|method|way|approach|technique)\b',
            r'\b(?:first|second|third|next|then|finally|lastly)\b'
        ]
        
        answers = []
        sentences = re.split(r'[.!?]+', text)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence or len(sentence) < 15:
                continue
            
            # Check if sentence contains answer indicators
            has_answer_indicators = any(
                re.search(pattern, sentence, re.IGNORECASE) 
                for pattern in answer_indicators
            )
            
            if has_answer_indicators:
                # Calculate confidence based on number of indicators found
                indicator_count = sum(
                    1 for pattern in answer_indicators 
                    if re.search(pattern, sentence, re.IGNORECASE)
                )
                confidence = 'high' if indicator_count > 1 else 'medium'
                
                answers.append({
                    'answer': sentence[:300],
                    'confidence': confidence
                })
        
        return {
            "answers": answers[:15],  # Limit to 15 answers
            "count": len(answers[:15])
        }


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
            
            # 1. Extract Questions and Answers
            qa_data = self._extract_questions_answers(text_content)
            answer_data = self._extract_answers(text_content)
            
            # 2. Calculate QA Balance
            question_count = qa_data['count']
            answer_count = answer_data['count']
            qa_balance = answer_count / question_count if question_count > 0 else 0
            percent_questions_answered = qa_balance * 100
            
            # 3. AI Analysis
            ai_data = await self._analyze_with_ai(text_content, qa_data['questions'])
            
            # 4. Scoring
            # Blend regex (30) + AI (40) + QA balance (30) = 100 max
            regex_score = min(30, qa_data['count'] * 3)
            ai_score = ai_data.get('ai_answerability_score', 0) * 0.4
            balance_score = qa_balance * 30
            
            total_score = regex_score + ai_score + balance_score
            
            return {
                "score": int(total_score),
                "questions_found": qa_data['questions'],
                "answers_found": answer_data['answers'],
                "metrics": {
                    "question_count": question_count,
                    "answer_count": answer_count,
                    "qa_balance": round(qa_balance, 2),
                    "percent_questions_answered": round(percent_questions_answered, 1)
                },
                "ai_analysis": ai_data,
                "recommendations": ai_data.get('recommendations', [])
            }
            
        except Exception as e:
            logging.error(f"Answerability Error: {e}")
            return {"score": 0, "error": str(e)}

