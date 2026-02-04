import logging
from typing import List, Dict, Any
from datetime import datetime
from dateutil.relativedelta import relativedelta

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
