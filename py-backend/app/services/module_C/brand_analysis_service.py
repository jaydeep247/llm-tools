import os
from typing import Dict, Any, List, Optional
from datetime import datetime
from dateutil.relativedelta import relativedelta
from .competitor_analysis import CompetitorAnalysisService

class BrandAnalysisService:
    @staticmethod
    def analyze_brand(brand_name: str) -> Dict[str, Any]:
        if not brand_name:
            return {"error": "Brand name is required"}

        # ---- Calculate date range: exactly 1 year ago from today ----
        today = datetime.utcnow()
        start_date = today - relativedelta(years=1)
        start_date_str = start_date.strftime("%Y-%m-%d")

        service = CompetitorAnalysisService()
        # Pass date_from parameter to API to request data from exactly 1 year ago
        response = service.get_content_phrase_trends(
            keyword=brand_name,
            date_from=start_date_str,
            date_group="month"
        )

        if not response.get("success"):
            return {
                "brand_name": brand_name,
                "total_mentions": 0,
                "sentiment": {"counts": {}, "label": "No Data"},
                "frequency_trend": [],
                "top_sources": []
            }

        items = response.get("data", [])
        if not items:
            return BrandAnalysisService._empty_result(brand_name)

        # ---- Additional client-side filtering for safety (in case API returns extra data) ----
        scoped_items = []
        for item in items:
            try:
                item_date = datetime.strptime(item["date"], "%Y-%m-%d")
                if item_date >= start_date:
                    scoped_items.append(item)
            except:
                continue

        total_mentions = 0
        history = []

        # Sentiment (REAL aggregation)
        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}

        # Top sources (unique appearance)
        domain_set = set()

        for item in scoped_items:
            count = item.get("total_count", 0)
            total_mentions += count

            history.append({
                "date": item.get("date"),
                "count": count
            })

            con = item.get("connotation_types") or {}
            sentiment_counts["positive"] += con.get("positive", 0)
            sentiment_counts["negative"] += con.get("negative", 0)
            sentiment_counts["neutral"] += con.get("neutral", 0)

            for d in item.get("top_domains") or []:
                if d.get("domain"):
                    domain_set.add(d["domain"])

        # ---- Sentiment label ----
        total_sentiment = sum(sentiment_counts.values())
        if total_sentiment == 0:
            sentiment_label = "No Data"
        else:
            pos_pct = (sentiment_counts["positive"] / total_sentiment) * 100
            neg_pct = (sentiment_counts["negative"] / total_sentiment) * 100

            if pos_pct > 50:
                sentiment_label = "Mostly Positive"
            elif neg_pct > 50:
                sentiment_label = "Mostly Negative"
            elif pos_pct > neg_pct:
                sentiment_label = "Positive Leaning"
            else:
                sentiment_label = "Negative Leaning"

        return {
            "brand_name": brand_name,
            "total_mentions": total_mentions,
            "sentiment": {
                "counts": sentiment_counts,
                "label": sentiment_label
            },
            "frequency_trend": history,
            "top_sources": [{"domain": d} for d in list(domain_set)[:5]]
        }

    @staticmethod
    def _empty_result(brand_name: str):
        return {
            "brand_name": brand_name,
            "total_mentions": 0,
            "sentiment": {"counts": {"positive":0,"negative":0,"neutral":0}, "label": "No Data"},
            "frequency_trend": [],
            "top_sources": []
        }
