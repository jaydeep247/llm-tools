# """
# OpenAI Integration Service
# Provides AI-powered content analysis and understanding
# SAFE MODE: Returns fallback data if API Quota is exceeded.
# """

# import os
# import re
# import json
# import math
# import logging
# from typing import Dict, List, Optional
# from datetime import datetime
# from openai import OpenAI
# from utils.mongo import mongo_manager
# from utils.storage import load_raw_html_sync

# try:
#     from bs4 import BeautifulSoup
# except Exception:
#     BeautifulSoup = None

# class OpenAIService:
#     """Service for OpenAI-powered content analysis"""
    
#     def __init__(self):
#         self.client = None
#         self.api_key = os.getenv('OPENAI_API_KEY')
        
#         if self.api_key:
#             try:
#                 self.client = OpenAI(api_key=self.api_key)
#                 logging.info("OpenAI client initialized successfully")
#             except Exception as e:
#                 logging.error(f"Failed to initialize OpenAI client: {str(e)}")
#                 self.client = None
#         else:
#             logging.warning("OPENAI_API_KEY not found in environment variables")
    
#     def _is_available(self) -> bool:
#         """Check if OpenAI service is available"""
#         return self.client is not None
    
#     def analyze_content_understanding(self, content: str, url: str) -> Dict:
#         """
#         Analyze if AI can understand the content clearly using GPT-4o (Upgraded)
#         SAFE MODE: Returns mock data if API fails.
#         """
#         # Default Fallback Result (Used if API fails)
#         fallback_result = {
#             'score': 50,
#             'understanding_level': 'Fair (Safe Mode)',
#             'key_topics': ['Content Analysis (Offline)', 'Safe Mode Active'],
#             'clarity_score': 70,
#             'main_issues': ['AI API Quota Exceeded - Running in Safe Mode'],
#             'recommendations': ['Check OpenAI Billing'],
#             'ai_feedback': "AI is currently offline due to quota limits. Basic analysis only."
#         }

#         if not self._is_available():
#             return fallback_result
        
#         try:
#             # --- ATTEMPT REAL AI CALL ---
#             # GPT-4o has a huge context window, so we increase the limit significantly
#             if len(content) > 15000:
#                 content = content[:15000] + "..."
            
#             prompt = f"""You are an AEO (Answer Engine Optimization) Expert. Analyze this content from {url}.
            
#             Determine how well an AI Search Engine (like SearchGPT or Perplexity) would understand this page.
            
#             Content:
#             {content}
            
#             Return a JSON object with:
#             - understanding_level: (Poor, Fair, Good, Excellent)
#             - key_topics: [List of top 3 entities/topics]
#             - clarity_score: (0-100)
#             - main_issues: [List of structural or clarity issues]
#             - recommendations: [Specific actionable fixes for AEO]
#             """
            
#             response = self.client.chat.completions.create(
#                 model="gpt-4o",  # ✅ Using GPT-4o for best AEO analysis
#                 messages=[
#                     {"role": "system", "content": "You are an expert AI Search Analyst. Output JSON only."},
#                     {"role": "user", "content": prompt}
#                 ],
#                 response_format={"type": "json_object"},
#                 temperature=0.3
#             )
            
#             # Parse JSON response
#             response_content = response.choices[0].message.content.strip()
#             result = json.loads(response_content)
            
#             # Calculate score based on understanding level
#             scores = {'Poor': 25, 'Fair': 50, 'Good': 75, 'Excellent': 95}
#             score = scores.get(result.get('understanding_level', 'Fair'), 50)
            
#             return {
#                 'score': score,
#                 'understanding_level': result.get('understanding_level', 'Unknown'),
#                 'key_topics': result.get('key_topics', []),
#                 'clarity_score': result.get('clarity_score', 0),
#                 'main_issues': result.get('main_issues', []),
#                 'recommendations': result.get('recommendations', []),
#                 'ai_feedback': "Analyzed by GPT-4o"
#             }
            
#         except Exception as e:
#             logging.error(f"OpenAI analysis failed (Swapping to Safe Mode): {str(e)}")
#             # RETURN FALLBACK INSTEAD OF CRASHING
#             return fallback_result

#     # --- NEW METHOD START: Schema Generation ---
#     def generate_schema(self, content: str, url: str, schema_type: str = 'auto') -> Dict:
#         """Generate JSON-LD Schema (Safe Mode)"""
#         if not self._is_available():
#             return {'success': False, 'error': 'OpenAI key missing'}

#         try:
#             if len(content) > 10000: content = content[:10000]

#             prompt = f"""Generate valid JSON-LD schema for this content. 
#             URL: {url}
#             Type preference: {schema_type}
            
#             Return ONLY the JSON object.
#             """

#             response = self.client.chat.completions.create(
#                 model="gpt-4o",
#                 messages=[
#                     {"role": "system", "content": "You are a Schema.org expert. Output strictly valid JSON-LD."},
#                     {"role": "user", "content": prompt + "\n\nContent:\n" + content}
#                 ],
#                 response_format={"type": "json_object"}
#             )
            
#             schema = json.loads(response.choices[0].message.content)
#             return {'success': True, 'schema': schema}
            
#         except Exception as e:
#             logging.error(f"Schema generation failed: {str(e)}")
#             return {'success': False, 'error': f"Quota Exceeded (Safe Mode): {str(e)}"}
#     # --- NEW METHOD END ---

#     # --- EXISTING DEVELOPER CODE PRESERVED BELOW (Unchanged Logic, Added Safety) ---
    
#     def analyze_tone_and_sentiment(self, content: str) -> Dict:
#         """
#         Analyze content tone and sentiment using OpenAI
#         SAFE MODE: Returns mock data on failure.
#         """
#         # Default Fallback
#         fallback_result = {
#             'score': 50,
#             'tone': 'Neutral (Safe Mode)',
#             'sentiment': 'Neutral',
#             'confidence': 0,
#             'emotional_indicators': [],
#             'recommendations': ['Check OpenAI Billing'],
#             'ai_feedback': "Service Unavailable (Quota Exceeded)"
#         }

#         if not self._is_available():
#             return fallback_result
        
#         try:
#             # Truncate content to reduce costs
#             max_content_length = 1500
#             if len(content) > max_content_length:
#                 content = content[:max_content_length] + "..."
            
#             # Shorter prompt to reduce costs
#             prompt = f"""Analyze tone and sentiment: {content}

# Provide tone, sentiment, confidence (0-100), emotional indicators, and recommendations.

# JSON:
# {{
#     "tone": "string",
#     "sentiment": "string", 
#     "confidence": number,
#     "emotional_indicators": ["indicator1", "indicator2"],
#     "recommendations": ["rec1", "rec2"]
# }}"""
            
#             response = self.client.chat.completions.create(
#                 model="gpt-3.5-turbo",
#                 messages=[
#                     {"role": "system", "content": "Tone and sentiment analyst. JSON only."},
#                     {"role": "user", "content": prompt}
#                 ],
#                 response_format={"type": "json_object"},
#                 max_completion_tokens=300,
#                 temperature=0.3
#             )
            
#             response_content = response.choices[0].message.content.strip()
#             logging.debug(f"OpenAI tone analysis response: {response_content[:200]}...")
#             result = json.loads(response_content)
            
#             # Calculate score based on sentiment and tone appropriateness
#             sentiment_scores = {'Positive': 80, 'Neutral': 60, 'Negative': 20}
#             tone_scores = {'Professional': 90, 'Academic': 85, 'Technical': 80, 'Friendly': 75, 'Casual': 60}
            
#             sentiment_score = sentiment_scores.get(result.get('sentiment', 'Neutral'), 60)
#             tone_score = tone_scores.get(result.get('tone', 'Casual'), 50)
            
#             # Average the scores
#             score = (sentiment_score + tone_score) // 2
            
#             return {
#                 'score': score,
#                 'tone': result.get('tone', 'Unknown'),
#                 'sentiment': result.get('sentiment', 'Neutral'),
#                 'confidence': result.get('confidence', 0),
#                 'emotional_indicators': result.get('emotional_indicators', []),
#                 'recommendations': result.get('recommendations', []),
#                 'ai_feedback': response.choices[0].message.content
#             }
            
#         except Exception as e:
#             logging.error(f"OpenAI tone analysis failed (Swapping to Safe Mode): {str(e)}")
#             return fallback_result
    
#     def analyze_answerability(self, content: str, questions: List[str] = None) -> Dict:
#         """
#         Analyze content answerability using AI feedback
#         SAFE MODE: Returns mock data on failure.
#         """
#         # Default Fallback
#         fallback_result = {
#             'score': 50,
#             'ai_answerability_score': 50,
#             'answered_questions': [],
#             'unanswered_questions': [],
#             'clarity_issues': ['Quota Exceeded'],
#             'recommendations': ['Check OpenAI Billing'],
#             'gpt_feedback': 'Service Unavailable'
#         }

#         if not self._is_available():
#             return fallback_result
        
#         try:
#             # Truncate content to reduce costs
#             max_content_length = 1500
#             if len(content) > max_content_length:
#                 content = content[:max_content_length] + "..."
            
#             # Generate questions if not provided
#             if not questions:
#                 questions = [
#                     "What is the main topic?",
#                     "What problem does this solve?",
#                     "What are the key benefits?",
#                     "What action should be taken?"
#                 ]
            
#             # Shorter prompt to reduce costs
#             prompt = f"""Analyze answerability: {content}

# Questions: {', '.join(questions)}

# Rate how well content answers questions (0-100), what's answered clearly, what's unclear, and recommendations.

# JSON:
# {{
#     "ai_answerability_score": number,
#     "answered_questions": ["q1", "q2"],
#     "unanswered_questions": ["q1", "q2"],
#     "clarity_issues": ["issue1", "issue2"],
#     "recommendations": ["rec1", "rec2"]
# }}"""
            
