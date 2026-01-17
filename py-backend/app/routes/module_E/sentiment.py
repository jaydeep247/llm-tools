"""
Sentiment Tracking Router (Module E)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ...services.module_E.sentiment_tracking_service import SentimentTrackingService

router = APIRouter()
service = SentimentTrackingService()

class SentimentRequest(BaseModel):
    brand_name: str

@router.post("/api/aeo/sentiment-tracking")
async def analyze_sentiment(request: SentimentRequest):
    """
    Analyze brand sentiment across multiple LLMs
    """
    try:
        if not request.brand_name:
            raise HTTPException(status_code=400, detail="Brand name is required")
            
        result = await service.analyze_sentiment(request.brand_name)
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
