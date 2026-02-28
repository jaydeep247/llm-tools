import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_brand")


class BrandAnalyzer:
    """
    Analyzes brand metrics using DataForSEO:
    - Total mentions over past 12 months
    - Sentiment distribution (positive/negative/neutral)
    - Monthly frequency trend
    - Top source domains
    """

    @staticmethod
    async def analyze_brand(brand_name: str) -> Dict[str, Any]:
        """
        Analyze brand mentions, sentiment, and sources from past 12 months.
        
        Args:
            brand_name: Brand/keyword to analyze (e.g., "Healthcare Apps")
            
        Returns:
            {
                "brand_name": str,
                "total_mentions": int,
                "sentiment": {
                    "counts": {"positive": int, "negative": int, "neutral": int},
                    "label": str  # "Mostly Positive", "Mostly Negative", etc.
                },
                "frequency_trend": List[{"date": str, "count": int}],
                "top_sources": List[{"domain": str}]
            }
        """
        if not brand_name or not isinstance(brand_name, str):
            logger.warning("Invalid brand name: %s", brand_name)
            return BrandAnalyzer._empty_result(brand_name or "unknown")

        try:
            # Calculate date range: exactly 1 year ago
            today = datetime.utcnow()
            start_date = today - timedelta(days=365)
            start_date_str = start_date.strftime("%Y-%m-%d")
            
            # Call DataForSEO via execute_task
            payload = [{
                'keyword': brand_name,
                'date_from': "2021-01-01",
                'date_group': 'month'
            }]

            response = await execute_task(
                task_name="module_e_brand_analysis",
                input_data={
                    "endpoint": "/content_analysis/phrase_trends/live",
                    "payload": payload
                },
                provider="dataforseo"
            )

            if not response.success:
                logger.warning(
                    "Brand analysis DataForSEO call failed",
                    extra={"brand_name": brand_name, "error": response.error}
                )
                return BrandAnalyzer._empty_result(brand_name)

            # Process response - ADD DETAILED DEBUGGING
            data = response.data
            
            if not data:
                logger.warning("❌ DataForSEO response.data is None or empty")
                return BrandAnalyzer._empty_result(brand_name)
            
            if 'tasks' not in data:
                return BrandAnalyzer._empty_result(brand_name)
            
            if not data['tasks']:
                return BrandAnalyzer._empty_result(brand_name)
            
            try:
                items = data['tasks'][0].get('result', [])
                
                if not items:
                    logger.warning(
                        "❌ Brand analysis - 'result' array is empty",
                        extra={
                            "brand_name": brand_name,
                            "task_content": data['tasks'][0]
                        }
                    )
                    return BrandAnalyzer._empty_result(brand_name)

                return BrandAnalyzer._aggregate_brand_data(brand_name, items, start_date)

            except Exception as e:
                logger.exception(
                    "❌ Error processing brand analysis result",
                    extra={
                        "brand_name": brand_name,
                        "error": str(e),
                        "error_type": type(e).__name__
                    }
                )
                return BrandAnalyzer._empty_result(brand_name)

        except Exception as e:
            logger.exception("Brand analysis failed: %s", e)
            return BrandAnalyzer._empty_result(brand_name)

    @staticmethod
    def _aggregate_brand_data(brand_name: str, items: List[Dict], start_date: datetime) -> Dict[str, Any]:
        """
        Aggregate monthly data into brand metrics.
        """
        total_mentions = 0
        history = []
        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}
        domain_set = set()

        for item in items:
            try:
                # Date filtering (safety check)
                item_date_str = item.get("date")
                if item_date_str:
                    try:
                        item_date = datetime.strptime(item_date_str, "%Y-%m-%d")
                        if item_date < start_date:
                            continue
                    except:
                        pass

                # Total mentions (DataForSEO Content Analysis uses 'total_count')
                count = item.get("total_count", 0)
                total_mentions += count

                # Frequency trend
                history.append({
                    "date": item_date_str,
                    "count": count
                })

                # Sentiment aggregation
                connotation = item.get("connotation_types") or {}
                sentiment_counts["positive"] += connotation.get("positive", 0)
                sentiment_counts["negative"] += connotation.get("negative", 0)
                sentiment_counts["neutral"] += connotation.get("neutral", 0)

                # Top sources
                top_domains = item.get("top_domains") or []
                for domain_obj in top_domains:
                    domain = domain_obj.get("domain")
                    if domain:
                        domain_set.add(domain)

            except Exception as e:
                logger.debug("Error processing brand data item: %s", e)
                continue

        # Generate sentiment label
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

        result = {
            "brand_name": brand_name,
            "total_mentions": total_mentions,
            "sentiment": {
                "counts": sentiment_counts,
                "label": sentiment_label
            },
            "frequency_trend": sorted(history, key=lambda x: x.get("date", "")),
            "top_sources": [{"domain": d} for d in list(domain_set)[:5]]
        }

        return result

    @staticmethod
    def _empty_result(brand_name: str) -> Dict[str, Any]:
        """Return empty result structure."""
        return {
            "brand_name": brand_name,
            "total_mentions": 0,
            "sentiment": {
                "counts": {"positive": 0, "negative": 0, "neutral": 0},
                "label": "No Data"
            },
            "frequency_trend": [],
            "top_sources": []
        }