#             response = self.client.chat.completions.create(
#                 model="gpt-3.5-turbo",
#                 messages=[
#                     {"role": "system", "content": "Answerability analyst. JSON only."},
#                     {"role": "user", "content": prompt}
#                 ],
#                 response_format={"type": "json_object"},
#                 max_completion_tokens=400,
#                 temperature=0.3
#             )
            
#             response_content = response.choices[0].message.content.strip()
#             logging.debug(f"OpenAI answerability response: {response_content[:200]}...")
#             result = json.loads(response_content)
            
#             return {
#                 'score': result.get('ai_answerability_score', 0),
#                 'ai_answerability_score': result.get('ai_answerability_score', 0),
#                 'answered_questions': result.get('answered_questions', []),
#                 'unanswered_questions': result.get('unanswered_questions', []),
#                 'clarity_issues': result.get('clarity_issues', []),
#                 'recommendations': result.get('recommendations', []),
#                 'gpt_feedback': response.choices[0].message.content
#             }
            
#         except Exception as e:
#             logging.error(f"OpenAI answerability analysis failed (Swapping to Safe Mode): {str(e)}")
#             return fallback_result
    
#     def generate_content_summary(self, content: str, max_length: int = 200) -> str:
#         """
#         Generate AI-powered content summary
#         SAFE MODE: Returns simple string on failure.
#         """
#         if not self._is_available():
#             return "OpenAI service not available for summarization"
        
#         try:
#             # Truncate content to reduce costs
#             max_content_length = 1000
#             if len(content) > max_content_length:
#                 content = content[:max_content_length] + "..."
            
#             # Shorter prompt to reduce costs
#             prompt = f"""Summarize in {max_length} chars: {content}"""
            
#             response = self.client.chat.completions.create(
#                 model="gpt-3.5-turbo",
#                 messages=[
#                     {"role": "system", "content": "Concise summarizer."},
#                     {"role": "user", "content": prompt}
#                 ],
#                 max_completion_tokens=200,
#                 temperature=0.3
#             )
            
#             return response.choices[0].message.content.strip()
            
#         except Exception as e:
#             logging.error(f"OpenAI summarization failed: {str(e)}")
#             return "Summary unavailable (Quota Exceeded)"
    
#     def get_metric_help(self) -> Dict:
#         """
#         Static help text for metrics used across Prompt Intelligence and Tracking.
#         Contains 'meaning' and 'improve' guidance for each metric so frontend can
#         render tooltips consistently.
#         """
#         return {
#             "discover_prompts": {
#                 "content_type_accuracy": {
#                     "meaning": "How clearly the page signals its type (blog, product, FAQ, landing). Higher means layout, headings and cues make the type obvious.",
#                     "improve": "Tighten page structure: clear H1, sequential headings, consistent sectioning; add schema for the page type; keep CTAs and meta elements aligned to the type."
#                 },
#                 "prompt_intent_match": {
#                     "meaning": "How well the page answers the dominant user intent (informational, commercial, comparative, transactional, agent-style).",
#                     "improve": "Map content to the right journey stage. Add direct answers, comparisons or purchase paths. Use headings that echo the core questions users ask."
#                 },
#                 "visibility_impact": {
#                     "meaning": "Potential of the page to be surfaced by AI/search based on relevance, depth, freshness and authority signals.",
#                     "improve": "Increase topical depth, add supporting facts/entities, refresh content, strengthen internal links, add structured data and credible references."
#                 },
#                 "suggested_content_type": {
#                     "meaning": "Predicted page type inferred from structure and cues.",
#                     "improve": "Align layout and microcopy to the suggested type or refactor to the intended type with matching schema and UX patterns."
#                 }
#             },
#             "clusters_and_intent": {
#                 "clustering_accuracy": {
#                     "meaning": "Confidence that prompts were assigned to the correct intent buckets.",
#                     "improve": "Make intent cues explicit: question-style headings for informational, pricing/specs for commercial, comparison tables for comparative, clear CTAs for transactional."
#                 },
#                 "coverage_percentage": {
#                     "meaning": "Percent of considered prompts that could be confidently mapped to one of the five intents.",
#                     "improve": "Add sections that address missing intents. If many prompts are uncategorized, clarify the page focus and reduce mixed content."
#                 },
#                 "total_prompts": {
#                     "meaning": "Total number of candidate prompts inferred for the page.",
#                     "improve": "Expand topic coverage with FAQs, comparisons and how‑to sections to naturally capture more relevant prompts."
#                 },
#                 "intent_meanings": {
#                     "informational": "Users seek knowledge or answers. Expect questions and how‑to content.",
#                     "commercial": "Users research solutions, features and suitability. Expect specs, pricing ranges and benefits.",
#                     "comparative": "Users compare options. Expect side‑by‑side tables, pros/cons and differentiators.",
#                     "transactional": "Users want to take action. Expect CTAs, checkout/signup and trust signals.",
#                     "agent_style": "Assistant/chat style interactions where short, direct responses and structured facts matter."
#                 }
#             },
#             "difficulty_and_opportunity": {
#                 "difficulty_score": {
#                     "meaning": "How hard it is to win the prompt given current content strength and competition signals.",
#                     "improve": "Target sub‑prompts with clearer angles; strengthen page authority through internal links, entities and references; increase answer density."
#                 },
#                 "complexity_level": {
#                     "meaning": "Keyword/prompt complexity based on diversity and phrase length.",
#                     "improve": "Break complex prompts into structured sections. Use scannable headings and tables to simplify evaluation."
#                 },
#                 "ai_generation_feasibility": {
#                     "meaning": "Likelihood that models can produce confident answers from this page.",
#                     "improve": "Add explicit facts, definitions, step‑by‑steps and schema so models can extract reliable snippets."
#                 }
#             },
#             "entity_detection": {
#                 "entities_detected_count": {
#                     "meaning": "How many expected/required entities were found in the content. Higher means the page mentions more of the important concepts that search engines and AI systems use for understanding.",
#                     "improve": "Add missing entities naturally in headings, definitions, lists and FAQs. Use synonyms and related terms, and connect entities with clear relationships (e.g., features, benefits, steps, comparisons)."
#                 },
#                 "entity_coverage_score": {
#                     "meaning": "Percent of the required entity set that appears in the content. A higher score indicates broader topical coverage around the page's main subject.",
#                     "improve": "Review missing entities and add dedicated sections that explain them. Include supporting facts, examples, and internal links to strengthen topical completeness."
#                 },
#                 "entity_relevance_score": {
#                     "meaning": "How closely the entities found on the page align with the likely search intent and queries. Higher means the page entities are on-topic and reinforce the core topic.",
#                     "improve": "Remove or de-emphasize off-topic entities, tighten the page focus, and expand sections that directly answer the main user questions. Align headings and examples to the target intent."
#                 }
#             },
#             "visibility_breakdown": {
#                 "visibility_score_breakdown": {
#                     "meaning": "Component scores that contribute to overall visibility. Each factor highlights a different reason the page may (or may not) be surfaced by search and AI systems.",
#                     "improve": "Improve the lowest factor first. Strengthen topical alignment (keywords), depth (coverage), freshness (updates), and authority (sources and trust signals)."
#                 },
#                 "keyword_relevance": {
#                     "meaning": "How well the page language aligns with target queries and topic terms. Higher means the content uses the right words in the right places for the intended searches.",
#                     "improve": "Strengthen topical terms in the H1/H2s, intro, and key sections. Add related phrases and questions users ask, without keyword stuffing."
#                 },
#                 "content_depth": {
#                     "meaning": "How thoroughly the page covers the topic compared to what users expect. Higher means the content answers more questions with enough detail.",
#                     "improve": "Add missing subtopics, step-by-step explanations, examples, and comparison tables. Expand thin sections and ensure the page has a clear, scannable structure."
#                 },
#                 "freshness": {
#                     "meaning": "How up-to-date the information appears. Higher means the content reflects recent changes and current best practices.",
#                     "improve": "Update outdated stats, tools, and recommendations. Add a visible 'last updated' and refresh sections that change over time (pricing, features, regulations)."
#                 },
#                 "authority_signals": {
#                     "meaning": "How credible and trustworthy the page looks based on sources, expertise, and supporting signals. Higher means stronger E-E-A-T cues.",
#                     "improve": "Add expert authorship, citations to reputable sources, original data/examples, strong internal linking, and trust elements like policies, reviews, and credentials."
#                 }
#             },
#             "add_to_tracking": {
#                 "prompt_visibility_score": {
#                     "meaning": "Estimated visibility of the prompt in AI results (0–100). Combines position and page quality.",
#                     "improve": "Improve ranking signals: clearer intent match, richer entities, stronger internal links and citations."
#                 },
#                 "ctr_percent": {
#                     "meaning": "Estimated click‑through rate for the prompt given visibility and engagement.",
#                     "improve": "Increase snippet appeal: concise answers up top, compelling meta/snippet text and relevant sub‑sections."
#                 },
#                 "engagement_score": {
#                     "meaning": "Estimated engagement quality based on content depth and credibility.",
#                     "improve": "Add expert signals, examples, data and clear structure to keep users engaged."
#                 },
#                 "traffic_estimate": {
#                     "meaning": "Relative traffic potential derived from visibility, engagement and citation counts.",
#                     "improve": "Prioritize prompts with high intent and improve entry points (internal links, hub pages) to funnel traffic."
#                 },
#                 "visibility_change": {
#                     "meaning": "Change in visibility since previous measurement.",
#                     "improve": "Track edits vs change. Double‑down on edits that moved the metric; revert or refine ones that hurt."
#                 }
#             }
#         }
    
