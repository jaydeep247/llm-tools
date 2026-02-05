import logging
from typing import List, Dict, Any
from datetime import datetime
from dateutil.relativedelta import relativedelta
from urllib.parse import urlparse
import re

from ..module_A.dataforseo_client import DataForSEOClient

logger = logging.getLogger(__name__)


class CompetitorMentionsService:
    """
    Service for analyzing competitor mentions (Brand Pulse)
    in a modular, isolated way.
    """

    def __init__(self):
        try:
            self.client = DataForSEOClient()
            self.api_available = True
        except (ValueError, Exception) as e:
            logger.warning("DataForSEO API not configured for competitor mentions: %s", e)
            self.api_available = False
            self.client = None

    def analyze_mentions_batch(self, competitors: List[str]) -> List[Dict[str, Any]]:
        """
        Analyze mentions for a batch of competitors.

        Args:
            competitors: List of competitor domain names.

        Returns:
            List of result dictionaries.
        """
        if not self.api_available or not self.client:
            return [
                {"name": c, "mentions": 0, "sentiment": "No Data", "trend": []}
                for c in competitors
            ]
        results = []
        
        # Calculate date range (last 12 months)
        today = datetime.utcnow().replace(day=1)
        start_date = (today - relativedelta(months=11)).strftime("%Y-%m-%d")
        
        for competitor in competitors:
            payload = {
                "0": {
                    "keyword": competitor,
                    "date_from": start_date,
                    "date_group": "month",
                    "search_mode": "as_is",
                    "internal_list_limit": 1
                }
            }
            
            competitor_result = {
                "name": competitor,
                "mentions": 0,
                "sentiment": "No Data",
                "trend": []
            }
            
            try:
                response = self.client.post('/v3/content_analysis/phrase_trends/live', payload)
                
                if response.get('status_code') == 20000 and response.get('tasks'):
                    task = response['tasks'][0]
                    # Skip if task-level error (e.g. 40201 account paused)
                    if task.get('status_code') == 20000:
                        # DataForSEO phrase_trends: result is flat array of {date, total_count, connotation_types, ...}
                        items = task.get('result') or []
                        
                        total_mentions = 0
                        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
                        
                        for item in items:
                            count = item.get("total_count", 0)
                            total_mentions += count
                            
                            con = item.get("connotation_types") or {}
                            sentiment_counts["positive"] += con.get("positive", 0)
                            sentiment_counts["negative"] += con.get("negative", 0)
                            sentiment_counts["neutral"] += con.get("neutral", 0)
                            
                            competitor_result["trend"].append({
                                "date": item.get("date"),
                                "count": count
                            })
                        
                        competitor_result["mentions"] = total_mentions
                        
                        # Sentiment Label
                        total_sent = sum(sentiment_counts.values())
                        if total_sent > 0:
                            pos_pct = (sentiment_counts["positive"] / total_sent) * 100
                            neg_pct = (sentiment_counts["negative"] / total_sent) * 100
                            
                            if pos_pct > 60:
                                competitor_result["sentiment"] = "Positive"
                            elif neg_pct > 60:
                                competitor_result["sentiment"] = "Negative"
                            else:
                                competitor_result["sentiment"] = "Neutral"

            except Exception as e:
                logger.error("Error processing competitor %s: %s", competitor, e)
                competitor_result["sentiment"] = "Error"
            
            results.append(competitor_result)
            
        return results

    def _visibility_search_terms(self, brand_name: str) -> List[str]:
        """
        Return a list of strings to search for in discovery answers.
        When brand is a URL, include domain, stem (e.g. iroidsolutions), and a
        "display name" variant with space (e.g. iroid solutions) so we match
        how models typically mention brands ("Iroid Solutions", "YesQuest Tech").
        """
        terms: List[str] = []
        raw = (brand_name or "").strip()
        if not raw:
            return terms
        raw_lower = raw.lower()
        terms.append(raw_lower)
        try:
            parsed = urlparse(raw if "://" in raw else f"https://{raw}")
            netloc = (parsed.netloc or parsed.path or "").strip().lower()
            if netloc:
                terms.append(netloc)
                no_www = re.sub(r"^www\.", "", netloc)
                stem = no_www.split(".")[0] if "." in no_www else no_www
                if stem and stem not in terms:
                    terms.append(stem)
                # Models often say "Iroid Solutions" / "YesQuest Tech" (with space).
                # Add stem-with-space variant for common suffixes so we match.
                for suffix in ("solutions", "tech", "lab", "software", "apps", "digital", "systems"):
                    if stem.endswith(suffix) and len(stem) > len(suffix):
                        prefix = stem[: -len(suffix)]
                        if prefix:
                            space_variant = f"{prefix} {suffix}"
                            if space_variant not in terms:
                                terms.append(space_variant)
                        break
        except Exception:
            pass
        return list(dict.fromkeys(terms))

    async def analyze_mentions_by_ai_model(
        self, 
        brand_name: str, 
        competitors: List[str]
    ) -> Dict[str, Any]:
        """
        Analyze brand and competitor mentions across AI models (ChatGPT, Claude, Gemini).
        Returns Share of Voice per model.
        
        Args:
            brand_name: Your brand name/URL
            competitors: List of competitor names/URLs
            
        Returns:
            {
                "overall": 45.0,  # Overall SOV across all models
                "by_model": {
                    "chatgpt": {"sov": 45.0, "brand_mentions": 9, "competitor_mentions": 11, "total_mentions": 20, "queries_analyzed": 6},
                    "claude": {"sov": 52.0, "brand_mentions": 13, "competitor_mentions": 12, "total_mentions": 25, "queries_analyzed": 6},
                    "gemini": {"sov": 38.0, "brand_mentions": 8, "competitor_mentions": 13, "total_mentions": 21, "queries_analyzed": 6}
                }
            }
        """
        try:
            from ..module_E.sentiment_tracking_service import SentimentTrackingService
            
            sentiment_service = SentimentTrackingService()
            
            # Generate discovery questions (same as visibility tracking)
            visibility_queries = await sentiment_service._generate_visibility_queries_for_brand(brand_name)
            if not visibility_queries:
                visibility_queries = sentiment_service.VISIBILITY_QUERIES
            
            # Prepare search terms for brand and competitors
            brand_terms = self._visibility_search_terms(brand_name)
            competitor_terms_map = {
                comp: self._visibility_search_terms(comp) 
                for comp in competitors
            }
            
            # Track mentions per model
            model_results = {
                "chatgpt": {"brand_count": 0, "competitor_count": 0, "total_queries": 0},
                "claude": {"brand_count": 0, "competitor_count": 0, "total_queries": 0},
                "gemini": {"brand_count": 0, "competitor_count": 0, "total_queries": 0}
            }
            
            # Query each model with discovery questions
            for model_name in ["openai", "claude", "gemini"]:
                model_key = "chatgpt" if model_name == "openai" else model_name
                
                for query in visibility_queries:
                    try:
                        # Get answer from model
                        answer_data = None
                        if model_name == "openai":
                            answer_data = await sentiment_service._call_openai(query)
                        elif model_name == "claude":
                            answer_data = await sentiment_service._call_claude(query)
                        elif model_name == "gemini":
                            answer_data = await sentiment_service._call_gemini(query)
                        
                        if not answer_data:
                            continue
                        
                        answer_text = (answer_data.get("response_text") or "").lower()
                        model_results[model_key]["total_queries"] += 1
                        
                        # Check for brand mentions
                        brand_mentioned = any(
                            term.lower() in answer_text 
                            for term in brand_terms
                        )
                        if brand_mentioned:
                            model_results[model_key]["brand_count"] += 1
                        
                        # Check for competitor mentions
                        for comp, comp_terms in competitor_terms_map.items():
                            comp_mentioned = any(
                                term.lower() in answer_text 
                                for term in comp_terms
                            )
                            if comp_mentioned:
                                model_results[model_key]["competitor_count"] += 1
                                
                    except Exception as e:
                        logger.warning(f"Error querying {model_name} for SOV (query: {query[:50]}...): {e}")
                        continue
            
            # Calculate SOV per model
            sov_by_model = {}
            all_sovs = []
            
            for model_key, counts in model_results.items():
                total_mentions = counts["brand_count"] + counts["competitor_count"]
                
                if total_mentions > 0:
                    sov = round((counts["brand_count"] / total_mentions) * 100, 1)
                    sov_by_model[model_key] = {
                        "sov": sov,
                        "brand_mentions": counts["brand_count"],
                        "competitor_mentions": counts["competitor_count"],
                        "total_mentions": total_mentions,
                        "queries_analyzed": counts["total_queries"]
                    }
                    all_sovs.append(sov)
            
            # Calculate overall SOV
            overall_sov = round(sum(all_sovs) / len(all_sovs), 1) if all_sovs else 0.0
            
            return {
                "overall": overall_sov,
                "by_model": sov_by_model
            }
        except Exception as e:
            logger.error(f"Error calculating model-wise SOV: {e}")
            return {
                "overall": 0.0,
                "by_model": {}
            }
