"""
AI Sentiment & Visibility Tracking for Module E
Tracks brand sentiment using 5 probe questions + visibility via 6 discovery questions
Queries OpenAI, Gemini, Claude for comprehensive AI perception analysis
"""
import logging
import json
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_sentiment")


class SentimentVisibilityTracker:
    """
    Tracks AI sentiment and visibility for brands.
    
    Sentiment: 5 probe questions explicitly mentioning the brand
    Visibility: 6 discovery questions WITHOUT mentioning brand (test if AI recommends it)
    """
    
    # 5 Sentiment Probes (brand mentioned explicitly)
    SENTIMENT_PROBES = [
        "What is the general reputation of {brand_name} in its industry?",
        "What are the main strengths and weaknesses of {brand_name}?",
        "Is {brand_name} considered trustworthy and reliable? Why or why not?",
        "How do customers or users generally feel about {brand_name}?",
        "Would you recommend {brand_name} to others? Explain briefly."
    ]
    
    # 6 Generic Industry Discovery Questions (brand NOT mentioned - tests organic visibility)
    VISIBILITY_DISCOVERY_QUESTIONS = [
        "What are the leading companies in {industry}?",
        "Which {industry} companies would you recommend for {service_type}?",
        "Who are the top innovators in the {industry} sector?",
        "What companies come to mind when you think of {industry}?",
        "Which {industry} providers have the best reputation?",
        "If someone asked for {industry} recommendations, who would you suggest?"
    ]
    
    # Scoring instruction for structured JSON responses
    SENTIMENT_SCORING_INSTRUCTION = (
        "\n\nIMPORTANT: After answering, analyze your own sentiment in the response above. "
        "Rate the sentiment on a scale of 0-100 where:\n"
        "- 0-30 = Negative (critical, unfavorable, concerning)\n"
        "- 31-69 = Neutral (balanced, factual, mixed)\n"
        "- 70-100 = Positive (favorable, praising, recommending)\n\n"
        "Return ONLY valid JSON in this exact format:\n"
        '{"response_text": "your detailed answer here", "sentiment_score": 85, "sentiment_label": "Positive"}'
    )
    
    @staticmethod
    async def analyze_sentiment_and_visibility(brand_name: str, industry: Optional[str] = None, service_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Run complete sentiment & visibility analysis for a brand.
        
        Args:
            brand_name: The brand to analyze (e.g., "TechStaunch")
            industry: Industry category (e.g., "software development", auto-inferred if None)
            service_type: Service type (e.g., "mobile app development", auto-inferred if None)
            
        Returns:
            {sentiment: {...}, visibility: {...}, brand_name, timestamp}
        """
        print("\n" + "="*100)
        print("🔍 STARTING AI SENTIMENT & VISIBILITY TRACKING")
        print("="*100)
        print(f"📌 Brand: {brand_name}")
        print(f"📌 Industry: {industry or 'Auto-detecting...'}")
        print(f"📌 Service Type: {service_type or 'Auto-detecting...'}")
        print("="*100 + "\n")
        
        # Auto-infer industry and service type if not provided
        if not industry or not service_type:
            inferred = await SentimentVisibilityTracker._infer_industry_and_service(brand_name)
            industry = industry or inferred.get("industry", "technology")
            service_type = service_type or inferred.get("service_type", "software solutions")
            
            print("\n" + "="*100)
            print("🧠 AUTO-INFERRED BRAND CONTEXT")
            print("="*100)
            print(f"📍 Industry: {industry}")
            print(f"📍 Service Type: {service_type}")
            print("="*100 + "\n")
        
        # Step 1: Sentiment Analysis (5 questions × 3 models = 15 API calls)
        print("\n" + "="*100)
        print("💭 PHASE 1: SENTIMENT ANALYSIS (5 Probe Questions × 3 Models)")
        print("="*100)
        sentiment_results = await SentimentVisibilityTracker._run_sentiment_probes(brand_name)
        
        # Step 2: Visibility Analysis (6 discovery questions × 3 models = 18 API calls)
        print("\n" + "="*100)
        print("👁️  PHASE 2: VISIBILITY ANALYSIS (6 Discovery Questions × 3 Models)")
        print("="*100)
        visibility_results = await SentimentVisibilityTracker._run_visibility_checks(
            brand_name, industry, service_type
        )
        
        # Step 3: Aggregate results
        sentiment_data = SentimentVisibilityTracker._aggregate_sentiment(sentiment_results)
        visibility_data = SentimentVisibilityTracker._aggregate_visibility(brand_name, visibility_results)
        
        result = {
            "brand_name": brand_name,
            "industry": industry,
            "service_type": service_type,
            "sentiment": sentiment_data,
            "visibility": visibility_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Final debug output
        print("\n" + "="*100)
        print("✅ SENTIMENT & VISIBILITY ANALYSIS COMPLETE")
        print("="*100)
        print(f"📊 Overall Sentiment Score: {sentiment_data['overall_score']}/100")
        print(f"📊 Overall Visibility Score: {visibility_data['overall_visibility_score']}%")
        print(f"📊 Sentiment Distribution: {sentiment_data['distribution']}")
        print(f"📊 Brand Appearance Rate: {visibility_data.get('overall_appearance_rate', 0):.1%}")
        print("="*100 + "\n")
        
        return result
    
    @staticmethod
    async def _infer_industry_and_service(brand_name: str) -> Dict[str, str]:
        """Use AI to infer brand's industry and service type"""
        prompt = f"""Analyze the brand "{brand_name}" and infer:
1. Industry category (e.g., "software development", "digital marketing", "e-commerce")
2. Service type offered (e.g., "mobile app development", "SEO services", "cloud solutions")

Return ONLY valid JSON:
{{"industry": "industry name", "service_type": "service description"}}"""
        
        try:
            response = await execute_task(
                task_name="module_e_industry_inference",
                input_data={"prompt": prompt},
                provider="openai",
                options={"temperature": 0.3, "response_format": "json_object"}
            )
            
            data = json.loads(response) if isinstance(response, str) else response
            return {
                "industry": data.get("industry", "technology"),
                "service_type": data.get("service_type", "software solutions")
            }
        except Exception as e:
            logger.warning(f"Industry inference failed: {e}")
            return {"industry": "technology", "service_type": "software solutions"}
    
    @staticmethod
    async def _run_sentiment_probes(brand_name: str) -> List[Dict]:
        """
        Ask all 5 sentiment questions to OpenAI, Gemini, Claude.
        Each model scores 0-100 with Positive/Neutral/Negative label.
        """
        results = []
        
        for model_idx, model in enumerate(["openai", "gemini", "claude"], 1):
            print(f"\n{'─'*100}")
            print(f"🤖 MODEL {model_idx}/3: {model.upper()}")
            print(f"{'─'*100}")
            
            model_responses = []
            
            for q_idx, question_template in enumerate(SentimentVisibilityTracker.SENTIMENT_PROBES, 1):
                question = question_template.format(brand_name=brand_name)
                prompt = question + SentimentVisibilityTracker.SENTIMENT_SCORING_INSTRUCTION
                
                print(f"\n  ❓ Question {q_idx}/5: {question}")
                
                try:
                    # Use checkpoint/executor pattern with caching
                    response = await execute_task(
                        task_name=f"module_e_sentiment_{model}",
                        input_data={"prompt": prompt},
                        provider=model,
                        options={"temperature": 0.3, "response_format": "json_object"}
                    )
                    
                    # Parse JSON response
                    data = json.loads(response) if isinstance(response, str) else response
                    
                    score = data.get("sentiment_score", 50)
                    label = data.get("sentiment_label", "Neutral")
                    answer = data.get("response_text", "")
                    
                    print(f"  ✅ Score: {score}/100 | Label: {label}")
                    print(f"  📝 Answer: {answer[:150]}{'...' if len(answer) > 150 else ''}")
                    
                    model_responses.append({
                        "question": question,
                        "answer": answer,
                        "score": score,
                        "label": label
                    })
                    
                except Exception as e:
                    logger.error(f"Sentiment probe failed: {model} Q{q_idx} - {e}")
                    print(f"  ❌ Error: {e}")
                    model_responses.append({
                        "question": question,
                        "answer": "",
                        "score": 50,
                        "label": "Neutral"
                    })
            
            # Calculate model average
            scores = [r["score"] for r in model_responses if r.get("score")]
            distribution = {"Positive": 0, "Neutral": 0, "Negative": 0}
            
            for r in model_responses:
                label = r.get("label", "Neutral")
                distribution[label] = distribution.get(label, 0) + 1
            
            model_avg = int(sum(scores) / len(scores)) if scores else 0
            
            print(f"\n  📊 {model.upper()} Summary:")
            print(f"     Average Score: {model_avg}/100")
            print(f"     Distribution: {distribution}")
            
            results.append({
                "model": model,
                "average_score": model_avg,
                "distribution": distribution,
                "details": model_responses
            })
        
        return results
    
    @staticmethod
    async def _run_visibility_checks(brand_name: str, industry: str, service_type: str) -> List[Dict]:
        """
        Run 6 discovery questions (brand NOT mentioned) across 3 models.
        Check if brand appears organically in AI responses.
        """
        # Generate visibility questions with industry context
        visibility_questions = [
            q.format(industry=industry, service_type=service_type)
            for q in SentimentVisibilityTracker.VISIBILITY_DISCOVERY_QUESTIONS
        ]
        
        print(f"\n{'─'*100}")
        print(f"📋 VISIBILITY DISCOVERY QUESTIONS (Brand NOT mentioned in prompts)")
        print(f"{'─'*100}")
        for i, q in enumerate(visibility_questions, 1):
            print(f"  {i}. {q}")
        print(f"{'─'*100}\n")
        
        results = []
        
        for model_idx, model in enumerate(["openai", "gemini", "claude"], 1):
            print(f"\n{'─'*100}")
            print(f"🤖 MODEL {model_idx}/3: {model.upper()} - Visibility Test")
            print(f"{'─'*100}")
            
            model_answers = []
            
            # Ask each visibility question separately (NOT batched - better for checking mentions)
            for q_idx, question in enumerate(visibility_questions, 1):
                print(f"\n  ❓ Discovery Question {q_idx}/6: {question}")
                
                try:
                    response = await execute_task(
                        task_name=f"module_e_visibility_{model}",
                        input_data={"prompt": question},
                        provider=model,
                        options={"temperature": 0.5}  # Slightly higher for natural recommendations
                    )
                    
                    answer_text = response if isinstance(response, str) else str(response)
                    
                    # Check if brand is mentioned in response
                    brand_mentioned = brand_name.lower() in answer_text.lower()
                    mention_position = answer_text.lower().find(brand_name.lower())
                    
                    if brand_mentioned:
                        print(f"  ✅ BRAND MENTIONED! Position: {mention_position}")
                        print(f"  📝 Context: ...{answer_text[max(0, mention_position-50):mention_position+100]}...")
                    else:
                        print(f"  ❌ Brand not mentioned")
                    
                    print(f"  📝 Full Answer: {answer_text[:200]}{'...' if len(answer_text) > 200 else ''}")
                    
                    model_answers.append({
                        "question": question,
                        "answer": answer_text,
                        "brand_mentioned": brand_mentioned,
                        "mention_position": mention_position if brand_mentioned else -1
                    })
                    
                except Exception as e:
                    logger.error(f"Visibility check failed: {model} Q{q_idx} - {e}")
                    print(f"  ❌ Error: {e}")
                    model_answers.append({
                        "question": question,
                        "answer": "",
                        "brand_mentioned": False,
                        "mention_position": -1
                    })
            
            # Calculate model visibility
            mentions = sum(1 for a in model_answers if a.get("brand_mentioned"))
            total = len(model_answers)
            appearance_rate = mentions / total if total > 0 else 0
            
            print(f"\n  📊 {model.upper()} Visibility Summary:")
            print(f"     Brand Mentions: {mentions}/{total} questions ({appearance_rate:.1%})")
            
            results.append({
                "model": model,
                "answers": model_answers
            })
        
        return results
    
    @staticmethod
    def _aggregate_sentiment(results: List[Dict]) -> Dict:
        """Aggregate sentiment across all models"""
        print("\n" + "="*100)
        print("📊 AGGREGATING SENTIMENT RESULTS")
        print("="*100)
        
        all_scores = [r["average_score"] for r in results if r.get("average_score")]
        total_dist = {"Positive": 0, "Neutral": 0, "Negative": 0}
        
        for r in results:
            for label, count in r["distribution"].items():
                total_dist[label] += count
        
        overall_score = int(sum(all_scores) / len(all_scores)) if all_scores else 0
        
        print(f"  Model Scores: {[r['average_score'] for r in results]}")
        print(f"  Overall Score: {overall_score}/100")
        print(f"  Total Distribution: {total_dist}")
        print("="*100 + "\n")
        
        return {
            "overall_score": overall_score,
            "distribution": total_dist,
            "by_model": {
                r["model"]: {
                    "score": r["average_score"],
                    "distribution": r["distribution"]
                } for r in results
            }
        }
    
    @staticmethod
    def _aggregate_visibility(brand_name: str, results: List[Dict]) -> Dict:
        """
        Calculate visibility score based on brand mentions in discovery answers.
        Higher score = AI recommends brand organically without being asked.
        """
        print("\n" + "="*100)
        print("📊 AGGREGATING VISIBILITY RESULTS")
        print("="*100)
        
        search_terms = [brand_name.lower()]
        
        model_scores = {}
        
        for result in results:
            model = result["model"]
            appearances = 0
            position_weights = []
            
            for answer_data in result["answers"]:
                if not answer_data.get("brand_mentioned"):
                    continue
                    
                appearances += 1
                pos = answer_data.get("mention_position", -1)
                
                # Position weight (earlier mention = stronger recommendation)
                if pos <= 50:
                    weight = 1.0  # Mentioned in first 50 chars
                elif pos <= 200:
                    weight = 0.8  # Mentioned in first 200 chars
                elif pos <= 400:
                    weight = 0.5  # Mentioned in middle
                else:
                    weight = 0.2  # Mentioned late in response
                
                position_weights.append(weight)
            
            total_questions = len(result["answers"])
            appearance_rate = appearances / total_questions if total_questions > 0 else 0
            avg_weight = sum(position_weights) / len(position_weights) if position_weights else 0
            visibility_score = int(appearance_rate * avg_weight * 100)
            
            print(f"  {model.upper()}:")
            print(f"    Appearances: {appearances}/{total_questions}")
            print(f"    Appearance Rate: {appearance_rate:.1%}")
            print(f"    Avg Position Weight: {avg_weight:.2f}")
            print(f"    Visibility Score: {visibility_score}%")
            
            model_scores[model] = {
                "visibility_score": visibility_score,
                "appearance_rate": appearance_rate,
                "appearances": appearances,
                "total_prompts": total_questions,
                "avg_position_weight": avg_weight
            }
        
        # Overall visibility (average across models)
        all_scores = [m["visibility_score"] for m in model_scores.values()]
        overall_visibility = int(sum(all_scores) / len(all_scores)) if all_scores else 0
        
        all_rates = [m["appearance_rate"] for m in model_scores.values()]
        overall_rate = sum(all_rates) / len(all_rates) if all_rates else 0
        
        print(f"\n  Overall Visibility Score: {overall_visibility}%")
        print(f"  Overall Appearance Rate: {overall_rate:.1%}")
        print("="*100 + "\n")
        
        return {
            "overall_visibility_score": overall_visibility,
            "overall_appearance_rate": overall_rate,
            "by_model": model_scores
        }