#     def analyze_content_metrics(self, content: str, url: str) -> Dict:
#         """
#         Analyze three key metrics + prompt intent clustering:
#         1. Accuracy of content type suggestion
#         2. Match with prompt intent
#         3. Potential impact on visibility
#         4. Prompt clusters across intent types (informational, commercial, comparative, transactional, agent-style)
        
#         Returns comprehensive metrics for AEO optimization, including:
#         - High-level scores (content_type_accuracy, prompt_intent_match, visibility_impact)
#         - Prompt intent details with:
#           - matched_intents
#           - confidence
#           - search_queries
#           - intent_clusters (per-intent counts and examples)
#           - cluster_metrics (accuracy, coverage, totals)
#         """
#         fallback_result = {
#             'content_type_accuracy': 50,
#             'prompt_intent_match': 50,
#             'visibility_impact': 50,
#             'suggested_content_type': 'Unknown (Safe Mode)',
#             'prompt_intent_details': {
#                 'matched_intents': [],
#                 'confidence': 0,
#                 'search_queries': [],
#                 'intent_clusters': {
#                     'informational': {'prompt_count': 0, 'example_prompts': []},
#                     'commercial': {'prompt_count': 0, 'example_prompts': []},
#                     'comparative': {'prompt_count': 0, 'example_prompts': []},
#                     'transactional': {'prompt_count': 0, 'example_prompts': []},
#                     'agent_style': {'prompt_count': 0, 'example_prompts': []},
#                 },
#                 'cluster_metrics': {
#                     'total_prompts': 0,
#                     'categorized_prompts': 0,
#                     'coverage_percentage': 0.0,
#                     'clustering_accuracy': 0.0,
#                 },
#             },
#             'visibility_factors': {
#                 'factors': ['Service Unavailable'],
#                 'score_breakdown': {},
#                 'recommendations': ['Check OpenAI Billing']
#             }
#         }

#         if not self._is_available():
#             return fallback_result
        
#         try:
#             # Truncate content for cost efficiency
#             if len(content) > 12000:
#                 content = content[:12000] + "..."
            
#             prompt = f"""You are an AEO (Answer Engine Optimization) Expert. Analyze this content from {url}.

# Content:
# {content}

# Analyze and return a JSON object with:

# 1. **Content Type Accuracy** (0-100): How accurately can you identify the content type?
#    - Analyze: blog post, product page, FAQ, landing page, article, tutorial, documentation, etc.
#    - Consider: structure, formatting, headings, call-to-actions, metadata
#    - Score: 0-100 based on how clear/obvious the content type is

# 2. **Prompt Intent Match** (0-100): How well does this content match user search intent?
#    - Primary intent types to consider:
#      - informational
#      - commercial (commercial investigation, product/service research)
#      - comparative (comparing options or alternatives)
#      - transactional (purchase or action-focused)
#      - agent_style (chatbot/assistant style queries or interactions)
#    - Consider: question patterns, keyword alignment, user journey stage
#    - Score: 0-100 based on how well content satisfies likely search queries

# 3. **Visibility Impact** (0-100): Potential impact on search visibility/ranking
#    - Factors: keyword relevance, content depth, freshness, authority signals, schema markup potential
#    - Consider: uniqueness, comprehensiveness, E-A-T signals, technical SEO
#    - Score: 0-100 based on potential to rank and gain visibility

# 4. **Prompt Intent Clusters**: Examine the implicit and explicit prompts/queries a user might ask that this content answers.
#    - Cluster those prompts into the 5 intent types above.
#    - For each cluster, estimate:
#        - prompt_count: how many prompts you would assign to this cluster
#        - example_prompts: list of 1-3 example natural-language prompts typical for this intent on this page
#    - Also calculate:
#        - total_prompts: total prompts you considered across all clusters
#        - categorized_prompts: how many of those prompts you could confidently assign to one of the 5 clusters
#        - coverage_percentage: (categorized_prompts / max(total_prompts,1)) * 100, rounded to 1 decimal place
#        - clustering_accuracy: your estimated accuracy (0-1 range) of the clustering you produced

# Return JSON:
# {{
#     "content_type_accuracy": number,
#     "suggested_content_type": "string (e.g., 'blog', 'product', 'faq', 'landing_page')",
#     "prompt_intent_match": number,
#     "prompt_intent_details": {{
#         "matched_intents": ["informational", "transactional", "commercial", "comparative", "agent_style"],
#         "confidence": number (0-100),
#         "search_queries": ["example query 1", "example query 2"],
#         "intent_clusters": {{
#             "informational": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
#             "commercial": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
#             "comparative": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
#             "transactional": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}},
#             "agent_style": {{"prompt_count": number, "example_prompts": ["prompt1", "prompt2"]}}
#         }},
#         "cluster_metrics": {{
#             "total_prompts": number,
#             "categorized_prompts": number,
#             "coverage_percentage": number,
#             "clustering_accuracy": number
#         }}
#     }},
#     "visibility_impact": number,
#     "visibility_factors": {{
#         "factors": ["factor1", "factor2"],
#         "score_breakdown": {{
#             "keyword_relevance": number,
#             "content_depth": number,
#             "freshness": number,
#             "authority_signals": number
#         }},
#         "recommendations": ["rec1", "rec2"]
#     }}
# }}"""

#             response = self.client.chat.completions.create(
#                 model="gpt-4o",
#                 messages=[
#                     {"role": "system", "content": "You are an expert AEO analyst. Output JSON only with accurate metrics."},
#                     {"role": "user", "content": prompt}
#                 ],
#                 response_format={"type": "json_object"},
#                 temperature=0.3
#             )
            
#             response_content = response.choices[0].message.content.strip()
#             result = json.loads(response_content)
            
#             prompt_intent_details = result.get('prompt_intent_details', {}) or {}

#             # Ensure nested structures exist so frontend can safely rely on them
#             intent_clusters = prompt_intent_details.get('intent_clusters') or {
#                 'informational': {'prompt_count': 0, 'example_prompts': []},
#                 'commercial': {'prompt_count': 0, 'example_prompts': []},
#                 'comparative': {'prompt_count': 0, 'example_prompts': []},
#                 'transactional': {'prompt_count': 0, 'example_prompts': []},
#                 'agent_style': {'prompt_count': 0, 'example_prompts': []},
#             }
#             cluster_metrics = prompt_intent_details.get('cluster_metrics') or {
#                 'total_prompts': 0,
#                 'categorized_prompts': 0,
#                 'coverage_percentage': 0.0,
#                 'clustering_accuracy': 0.0,
#             }

#             # Backfill into prompt_intent_details object
#             prompt_intent_details.setdefault('matched_intents', [])
#             prompt_intent_details.setdefault('confidence', 0)
#             prompt_intent_details.setdefault('search_queries', [])
#             prompt_intent_details['intent_clusters'] = intent_clusters
#             prompt_intent_details['cluster_metrics'] = cluster_metrics

#             visibility_factors = result.get('visibility_factors', {}) or {}
#             visibility_factors.setdefault('factors', [])
#             visibility_factors.setdefault('score_breakdown', {})
#             visibility_factors.setdefault('recommendations', [])

#             return {
#                 'content_type_accuracy': result.get('content_type_accuracy', 50),
#                 'prompt_intent_match': result.get('prompt_intent_match', 50),
#                 'visibility_impact': result.get('visibility_impact', 50),
#                 'suggested_content_type': result.get('suggested_content_type', 'Unknown'),
#                 'prompt_intent_details': prompt_intent_details,
#                 'visibility_factors': visibility_factors,
#                 'metric_help': {
#                     **self.get_metric_help().get("discover_prompts", {}),
#                     **self.get_metric_help().get("clusters_and_intent", {}),
#                     **self.get_metric_help().get("entity_detection", {}),
#                     **self.get_metric_help().get("visibility_breakdown", {}),
#                 },
#             }
            
#         except Exception as e:
#             logging.error(f"Content metrics analysis failed (Safe Mode): {str(e)}")
#             return fallback_result
    
#     def analyze_entity_relevance(self, content: str, url: str, found_entities: list, expected_entities: list) -> Dict:
#         """
#         Analyze how relevant the found entities are to the user's search intent/prompt.
#         Returns relevance score (0-100) based on how well entities match search intent.
#         """
#         fallback_result = {
#             'entity_relevance_score': 50,
#             'relevance_explanation': 'Analysis unavailable',
#             'relevant_entities': [],
#             'irrelevant_entities': []
#         }
        
#         if not self._is_available():
#             return fallback_result
        
#         try:
#             if len(content) > 10000:
#                 content = content[:10000] + "..."
            
#             # Prepare entity lists
#             found_str = ", ".join(found_entities[:20]) if found_entities else "None"
#             expected_str = ", ".join(expected_entities[:20]) if expected_entities else "None"
            
#             prompt = f"""You are an AEO (Answer Engine Optimization) Expert. Analyze entity relevance for content from {url}.

# Content Preview:
# {content}

# Found Entities: {found_str}
# Expected Entities: {expected_str}

# Analyze how RELEVANT the found entities are to typical user search queries and search intent for this content.

# Return JSON:
# {{
#     "entity_relevance_score": number (0-100),
#     "relevance_explanation": "string explaining relevance",
#     "relevant_entities": ["list of entities highly relevant to search intent"],
#     "irrelevant_entities": ["list of entities that don't match search intent well"]
# }}

# Scoring Guide:
# - 80-100: Entities perfectly match search intent and user queries
# - 60-79: Most entities are relevant, some minor gaps
# - 40-59: Mixed relevance, some entities don't match intent
# - 0-39: Entities poorly match search intent"""
            
