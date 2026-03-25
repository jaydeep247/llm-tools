import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .service import MetricType, schedule_content_audit_metric

logger = logging.getLogger("content_audit_http")

router = APIRouter(prefix="/content-audit", tags=["content-audit"])


class ContentAuditMetricRunRequest(BaseModel):
    job_id: str = Field(..., min_length=1, description="Crawl job ID")
    metric: MetricType
    urls: Optional[List[str]] = Field(default=None, description="Explicit URL subset to run")

    @field_validator("urls")
    @classmethod
    def normalise_urls(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        cleaned = []
        seen = set()
        for entry in value:
            if not isinstance(entry, str):
                continue
            url = entry.strip()
            if not url or url in seen:
                continue
            seen.add(url)
            cleaned.append(url)
        return cleaned or None


@router.post("/metrics/run")
async def run_content_audit_metrics(body: ContentAuditMetricRunRequest, background_tasks: BackgroundTasks):
    try:
        background_tasks.add_task(
            schedule_content_audit_metric,
            job_id=body.job_id,
            metric=body.metric,
            urls=body.urls,
        )
        return {
            "accepted": True,
            "job_id": body.job_id,
            "metric": body.metric,
            "urls": body.urls or [],
        }
    except Exception as exc:
        logger.error("Failed to schedule content audit metric run: %s", exc, exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(exc)})