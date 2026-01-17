
from typing import List, Dict, Any
from datetime import datetime
from dateutil.relativedelta import relativedelta
from ..module_A.dataforseo_client import DataForSEOClient

class CompetitorMentionsService:
    """
    Service for analyzing competitor mentions (Brand Pulse) 
    in a modular, isolated way.
    """
    
    def __init__(self):
        self.client = DataForSEOClient()

    def analyze_mentions_batch(self, competitors: List[str]) -> List[Dict[str, Any]]:
        """
        Analyze mentions for a batch of competitors.
        
        Args:
            competitors: List of competitor domain names.
            
        Returns:
            List of result dictionaries.
        """
        results = []
        
        # Calculate date range (last 12 months)
        today = datetime.utcnow().replace(day=1)
        start_date = (today - relativedelta(months=11)).strftime("%Y-%m-%d")
        
        for competitor in competitors:
            keyword = competitor
            
            # Reusing existing DataForSEO client logic
            # We call the Content Analysis API via a method on the client if it exists,
            # or we construct the request here using the generic POST.
            # Looking at existing code, get_content_phrase_trends was inside CompetitorAnalysisService.
            # We should probably implement a similar helper here or call the generic client directly.
            
            # Let's call the generic client directly to avoid dependency on CompetitorAnalysisService
            payload = {
                "0": {
                    "keyword": keyword,
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
                # We assume client.post handles auth and base URL
                # The endpoint is /v3/content_analysis/phrase_trends/live
                response = self.client.post('/v3/content_analysis/phrase_trends/live', payload)
                
                if response.get('status_code') == 20000 and response.get('tasks'):
                    task = response['tasks'][0]
                    if task.get('result'):
                        items = task['result'][0].get('items', [])
                        
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
                print(f"ERROR processing competitor {competitor}: {e}")
                competitor_result["sentiment"] = "Error"
            
            results.append(competitor_result)
            
        return results