#             response = self.client.chat.completions.create(
#                 model="gpt-4o",
#                 messages=[
#                     {"role": "system", "content": "You are an expert AEO analyst. Output JSON only."},
#                     {"role": "user", "content": prompt}
#                 ],
#                 response_format={"type": "json_object"},
#                 temperature=0.3
#             )
            
#             response_content = response.choices[0].message.content.strip()
#             result = json.loads(response_content)
            
#             return {
#                 'entity_relevance_score': result.get('entity_relevance_score', 50),
#                 'relevance_explanation': result.get('relevance_explanation', ''),
#                 'relevant_entities': result.get('relevant_entities', []),
#                 'irrelevant_entities': result.get('irrelevant_entities', [])
#             }
            
#         except Exception as e:
#             logging.error(f"Entity relevance analysis failed: {str(e)}")
#             return fallback_result

#     def calculate_prompt_tracking_metrics(self, job_id: str, url: str, prompts: List[str]) -> Dict:
#         mongo_manager.connect()

#         cleaned_prompts = []
#         for p in prompts or []:
#             if isinstance(p, str):
#                 s = p.strip()
#                 if s:
#                     cleaned_prompts.append(s)

#         prompt_tracking_col = mongo_manager.db.prompt_tracking
#         existing = prompt_tracking_col.find_one({"jobId": job_id}) or {}

#         existing_tracked = existing.get("tracked_prompts") or []
#         tracked_prompts = sorted(set([p for p in existing_tracked if isinstance(p, str) and p.strip()] + cleaned_prompts))

#         content_doc = mongo_manager.content_metrics.find_one({"jobId": job_id, "url": url}) or {}
#         content_metrics = content_doc.get("content_metrics") or {}
#         prompt_intent_details = content_metrics.get("prompt_intent_details") or {}
#         linked_queries = prompt_intent_details.get("search_queries") or []
#         if not isinstance(linked_queries, list):
#             linked_queries = []
#         linked_queries = [q for q in linked_queries if isinstance(q, str) and q.strip()]

#         module_e_doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
#         ranking_analysis = module_e_doc.get("ranking_analysis") or {}
#         ranking_rows = ranking_analysis.get("ranking_position_per_prompt") or []
#         if not isinstance(ranking_rows, list):
#             ranking_rows = []

#         raw_html = ""
#         try:
#             raw_html = load_raw_html_sync(job_id) or ""
#         except Exception:
#             raw_html = ""

#         visible_text = ""
#         heading_text = ""
#         if raw_html and BeautifulSoup is not None:
#             try:
#                 soup = BeautifulSoup(raw_html, "html.parser")
#                 for tag in soup(["script", "style", "nav", "footer", "header"]):
#                     tag.decompose()
#                 title_text = ""
#                 try:
#                     title_text = soup.title.get_text(" ", strip=True) if soup.title else ""
#                 except Exception:
#                     title_text = ""
#                 try:
#                     h_nodes = soup.find_all(["h1", "h2"], limit=8)
#                     heading_text = " ".join([h.get_text(" ", strip=True) for h in h_nodes if h])
#                 except Exception:
#                     heading_text = ""
#                 visible_text = soup.get_text(separator=" ", strip=True)
#                 visible_text = " ".join((visible_text or "").split())
#             except Exception:
#                 visible_text = ""
#                 heading_text = ""

#         page_prompt_intent_match = content_metrics.get("prompt_intent_match")
#         page_visibility_impact = content_metrics.get("visibility_impact")
#         page_scores: List[float] = []
#         if isinstance(page_prompt_intent_match, (int, float)):
#             page_scores.append(float(page_prompt_intent_match))
#         if isinstance(page_visibility_impact, (int, float)):
#             page_scores.append(float(page_visibility_impact))
#         page_quality_score = round(sum(page_scores) / len(page_scores), 2) if page_scores else 50.0

#         stopwords = {
#             "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "at", "by", "from", "as",
#             "is", "are", "was", "were", "be", "been", "being", "it", "this", "that", "these", "those",
#             "i", "you", "we", "they", "he", "she", "them", "us", "our", "your", "my", "me",
#             "what", "how", "why", "when", "where", "who", "which",
#             "best", "top", "near", "vs", "versus",
#         }

#         def tokenize(text: str) -> List[str]:
#             toks = re.findall(r"[a-z0-9]+", (text or "").lower())
#             return [t for t in toks if len(t) > 2 and t not in stopwords]

#         content_token_list = tokenize(visible_text[:30000]) if visible_text else []
#         content_tokens = set(content_token_list) if content_token_list else set()
#         heading_tokens = set(tokenize(heading_text)) if heading_text else set()
#         query_tokens = [set(tokenize(q)) for q in linked_queries[:50]]

#         def similarity_to_queries(prompt_tokens: set) -> float:
#             if not prompt_tokens:
#                 return 0.0
#             best = 0.0
#             for qt in query_tokens:
#                 if not qt:
#                     continue
#                 inter = len(prompt_tokens.intersection(qt))
#                 score = inter / max(len(prompt_tokens), 1)
#                 if score > best:
#                     best = score
#             return best

#         content_counts: Dict[str, int] = {}
#         for t in content_token_list:
#             content_counts[t] = content_counts.get(t, 0) + 1
#         total_terms = len(content_token_list)
#         max_idf = (math.log(total_terms + 1) + 1.0) if total_terms > 0 else 1.0

#         def idf_norm(tf: int) -> float:
#             return (math.log((total_terms + 1) / (tf + 1)) + 1.0) / max_idf if max_idf > 0 else 0.0

#         def content_relevance(prompt_tokens: List[str]) -> float:
#             toks = sorted(set(prompt_tokens))
#             if not toks:
#                 return 0.0
#             denom = float(len(toks))
#             tf_cap = 8
#             strength_den = math.log(1 + tf_cap)
#             s = 0.0
#             for tok in toks:
#                 tf = content_counts.get(tok, 0)
#                 if tf <= 0:
#                     continue
#                 strength = math.log(1 + tf) / strength_den if strength_den > 0 else 0.0
#                 if strength > 1.0:
#                     strength = 1.0
#                 s += idf_norm(tf) * strength
#             return s / denom

#         def clamp(n: float, lo: float, hi: float) -> float:
#             return max(lo, min(hi, n))

#         def position_to_visibility(position: Optional[float]) -> float:
#             if position is None:
#                 return 0.0
#             try:
#                 p = int(position)
#             except Exception:
#                 return 0.0
#             if p <= 0 or p > 10:
#                 return 0.0
#             return round(((11 - p) / 10) * 100, 2)

#         history = existing.get("history") or {}
#         if not isinstance(history, dict):
#             history = {}

#         now = datetime.utcnow().isoformat()
#         metrics: List[Dict] = []

#         for prompt in tracked_prompts:
#             rows = [r for r in ranking_rows if isinstance(r, dict) and (r.get("prompt") or "") == prompt]

#             model_ranking: Dict[str, Optional[int]] = {}
#             visibility_components: List[float] = []
#             engagement_components: List[float] = []
#             traffic_components: List[float] = []

#             for r in rows:
#                 model = r.get("model")
#                 if isinstance(model, str) and model:
#                     pos = r.get("position")
#                     model_ranking[model] = int(pos) if isinstance(pos, (int, float)) else None
#                 visibility_components.append(position_to_visibility(r.get("position")))

#                 cq = r.get("content_quality_score")
#                 cr = r.get("credibility_score")
#                 vals: List[float] = []
#                 if isinstance(cq, (int, float)):
#                     vals.append(float(cq))
#                 if isinstance(cr, (int, float)):
#                     vals.append(float(cr))
#                 if vals:
#                     engagement_components.append(sum(vals) / len(vals))

#                 total_cited = r.get("total_cited")
#                 citation_count = r.get("citation_count")
#                 if isinstance(citation_count, (int, float)):
#                     traffic_components.append(float(citation_count))
#                 elif isinstance(total_cited, (int, float)):
#                     traffic_components.append(float(total_cited))

#             prompt_visibility_score = (
#                 round(sum(visibility_components) / len(visibility_components), 2) if visibility_components else 0.0
#             )
#             engagement_score = (
#                 round(sum(engagement_components) / len(engagement_components), 2) if engagement_components else page_quality_score
#             )
#             traffic_estimate = (
#                 round(sum(traffic_components) / len(traffic_components), 2) if traffic_components else 0.0
#             )
#             ctr_percent = round((prompt_visibility_score / 100) * (engagement_score / 100) * 25, 2)

#             if not rows:
#                 ptok_list = tokenize(prompt)
#                 ptok_set = set(ptok_list)
#                 qsim = similarity_to_queries(ptok_set)
#                 csim = content_relevance(ptok_list)
#                 hsim = (len(ptok_set.intersection(heading_tokens)) / max(len(ptok_set), 1)) if heading_tokens and ptok_set else 0.0

#                 phrase_bonus = 0.0
#                 if visible_text and prompt and len(prompt.split()) >= 2:
#                     try:
#                         phrase_bonus = 0.15 if prompt.lower() in visible_text.lower() else 0.0
#                     except Exception:
#                         phrase_bonus = 0.0

#                 relevance = clamp((0.6 * csim) + (0.25 * qsim) + (0.15 * hsim) + phrase_bonus, 0, 1)
#                 if len(ptok_set) == 1:
#                     single = next(iter(ptok_set), "")
#                     tf = content_counts.get(single, 0)
#                     if tf > 0 and idf_norm(tf) < 0.18:
#                         relevance = min(relevance, 0.35)
#                     relevance *= 0.75

