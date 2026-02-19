import re
import json
import logging
import math
import asyncio
from typing import Dict, List, Any
from bs4 import BeautifulSoup
from orchestrator.checkpoint.executor import execute_task

class AnswerabilityModule:
    """
    Analyzes content for Q&A patterns, answerability, and completeness using multi-model AI.
    """
    def __init__(self):
        self.question_patterns = [
            r'\b(?:what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did|will|have|has|had)\b',
            r'\?'
        ]
        
        # Multi-model configuration
        self.bot_to_provider = {
            'GPTBot': 'openai',
            'Google-Extended': 'gemini',
            'ClaudeBot': 'claude'
        }

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

    async def _analyze_with_ai(self, text: str, questions: List[str], provider: str = 'openai') -> Dict:
        """Run AI analysis on answerability with specific provider"""
        if not text: return {}
        
        # Use a cheaper model for openai if specified, otherwise default for others
        model_option = "gpt-4o-mini" if provider == 'openai' else None
        
        prompt = f"""
        Analyze the 'Answerability' and 'Completeness' of this content for AEO.
        
        1. Review these potential user questions: {str(questions[:5])}
        2. Determine if the content provides clear, direct answers.
        3. Calculate the percentage of questions fully answered (0-100%).
        
        Return JSON ONLY:
        {{
            "ai_answerability_score": 0-100,
            "percent_questions_answered": 0-100,
            "answered_questions": ["list"],
            "missing_answers_gaps": ["list of questions not adequately answered"],
            "missing_aspects": ["list of missing subtopics/aspects"],
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
            provider=provider,
            options={"model": model_option} 
        )
        
        if resp.success:
            try:
                content = resp.data
                if "```json" in content: content = content.split("```json")[1].split("```")[0]
                elif "```" in content: content = content.split("```")[1].split("```")[0]
                return json.loads(content)
            except Exception as e:
                logging.error(f"Failed to parse answerability analysis ({provider}): {e}")
                return {"error": str(e)}
        return {"error": resp.error}

    def _calculate_depth_score(self, text: str, headings: List[str]) -> float:
        """Calculate content depth score based on length and structure"""
        score = 0
        paragraphs = [p for p in text.split('\\n\\n') if len(p.strip()) > 50]
        avg_para_length = sum(len(p) for p in paragraphs) / len(paragraphs) if paragraphs else 0
        
        # Paragraph depth
        if avg_para_length > 200: score += 30
        elif avg_para_length > 100: score += 20
        else: score += 10
        
        # Heading structure
        heading_count = len(headings)
        if heading_count > 5: score += 25
        elif heading_count > 2: score += 15
        else: score += 5
        
        # Total length
        total_length = len(text)
        if total_length > 2000: score += 45
        elif total_length > 1000: score += 30
        elif total_length > 500: score += 20
        else: score += 10
        
        return min(100, score)

    def _calculate_breadth_score(self, headings: List[str]) -> float:
        """Calculate breadth based on topic diversity in headings"""
        unique_topics = set()
        for h in headings:
            words = [w.lower() for w in h.split() if len(w) > 3]
            unique_topics.update(words)
        
        topic_count = len(unique_topics)
        if topic_count > 15: return 100
        if topic_count > 10: return 80
        if topic_count > 5: return 60
        if topic_count > 2: return 40
        return 20

    def _calculate_readability_score(self, text: str) -> float:
        """Calculate readability score"""
        sentences = re.split(r'[.!?]+', text)
        sentences = [s for s in sentences if s.strip()]
        word_count = len(text.split())
        
        if not sentences or word_count == 0:
            return 0
            
        avg_words_per_sentence = word_count / len(sentences)
        
        score = 100
        if avg_words_per_sentence > 25: score -= 30
        elif avg_words_per_sentence > 20: score -= 20
        elif avg_words_per_sentence > 15: score -= 10
        
        avg_word_length = len(text.replace(' ', '')) / word_count
        if avg_word_length > 6: score -= 20
        elif avg_word_length > 5: score -= 10
        
        return max(10, score)

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

    def _generate_recommendations(self, completeness: float, depth: float, breadth: float, 
                                consistency: float, ai_data: Dict) -> List[str]:
        """Generate actionable recommendations based on all metrics"""
        recs = []
        
        if completeness < 60:
            recs.append("Improve answer completeness by covering more user questions")
        if completeness < 80:
            recs.append("Add more detailed information to address common user queries")
            
        if depth < 60:
            recs.append("Increase content depth with more detailed explanations and examples")
            
        if breadth < 60:
            recs.append("Expand content breadth to cover related topics and subtopics")
            
        if consistency < 60:
            recs.append("Ensure content clarity - different AI models interpret your content differently")
            
        if ai_data.get('missing_aspects'):
             aspects = ", ".join(ai_data['missing_aspects'][:3])
             recs.append(f"Add missing aspects: {aspects}")
             
        if ai_data.get('missing_answers_gaps'):
            gaps = ", ".join(ai_data['missing_answers_gaps'][:3])
            recs.append(f"Cover unanswered questions: {gaps}")
            
        if completeness > 80 and depth > 80 and breadth > 80:
            recs.append("Content is well-optimized. Consider updating with recent trends")
            
        return recs[:5]

    async def run_analysis(self, html_content: str) -> Dict:
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            text_content = soup.get_text()
            headings = [h.get_text() for h in soup.find_all(['h1', 'h2', 'h3'])]
            
            # 1. Extract Questions and Answers (Regex)
            qa_data = self._extract_questions_answers(text_content)
            answer_data = self._extract_answers(text_content)
            
            # 2. Calculate QA Balance
            question_count = qa_data['count']
            answer_count = answer_data['count']
            qa_balance = answer_count / question_count if question_count > 0 else 0
            
            # 3. Structural Metrics (Ported from Node)
            depth_score = self._calculate_depth_score(text_content, headings)
            breadth_score = self._calculate_breadth_score(headings)
            readability_score = self._calculate_readability_score(text_content)
            
            # 4. Multi-Model AI Analysis
            # Run OpenAI, Gemini, Claude in parallel
            tasks = []
            providers = []
            
            for label, provider_key in self.bot_to_provider.items():
                providers.append(provider_key)
                tasks.append(self._analyze_with_ai(text_content, qa_data['questions'], provider=provider_key))
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            model_scores = {}
            valid_ai_scores = []
            primary_ai_data = {} # Will store OpenAI format for main display
            
            for idx, res in enumerate(results):
                provider = providers[idx]
                score = 0
                if isinstance(res, dict) and 'ai_answerability_score' in res:
                    score = res['ai_answerability_score']
                    model_scores[provider] = score
                    valid_ai_scores.append(score)
                    
                    if provider == 'openai':
                        primary_ai_data = res
                else:
                    logging.warning(f"Answerability analysis failed for {provider}: {res}")
            
            # Fallback if OpenAI failed but others succeeded
            if not primary_ai_data and valid_ai_scores and isinstance(results[0], dict):
                 # Find first valid result dictionary
                 for r in results:
                     if isinstance(r, dict) and 'ai_answerability_score' in r:
                         primary_ai_data = r
                         break

            # 5. Consistency Calculation
            consensus_data = self._calculate_model_consensus(model_scores)
            avg_ai_score = sum(valid_ai_scores) / len(valid_ai_scores) if valid_ai_scores else 0
            
            # 6. Final Scoring (Weighted)
            # Regex (20%) + Avg AI (40%) + Depth (20%) + Breadth (10%) + Consistency (10%)
            regex_score = min(20, qa_data['count'] * 2)
            
            final_score = (
                regex_score + 
                (avg_ai_score * 0.4) + 
                (depth_score * 0.2) + 
                (breadth_score * 0.1) + 
                (consensus_data['consistency_score'] * 0.1)
            )
            
            # Generate Recommendations
            recommendations = self._generate_recommendations(
                final_score, depth_score, breadth_score, 
                consensus_data['consistency_score'], primary_ai_data
            )
            
            return {
                "score": int(min(100, final_score)),
                "completeness_score": int(final_score),
                "depth_score": depth_score,
                "breadth_score": breadth_score,
                "readability_score": readability_score,
                "metrics": {
                    "question_count": question_count,
                    "answer_count": answer_count,
                    "qa_balance": round(qa_balance, 2),
                    "percent_questions_answered": primary_ai_data.get('percent_questions_answered', 0)
                },
                "multi_model_scores": model_scores,
                "consistency": consensus_data,
                "ai_analysis": primary_ai_data,
                "recommendations": recommendations,
                "questions_found": qa_data['questions'],
                "missing_answers_gaps": primary_ai_data.get('missing_answers_gaps', [])
            }
            
        except Exception as e:
            logging.error(f"Answerability Error: {e}")
            return {"score": 0, "error": str(e)}