#                 prompt_visibility_score = round(clamp(10 + 90 * relevance * (0.55 + (page_quality_score / 220)), 0, 100), 2)
#                 engagement_score = round(clamp(30 + 70 * ((page_quality_score / 100) * 0.6 + relevance * 0.4), 0, 100), 2)
#                 traffic_estimate = round(clamp((prompt_visibility_score / 100) * (engagement_score / 100) * (5 + min(len(linked_queries), 20) / 2), 0, 25), 2)
#                 ctr_percent = round(clamp((prompt_visibility_score / 100) * (engagement_score / 100) * 30, 0, 30), 2)

#             prompt_history = history.get(prompt) or []
#             if not isinstance(prompt_history, list):
#                 prompt_history = []

#             trend_point = {
#                 "date": now,
#                 "visibility_score": prompt_visibility_score,
#                 "ctr_percent": ctr_percent,
#                 "engagement_score": engagement_score,
#                 "traffic_estimate": traffic_estimate,
#             }
#             prompt_history.append(trend_point)
#             prompt_history = prompt_history[-60:]
#             history[prompt] = prompt_history

#             previous = prompt_history[-2] if len(prompt_history) >= 2 else None
#             visibility_change = None
#             if previous and isinstance(previous.get("visibility_score"), (int, float)):
#                 visibility_change = round(prompt_visibility_score - float(previous["visibility_score"]), 2)

#             metrics.append(
#                 {
#                     "prompt": prompt,
#                     "prompt_visibility_score": prompt_visibility_score,
#                     "ctr_percent": ctr_percent,
#                     "engagement_score": engagement_score,
#                     "traffic_estimate": traffic_estimate,
#                     "ai_model_ranking": model_ranking,
#                     "linked_queries": linked_queries,
#                     "visibility_change": visibility_change,
#                     "trend": prompt_history[-14:],
#                     "updated_at": now,
#                     "calculation_method": "ranking" if rows else "estimated",
#                 }
#             )

#         doc = {
#             "jobId": job_id,
#             "url": url,
#             "tracked_prompts": tracked_prompts,
#             "metrics": metrics,
#             "history": history,
#             "updatedAt": datetime.utcnow(),
#             "metric_help": self.get_metric_help().get("add_to_tracking", {}),
#         }

#         prompt_tracking_col.update_one(
#             {"jobId": job_id},
#             {"$set": doc, "$setOnInsert": {"createdAt": datetime.utcnow()}},
#             upsert=True,
#         )

#         doc["updatedAt"] = now
#         doc["createdAt"] = (existing.get("createdAt") or datetime.utcnow()).isoformat() if hasattr((existing.get("createdAt") or datetime.utcnow()), "isoformat") else now
#         return doc

"""
Anthropic Claude Integration Service
Provides AI-powered content analysis and understanding for Colytics AEO platform.

Replaces the previous AI service entirely. Uses:
  - anthropic Python SDK  (pip install anthropic)
  - Model: claude-sonnet-4-5  (fast, cost-efficient, excellent JSON output)
  - Environment variable: ANTHROPIC_API_KEY

SAFE MODE: Every method returns a structured fallback if the API is
unavailable or quota is exceeded — no KeyErrors downstream.

All calculation fixes from the previous review are preserved:
  - Weighted page_quality_score (55% intent, 45% visibility)
  - Standard IDF formula (no max_idf normalisation)
  - Jaccard similarity (not intersection/prompt_len)
  - Visibility formula with clean quality interpolation
  - Unified CTR formula (×30) in both calculation paths
  - visibility_change stored as None when no prior data point exists
  - All scores clamped to [0, 100] before return
"""

import os
import re
import json
import math
import logging
from typing import Dict, List, Optional
from datetime import datetime

import anthropic  # pip install anthropic

from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync

try:
    from bs4 import BeautifulSoup
except Exception:
    BeautifulSoup = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp a numeric value to [lo, hi]."""
    return max(lo, min(hi, float(value)))


def _safe_mean(values: List[float]) -> float:
    """Return mean of a non-empty list, or 0.0."""
    return sum(values) / len(values) if values else 0.0


# Stopwords shared by all tokenisers
_STOPWORDS = {
    "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with",
    "at", "by", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "it", "this", "that", "these", "those", "i", "you", "we",
    "they", "he", "she", "them", "us", "our", "your", "my", "me",
    "what", "how", "why", "when", "where", "who", "which",
    "best", "top", "near", "vs", "versus",
}


def _tokenize(text: str) -> List[str]:
    """Lowercase, split on non-alphanumeric, drop stopwords and short tokens."""
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [t for t in tokens if len(t) > 2 and t not in _STOPWORDS]


# ---------------------------------------------------------------------------
# Main service class
# ---------------------------------------------------------------------------

class ClaudeService:
    """
    Anthropic Claude-powered content analysis for Colytics AEO platform.

    All public method signatures and return shapes are identical to the
    previous service — no changes needed in calling code except:
    replace the old service class with ClaudeService().

    Set ANTHROPIC_API_KEY in your environment (or .env loaded by your app).
    """

    # The model to use for all calls.
    # claude-sonnet-4-5 = best balance of speed, cost, and JSON quality.
    # Swap to claude-opus-4-5 for maximum reasoning on complex prompts.
    MODEL = "claude-sonnet-4-5"

    # Token budgets per call type
    _TOKENS_LARGE  = 1024   # full analysis calls
    _TOKENS_MEDIUM = 512    # lighter calls
    _TOKENS_SMALL  = 256    # summaries

    def __init__(self):
        self.client: Optional[anthropic.Anthropic] = None
        self.api_key = os.getenv("ANTHROPIC_API_KEY")

        if self.api_key:
            try:
                self.client = anthropic.Anthropic(api_key=self.api_key)
                logging.info("Anthropic Claude client initialised successfully")
            except Exception as exc:
                logging.error("Failed to initialise Anthropic client: %s", exc)
        else:
            logging.warning("ANTHROPIC_API_KEY not found in environment variables")

    # ------------------------------------------------------------------
    # Availability guard
    # ------------------------------------------------------------------

    def _is_available(self) -> bool:
        return self.client is not None

    # ------------------------------------------------------------------
    # Core API call helper
    # ------------------------------------------------------------------

    def _call(
        self,
        system: str,
        user: str,
        max_tokens: int = None,
        expect_json: bool = True,
    ) -> str:
        """
        Make a single Claude API call and return the text response.

        Uses the Messages API:
          client.messages.create(
              model=..., max_tokens=...,
              system=...,
              messages=[{"role": "user", "content": ...}]
          )

        If expect_json=True, appends a reminder to return only JSON.
        Raises exceptions — callers must catch and return fallback.
        """
        if max_tokens is None:
            max_tokens = self._TOKENS_LARGE

        # Claude responds better with an explicit JSON-only reminder
        full_user = user
        if expect_json:
            full_user = user + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanation, no code fences."

        message = self.client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": full_user}],
        )

        # Claude returns content as a list of blocks
        # For text responses, block.type == "text"
        return message.content[0].text.strip()

    def _parse_json(self, raw: str) -> dict:
        """
        Parse JSON from Claude's response.
        Strips markdown fences if Claude accidentally adds them.
        """
        # Remove ```json ... ``` or ``` ... ``` wrappers
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned.strip())

    # ------------------------------------------------------------------
    # 1. Content understanding
    # ------------------------------------------------------------------

    def analyze_content_understanding(self, content: str, url: str) -> Dict:
        """
        Ask Claude how well an AI search engine would understand this page.
        Returns: score, understanding_level, key_topics, clarity_score,
                 main_issues, recommendations, ai_feedback
        """
        fallback = {
            "score": 50,
            "understanding_level": "Fair (Safe Mode)",
            "key_topics": ["Content Analysis (Offline)", "Safe Mode Active"],
            "clarity_score": 70,
            "main_issues": ["Anthropic API unavailable — running in safe mode"],
            "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            "ai_feedback": "Claude is currently offline. Basic analysis only.",
        }

        if not self._is_available():
            return fallback

        try:
            if len(content) > 15_000:
                content = content[:15_000] + "..."

            user_prompt = f"""You are an AEO (Answer Engine Optimisation) Expert. Analyse this content from {url}.

Determine how well an AI Search Engine (like Perplexity or SearchGPT) would understand this page.

Content:
{content}

Return a JSON object with exactly these keys:
- "understanding_level": one of "Poor", "Fair", "Good", "Excellent"
- "key_topics": array of top 3 entities or topics
- "clarity_score": integer 0-100
- "main_issues": array of structural or clarity issues
- "recommendations": array of specific actionable AEO fixes"""

            raw = self._call(
                system="You are an expert AI Search Analyst. Output JSON only.",
                user=user_prompt,
                max_tokens=self._TOKENS_LARGE,
            )
            result = self._parse_json(raw)

            level_scores = {"Poor": 25, "Fair": 50, "Good": 75, "Excellent": 95}
            score = level_scores.get(result.get("understanding_level", "Fair"), 50)

            return {
                "score": _clamp(score),
                "understanding_level": result.get("understanding_level", "Unknown"),
                "key_topics": result.get("key_topics", []),
                "clarity_score": _clamp(result.get("clarity_score", 0)),
                "main_issues": result.get("main_issues", []),
                "recommendations": result.get("recommendations", []),
                "ai_feedback": f"Analysed by Claude ({self.MODEL})",
            }

        except Exception as exc:
            logging.error("Claude content understanding failed (safe mode): %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 2. Schema generation
    # ------------------------------------------------------------------

    def generate_schema(self, content: str, url: str, schema_type: str = "auto") -> Dict:
        """Generate valid JSON-LD schema markup for a URL."""
        if not self._is_available():
            return {"success": False, "error": "ANTHROPIC_API_KEY missing"}

        try:
            if len(content) > 10_000:
                content = content[:10_000]

            user_prompt = f"""Generate valid JSON-LD schema markup for this content.
URL: {url}
Type preference: {schema_type}

Content:
{content}

Return ONLY the JSON-LD object. Start with {{ and end with }}."""

            raw = self._call(
                system="You are a Schema.org expert. Output strictly valid JSON-LD only.",
                user=user_prompt,
                max_tokens=self._TOKENS_LARGE,
            )
            schema = self._parse_json(raw)
            return {"success": True, "schema": schema}

        except Exception as exc:
            logging.error("Schema generation failed: %s", exc)
            return {"success": False, "error": f"Claude API error (safe mode): {exc}"}

    # ------------------------------------------------------------------
    # 3. Tone and sentiment
    # ------------------------------------------------------------------

    def analyze_tone_and_sentiment(self, content: str) -> Dict:
        """
        Analyse content tone and sentiment.
        Returns: score, tone, sentiment, confidence, emotional_indicators,
                 recommendations, ai_feedback
        """
        fallback = {
            "score": 50,
            "tone": "Neutral (Safe Mode)",
            "sentiment": "Neutral",
            "confidence": 0,
            "emotional_indicators": [],
            "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            "ai_feedback": "Service unavailable",
        }

        if not self._is_available():
            return fallback

        try:
            if len(content) > 1_500:
                content = content[:1_500] + "..."

            user_prompt = f"""Analyse the tone and sentiment of the following content.

Content:
{content}

Return a JSON object with exactly these keys:
- "tone": string (e.g. "Professional", "Casual", "Academic", "Technical", "Friendly")
- "sentiment": one of "Positive", "Neutral", "Negative"
- "confidence": integer 0-100
- "emotional_indicators": array of strings
- "recommendations": array of strings"""

            raw = self._call(
                system="You are a tone and sentiment analyst. Output JSON only.",
                user=user_prompt,
                max_tokens=self._TOKENS_MEDIUM,
            )
            result = self._parse_json(raw)

            # Weighted score: sentiment 60%, tone 40%
            sentiment_scores = {"Positive": 85, "Neutral": 60, "Negative": 20}
            tone_scores = {
                "Professional": 90, "Academic": 85, "Technical": 80,
                "Friendly": 75, "Casual": 60,
            }
            s_score = sentiment_scores.get(result.get("sentiment", "Neutral"), 60)
            t_score = tone_scores.get(result.get("tone", "Casual"), 55)
            score = _clamp(0.6 * s_score + 0.4 * t_score)

            return {
                "score": round(score, 2),
                "tone": result.get("tone", "Unknown"),
                "sentiment": result.get("sentiment", "Neutral"),
                "confidence": _clamp(result.get("confidence", 0)),
                "emotional_indicators": result.get("emotional_indicators", []),
                "recommendations": result.get("recommendations", []),
                "ai_feedback": raw,
            }

        except Exception as exc:
            logging.error("Claude tone analysis failed (safe mode): %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 4. Answerability
    # ------------------------------------------------------------------

    def analyze_answerability(self, content: str, questions: List[str] = None) -> Dict:
        """
        Analyse how well the content answers likely user questions.
        Returns: score, ai_answerability_score, answered_questions,
                 unanswered_questions, clarity_issues, recommendations, gpt_feedback
        """
        fallback = {
            "score": 50,
            "ai_answerability_score": 50,
            "answered_questions": [],
            "unanswered_questions": [],
            "clarity_issues": ["API unavailable"],
            "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            "gpt_feedback": "Service unavailable",
        }

        if not self._is_available():
            return fallback

        try:
            if len(content) > 1_500:
                content = content[:1_500] + "..."

            if not questions:
                questions = [
                    "What is the main topic?",
                    "What problem does this solve?",
                    "What are the key benefits?",
                    "What action should be taken?",
                ]

            user_prompt = f"""Analyse how well this content answers user questions.

Content:
{content}

Questions to evaluate:
{chr(10).join(f'- {q}' for q in questions)}

Return a JSON object with exactly these keys:
- "ai_answerability_score": integer 0-100
- "answered_questions": array of questions clearly answered
- "unanswered_questions": array of questions not addressed
- "clarity_issues": array of clarity problems
- "recommendations": array of specific fixes"""

            raw = self._call(
                system="You are an answerability analyst. Output JSON only.",
                user=user_prompt,
                max_tokens=self._TOKENS_MEDIUM,
            )
            result = self._parse_json(raw)
            raw_score = _clamp(result.get("ai_answerability_score", 0))

            return {
                "score": round(raw_score, 2),
                "ai_answerability_score": round(raw_score, 2),
                "answered_questions": result.get("answered_questions", []),
                "unanswered_questions": result.get("unanswered_questions", []),
                "clarity_issues": result.get("clarity_issues", []),
                "recommendations": result.get("recommendations", []),
                "gpt_feedback": raw,
            }

        except Exception as exc:
            logging.error("Claude answerability analysis failed (safe mode): %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 5. Content summary
    # ------------------------------------------------------------------

    def generate_content_summary(self, content: str, max_length: int = 200) -> str:
        """Generate a short AI-powered content summary."""
        if not self._is_available():
            return "Anthropic Claude service not available for summarisation"

        try:
            if len(content) > 1_000:
                content = content[:1_000] + "..."

            raw = self._call(
                system="You are a concise content summariser. Return only the summary text, no JSON.",
                user=f"Summarise the following content in {max_length} characters or fewer:\n\n{content}",
                max_tokens=self._TOKENS_SMALL,
                expect_json=False,
            )
            return raw

        except Exception as exc:
            logging.error("Claude summarisation failed: %s", exc)
            return "Summary unavailable (API error)"

    # ------------------------------------------------------------------
    # 6. Metric help text (static — no API call needed)
    # ------------------------------------------------------------------

    def get_metric_help(self) -> Dict:
        """Static tooltip help text for all dashboard metrics."""
        return {
            "discover_prompts": {
                "content_type_accuracy": {
                    "meaning": "How clearly the page signals its type (blog, product, FAQ, landing). Higher means layout, headings and cues make the type obvious.",
                    "improve": "Tighten page structure: clear H1, sequential headings, consistent sectioning; add schema for the page type; keep CTAs and meta elements aligned to the type.",
                },
                "prompt_intent_match": {
                    "meaning": "How well the page answers the dominant user intent (informational, commercial, comparative, transactional, agent-style).",
                    "improve": "Map content to the right journey stage. Add direct answers, comparisons or purchase paths. Use headings that echo the core questions users ask.",
                },
                "visibility_impact": {
                    "meaning": "Potential of the page to be surfaced by AI/search based on relevance, depth, freshness and authority signals.",
                    "improve": "Increase topical depth, add supporting facts/entities, refresh content, strengthen internal links, add structured data and credible references.",
                },
                "suggested_content_type": {
                    "meaning": "Predicted page type inferred from structure and cues.",
                    "improve": "Align layout and microcopy to the suggested type or refactor to the intended type with matching schema and UX patterns.",
                },
            },
            "clusters_and_intent": {
                "clustering_accuracy": {
                    "meaning": "Confidence that prompts were assigned to the correct intent buckets.",
                    "improve": "Make intent cues explicit: question-style headings for informational, pricing/specs for commercial, comparison tables for comparative, clear CTAs for transactional.",
                },
                "coverage_percentage": {
                    "meaning": "Percent of considered prompts that could be confidently mapped to one of the five intents.",
                    "improve": "Add sections that address missing intents. If many prompts are uncategorised, clarify the page focus and reduce mixed content.",
                },
                "total_prompts": {
                    "meaning": "Total number of candidate prompts inferred for the page.",
                    "improve": "Expand topic coverage with FAQs, comparisons and how-to sections to naturally capture more relevant prompts.",
                },
                "intent_meanings": {
                    "informational": "Users seek knowledge or answers.",
                    "commercial": "Users research solutions, features and suitability.",
                    "comparative": "Users compare options.",
                    "transactional": "Users want to take action.",
                    "agent_style": "Assistant/chat style interactions.",
                },
            },
            "difficulty_and_opportunity": {
                "difficulty_score": {
                    "meaning": "How hard it is to win the prompt given current content strength and competition signals.",
                    "improve": "Target sub-prompts with clearer angles; strengthen page authority through internal links, entities and references.",
                },
                "complexity_level": {
                    "meaning": "Keyword/prompt complexity based on diversity and phrase length.",
                    "improve": "Break complex prompts into structured sections. Use scannable headings and tables.",
                },
                "ai_generation_feasibility": {
                    "meaning": "Likelihood that models can produce confident answers from this page.",
                    "improve": "Add explicit facts, definitions, step-by-steps and schema so models can extract reliable snippets.",
                },
            },
            "entity_detection": {
                "entities_detected_count": {
                    "meaning": "How many expected/required entities were found in the content.",
                    "improve": "Add missing entities naturally in headings, definitions, lists and FAQs.",
                },
                "entity_coverage_score": {
                    "meaning": "Percent of the required entity set that appears in the content.",
                    "improve": "Review missing entities and add dedicated sections that explain them.",
                },
                "entity_relevance_score": {
                    "meaning": "How closely the entities found on the page align with the likely search intent.",
                    "improve": "Remove or de-emphasise off-topic entities, tighten the page focus.",
                },
            },
            "visibility_breakdown": {
                "visibility_score_breakdown": {
                    "meaning": "Component scores that contribute to overall visibility.",
                    "improve": "Improve the lowest factor first.",
                },
                "keyword_relevance": {
                    "meaning": "How well the page language aligns with target queries.",
                    "improve": "Strengthen topical terms in H1/H2s, intro, and key sections.",
                },
                "content_depth": {
                    "meaning": "How thoroughly the page covers the topic.",
                    "improve": "Add missing subtopics, step-by-step explanations, examples, and comparison tables.",
                },
                "freshness": {
                    "meaning": "How up-to-date the information appears.",
                    "improve": "Update outdated stats, tools, and recommendations.",
                },
                "authority_signals": {
                    "meaning": "How credible and trustworthy the page looks.",
                    "improve": "Add expert authorship, citations to reputable sources, original data/examples.",
                },
            },
            "add_to_tracking": {
                "prompt_visibility_score": {
                    "meaning": "Estimated visibility of the prompt in AI results (0-100).",
                    "improve": "Improve ranking signals: clearer intent match, richer entities, stronger internal links.",
                },
                "ctr_percent": {
                    "meaning": "Estimated click-through rate for the prompt (0-30%).",
                    "improve": "Increase snippet appeal: concise answers up top, compelling meta/snippet text.",
                },
                "engagement_score": {
                    "meaning": "Estimated engagement quality based on content depth and credibility.",
                    "improve": "Add expert signals, examples, data and clear structure.",
                },
                "traffic_estimate": {
                    "meaning": "Relative traffic potential derived from visibility, engagement and citation counts.",
                    "improve": "Prioritise prompts with high intent and improve entry points.",
                },
                "visibility_change": {
                    "meaning": "Change in visibility since previous measurement. Null means first measurement.",
                    "improve": "Track edits vs change. Double-down on edits that moved the metric positively.",
                },
            },
        }

    # ------------------------------------------------------------------
    # 7. Content metrics (intent clusters + visibility)
    # ------------------------------------------------------------------

    def analyze_content_metrics(self, content: str, url: str) -> Dict:
        """
        Analyse three key AEO metrics plus prompt intent clustering.
        Returns: content_type_accuracy, prompt_intent_match, visibility_impact,
                 suggested_content_type, prompt_intent_details, visibility_factors,
                 metric_help
        All numeric scores clamped to [0, 100].
        """
        _empty_clusters = {
            "informational": {"prompt_count": 0, "example_prompts": []},
            "commercial":    {"prompt_count": 0, "example_prompts": []},
            "comparative":   {"prompt_count": 0, "example_prompts": []},
            "transactional": {"prompt_count": 0, "example_prompts": []},
            "agent_style":   {"prompt_count": 0, "example_prompts": []},
        }
        _empty_cluster_metrics = {
            "total_prompts": 0,
            "categorized_prompts": 0,
            "coverage_percentage": 0.0,
            "clustering_accuracy": 0.0,
        }
        fallback = {
            "content_type_accuracy": 50,
            "prompt_intent_match": 50,
            "visibility_impact": 50,
            "suggested_content_type": "Unknown (Safe Mode)",
            "prompt_intent_details": {
                "matched_intents": [],
                "confidence": 0,
                "search_queries": [],
                "intent_clusters": _empty_clusters,
                "cluster_metrics": _empty_cluster_metrics,
            },
            "visibility_factors": {
                "factors": ["Service unavailable"],
                "score_breakdown": {},
                "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            },
        }

        if not self._is_available():
            return fallback

        try:
            if len(content) > 12_000:
                content = content[:12_000] + "..."

            user_prompt = f"""You are an AEO (Answer Engine Optimisation) Expert. Analyse this content from {url}.

Content:
{content}

Return a JSON object with EXACTLY this structure:
{{
  "content_type_accuracy": <integer 0-100>,
  "suggested_content_type": "<blog|product|faq|landing_page|article|tutorial|documentation>",
  "prompt_intent_match": <integer 0-100>,
  "prompt_intent_details": {{
    "matched_intents": ["<intent>"],
    "confidence": <integer 0-100>,
    "search_queries": ["<example query>"],
    "intent_clusters": {{
      "informational":  {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "commercial":     {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "comparative":    {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "transactional":  {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "agent_style":    {{"prompt_count": <int>, "example_prompts": ["<str>"]}}
    }},
    "cluster_metrics": {{
      "total_prompts": <int>,
      "categorized_prompts": <int>,
      "coverage_percentage": <float 0.0-100.0 rounded to 1 decimal>,
      "clustering_accuracy": <float 0.0-1.0>
    }}
  }},
  "visibility_impact": <integer 0-100>,
  "visibility_factors": {{
    "factors": ["<factor>"],
    "score_breakdown": {{
      "keyword_relevance": <integer 0-100>,
      "content_depth":     <integer 0-100>,
      "freshness":         <integer 0-100>,
      "authority_signals": <integer 0-100>
    }},
    "recommendations": ["<recommendation>"]
  }}
}}"""

            raw = self._call(
                system="You are an expert AEO analyst. Output JSON only with accurate metrics.",
                user=user_prompt,
                max_tokens=self._TOKENS_LARGE,
            )
            result = self._parse_json(raw)

            # Safe extraction of nested structures
            pid = result.get("prompt_intent_details") or {}

            clusters = pid.get("intent_clusters") or {}
            for key in _empty_clusters:
                clusters.setdefault(key, {"prompt_count": 0, "example_prompts": []})

            cm = pid.get("cluster_metrics") or {}
            total = max(int(cm.get("total_prompts", 0)), 0)
            categorised = max(int(cm.get("categorized_prompts", 0)), 0)
            coverage = round((categorised / total * 100), 1) if total > 0 else 0.0
            cluster_metrics = {
                "total_prompts": total,
                "categorized_prompts": categorised,
                "coverage_percentage": coverage,
                "clustering_accuracy": _clamp(float(cm.get("clustering_accuracy", 0.0)), 0.0, 1.0),
            }

            prompt_intent_details = {
                "matched_intents": pid.get("matched_intents") or [],
                "confidence": _clamp(pid.get("confidence", 0)),
                "search_queries": pid.get("search_queries") or [],
                "intent_clusters": clusters,
                "cluster_metrics": cluster_metrics,
            }

            vf = result.get("visibility_factors") or {}
            sb = vf.get("score_breakdown") or {}
            visibility_factors = {
                "factors": vf.get("factors") or [],
                "score_breakdown": {k: _clamp(v) for k, v in sb.items()},
                "recommendations": vf.get("recommendations") or [],
            }

            help_sections = self.get_metric_help()
            metric_help = {
                **help_sections.get("discover_prompts", {}),
                **help_sections.get("clusters_and_intent", {}),
                **help_sections.get("entity_detection", {}),
                **help_sections.get("visibility_breakdown", {}),
            }

            return {
                "content_type_accuracy": _clamp(result.get("content_type_accuracy", 50)),
                "prompt_intent_match":   _clamp(result.get("prompt_intent_match", 50)),
                "visibility_impact":     _clamp(result.get("visibility_impact", 50)),
                "suggested_content_type": result.get("suggested_content_type", "Unknown"),
                "prompt_intent_details": prompt_intent_details,
                "visibility_factors": visibility_factors,
                "metric_help": metric_help,
            }

        except Exception as exc:
            logging.error("Content metrics analysis failed (safe mode): %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 8. Entity relevance
    # ------------------------------------------------------------------

    def analyze_entity_relevance(
        self,
        content: str,
        url: str,
        found_entities: list,
        expected_entities: list,
    ) -> Dict:
        """
        Score how relevant the detected entities are to user search intent.
        Returns: entity_relevance_score, relevance_explanation,
                 relevant_entities, irrelevant_entities
        """
        fallback = {
            "entity_relevance_score": 50,
            "relevance_explanation": "Analysis unavailable",
            "relevant_entities": [],
            "irrelevant_entities": [],
        }

        if not self._is_available():
            return fallback

        try:
            if len(content) > 10_000:
                content = content[:10_000] + "..."

            found_str    = ", ".join(found_entities[:20])    if found_entities    else "None"
            expected_str = ", ".join(expected_entities[:20]) if expected_entities else "None"

            user_prompt = f"""You are an AEO Expert. Analyse entity relevance for content from {url}.

Content preview:
{content}

Found entities: {found_str}
Expected entities: {expected_str}

How RELEVANT are the found entities to typical user search intent for this content?

Return a JSON object with exactly these keys:
- "entity_relevance_score": integer 0-100
- "relevance_explanation": string explaining the score
- "relevant_entities": array of entities that strongly match search intent
- "irrelevant_entities": array of entities that do not match search intent

Scoring guide:
  80-100: entities perfectly match search intent
  60-79:  most entities relevant, minor gaps
  40-59:  mixed relevance
  0-39:   entities poorly match search intent"""

            raw = self._call(
                system="You are an expert AEO analyst. Output JSON only.",
                user=user_prompt,
                max_tokens=self._TOKENS_MEDIUM,
            )
            result = self._parse_json(raw)

            return {
                "entity_relevance_score": _clamp(result.get("entity_relevance_score", 50)),
                "relevance_explanation":  result.get("relevance_explanation", ""),
                "relevant_entities":      result.get("relevant_entities", []),
                "irrelevant_entities":    result.get("irrelevant_entities", []),
            }

        except Exception as exc:
            logging.error("Entity relevance analysis failed: %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 9. Prompt tracking metrics  ← main calculation method (no API call)
    # ------------------------------------------------------------------

    def calculate_prompt_tracking_metrics(
        self,
        job_id: str,
        url: str,
        prompts: List[str],
    ) -> Dict:
        """
        Compute per-prompt tracking metrics and persist them to MongoDB.
        This method does NOT call the Claude API — it uses local TF-IDF
        and ranking data already stored in MongoDB.

        Metrics per prompt:
            prompt_visibility_score  0-100
            ctr_percent              0-30
            engagement_score         0-100
            traffic_estimate         0-25
            visibility_change        float | None
        """
        mongo_manager.connect()

        # 1. Normalise prompt list
        cleaned: List[str] = [
            p.strip() for p in (prompts or [])
            if isinstance(p, str) and p.strip()
        ]

        # 2. Load existing tracking doc
        col = mongo_manager.db.prompt_tracking
        existing: Dict = col.find_one({"jobId": job_id}) or {}

        existing_tracked = [
            p for p in (existing.get("tracked_prompts") or [])
            if isinstance(p, str) and p.strip()
        ]
        tracked_prompts = sorted(set(existing_tracked + cleaned))

        # 3. Load page content metrics
        content_doc = (
            mongo_manager.content_metrics.find_one({"jobId": job_id, "url": url}) or {}
        )
        content_metrics = content_doc.get("content_metrics") or {}
        pid = content_metrics.get("prompt_intent_details") or {}
        linked_queries: List[str] = [
            q for q in (pid.get("search_queries") or [])
            if isinstance(q, str) and q.strip()
        ]

        # 4. Load Module E ranking data
        module_e_doc = (mongo_manager.module_e.find_one({"jobId": job_id}) or {})
        ranking_rows: List[Dict] = [
            r for r in (
                (module_e_doc.get("ranking_analysis") or {})
                .get("ranking_position_per_prompt") or []
            )
            if isinstance(r, dict)
        ]

        # 5. Parse raw HTML
        visible_text = ""
        heading_text = ""
        try:
            raw_html = load_raw_html_sync(job_id) or ""
            if raw_html and BeautifulSoup is not None:
                soup = BeautifulSoup(raw_html, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                headings = soup.find_all(["h1", "h2"], limit=8)
                heading_text = " ".join(h.get_text(" ", strip=True) for h in headings if h)
                visible_text = " ".join(soup.get_text(separator=" ", strip=True).split())
        except Exception as exc:
            logging.warning("HTML parsing failed for job %s: %s", job_id, exc)

        # 6. Page quality score — weighted blend
        pim = content_metrics.get("prompt_intent_match")
        vis = content_metrics.get("visibility_impact")
        if isinstance(pim, (int, float)) and isinstance(vis, (int, float)):
            page_quality_score = _clamp(0.55 * float(pim) + 0.45 * float(vis))
        elif isinstance(pim, (int, float)):
            page_quality_score = _clamp(float(pim))
        elif isinstance(vis, (int, float)):
            page_quality_score = _clamp(float(vis))
        else:
            page_quality_score = 50.0

        # 7. TF-IDF structures
        content_token_list = _tokenize(visible_text[:30_000]) if visible_text else []
        heading_tokens     = set(_tokenize(heading_text)) if heading_text else set()
        query_token_sets   = [set(_tokenize(q)) for q in linked_queries[:50]]

        tf_map: Dict[str, int] = {}
        for t in content_token_list:
            tf_map[t] = tf_map.get(t, 0) + 1
        total_terms = len(content_token_list)

        # Standard IDF: log(N / (tf+1)) + 1
        def _idf(tf: int) -> float:
            if total_terms == 0 or tf <= 0:
                return 0.0
            return math.log(total_terms / (tf + 1)) + 1.0

        def _content_relevance(prompt_tokens: List[str]) -> float:
            unique = list(set(prompt_tokens))
            if not unique:
                return 0.0
            tf_cap = 10
            score = 0.0
            for tok in unique:
                tf = min(tf_map.get(tok, 0), tf_cap)
                if tf <= 0:
                    continue
                tf_norm = math.log(1 + tf) / math.log(1 + tf_cap)
                score  += tf_norm * _idf(tf_map.get(tok, 0))
            max_idf_possible = math.log(total_terms + 1) + 1.0 if total_terms > 0 else 1.0
            max_possible = len(unique) * max_idf_possible
            return _clamp(score / max_possible if max_possible > 0 else 0.0, 0.0, 1.0)

        def _query_similarity(ptok_set: set) -> float:
            if not ptok_set or not query_token_sets:
                return 0.0
            best = 0.0
            for qt in query_token_sets:
                if not qt:
                    continue
                union = ptok_set | qt
                sim = len(ptok_set & qt) / len(union) if union else 0.0
                best = max(best, sim)
            return best

        def _pos_to_visibility(position) -> float:
            try:
                p = int(float(position))
            except (TypeError, ValueError):
                return 0.0
            if p < 1 or p > 10:
                return 0.0
            return round(((11 - p) / 10) * 100, 2)

        # 8. Load history
        history: Dict[str, List[Dict]] = {
            k: v for k, v in (existing.get("history") or {}).items()
            if isinstance(v, list)
        }

        now_iso = datetime.utcnow().isoformat()
        metrics: List[Dict] = []

        # 9. Per-prompt calculation
        for prompt in tracked_prompts:
            rows = [r for r in ranking_rows if (r.get("prompt") or "") == prompt]

            # PATH A: real ranking data
            if rows:
                model_ranking: Dict[str, Optional[int]] = {}
                vis_c, eng_c, traf_c = [], [], []

                for r in rows:
                    model = r.get("model")
                    if isinstance(model, str) and model:
                        pos = r.get("position")
                        model_ranking[model] = (
                            int(float(pos)) if isinstance(pos, (int, float)) else None
                        )
                    vis_c.append(_pos_to_visibility(r.get("position")))

                    eng_vals = [
                        float(v) for v in [r.get("content_quality_score"), r.get("credibility_score")]
                        if isinstance(v, (int, float))
                    ]
                    if eng_vals:
                        eng_c.append(_safe_mean(eng_vals))

                    cit = r.get("citation_count")
                    tot = r.get("total_cited")
                    if isinstance(cit, (int, float)):
                        traf_c.append(float(cit))
                    elif isinstance(tot, (int, float)):
                        traf_c.append(float(tot))

                prompt_visibility_score = _clamp(round(_safe_mean(vis_c), 2) if vis_c else 0.0)
                engagement_score        = _clamp(round(_safe_mean(eng_c), 2) if eng_c else page_quality_score)
                traffic_estimate        = _clamp(round(_safe_mean(traf_c), 2) if traf_c else 0.0, 0.0, 25.0)
                ctr_percent             = _clamp(
                    round((prompt_visibility_score / 100) * (engagement_score / 100) * 30, 2),
                    0.0, 30.0,
                )
                calculation_method = "ranking"

            # PATH B: estimated from content
            else:
                model_ranking = {}
                ptok_list = _tokenize(prompt)
                ptok_set  = set(ptok_list)

                c_sim = _content_relevance(ptok_list)
                q_sim = _query_similarity(ptok_set)
                h_sim = (
                    len(ptok_set & heading_tokens) / max(len(ptok_set), 1)
                    if heading_tokens and ptok_set else 0.0
                )

                phrase_bonus = 0.0
                if visible_text and len(prompt.split()) >= 2:
                    try:
                        if prompt.lower() in visible_text.lower():
                            phrase_bonus = 0.12
                    except Exception:
                        pass

                relevance = _clamp(
                    0.60 * c_sim + 0.25 * q_sim + 0.15 * h_sim + phrase_bonus,
                    0.0, 1.0,
                )

                # Single-word stopword-level suppression
                if len(ptok_set) == 1:
                    single = next(iter(ptok_set), "")
                    tf = tf_map.get(single, 0)
                    if tf > 0 and _idf(tf) < 0.15:
                        relevance = min(relevance, 0.30)

                quality_factor = page_quality_score / 100.0
                prompt_visibility_score = _clamp(
                    round(10.0 + 90.0 * relevance * (0.5 + 0.5 * quality_factor), 2)
                )
                engagement_score = _clamp(
                    round(page_quality_score * 0.60 + (relevance * 100) * 0.40, 2)
                )
                query_count = min(len(linked_queries), 20)
                traffic_estimate = _clamp(
                    round(
                        (prompt_visibility_score / 100)
                        * (engagement_score / 100)
                        * (5.0 + query_count / 2.0),
                        2,
                    ),
                    0.0, 25.0,
                )
                ctr_percent = _clamp(
                    round((prompt_visibility_score / 100) * (engagement_score / 100) * 30, 2),
                    0.0, 30.0,
                )
                calculation_method = "estimated"

            # History & visibility_change
            prompt_history = list(history.get(prompt) or [])
            prompt_history.append({
                "date":               now_iso,
                "visibility_score":   prompt_visibility_score,
                "ctr_percent":        ctr_percent,
                "engagement_score":   engagement_score,
                "traffic_estimate":   traffic_estimate,
            })
            prompt_history = prompt_history[-60:]
            history[prompt] = prompt_history

            visibility_change: Optional[float] = None
            if len(prompt_history) >= 2:
                prev_score = prompt_history[-2].get("visibility_score")
                if isinstance(prev_score, (int, float)):
                    visibility_change = round(prompt_visibility_score - float(prev_score), 2)

            metrics.append({
                "prompt":                  prompt,
                "prompt_visibility_score": prompt_visibility_score,
                "ctr_percent":             ctr_percent,
                "engagement_score":        engagement_score,
                "traffic_estimate":        traffic_estimate,
                "ai_model_ranking":        model_ranking,
                "linked_queries":          linked_queries,
                "visibility_change":       visibility_change,
                "trend":                   prompt_history[-14:],
                "updated_at":              now_iso,
                "calculation_method":      calculation_method,
            })

        # 10. Persist to MongoDB
        doc = {
            "jobId":           job_id,
            "url":             url,
            "tracked_prompts": tracked_prompts,
            "metrics":         metrics,
            "history":         history,
            "updatedAt":       datetime.utcnow(),
            "metric_help":     self.get_metric_help().get("add_to_tracking", {}),
        }
        col.update_one(
            {"jobId": job_id},
            {"$set": doc, "$setOnInsert": {"createdAt": datetime.utcnow()}},
            upsert=True,
        )

        created_raw = existing.get("createdAt") or datetime.utcnow()
        doc["updatedAt"] = now_iso
        doc["createdAt"] = (
            created_raw.isoformat() if hasattr(created_raw, "isoformat") else now_iso
        )
        return doc