"""MongoDB persistence helpers for SERP Analyzer results.

The ``serp_results`` collection has a unique index on ``jobId``
(created by ``utils/mongo.py`` at startup).  All writes use
``upsert=True`` so re-runs for the same job are idempotent.
"""

from __future__ import annotations

import logging
from typing import Any

from pymongo import DESCENDING

from utils.mongo import mongo_manager

logger = logging.getLogger(__name__)


def save_serp_result(document: dict[str, Any]) -> None:
    """Upsert a SERP result document into the ``serp_results`` collection.

    Args:
        document: A dict that maps 1-to-1 with the ``SerpAnalyzerResult``
                  Pydantic model (use ``model.model_dump()``).
    """
    job_id = document.get("jobId")
    if not job_id:
        raise ValueError("document must contain a non-empty 'jobId'")

    mongo_manager.connect()
    mongo_manager.serp_results.update_one(
        {"jobId": job_id},
        {"$set": document},
        upsert=True,
    )
    logger.info("[SERP STORE] Upserted serp_results | jobId=%s", job_id)


def load_serp_result(job_id: str) -> dict[str, Any] | None:
    """Return the SERP result document for *job_id*, or ``None``."""
    mongo_manager.connect()
    doc = mongo_manager.serp_results.find_one({"jobId": job_id})
    return doc  # type: ignore[return-value]


def load_session_serp_results(session_id: str) -> list[dict[str, Any]]:
    """Return all SERP result documents for a session, newest first."""
    mongo_manager.connect()
    docs = list(
        mongo_manager.serp_results.find(
            {"sessionId": session_id},
            sort=[("updatedAt", DESCENDING)],
        )
    )
    return docs  # type: ignore[return-value]


def save_raw_serp_json(job_id: str, keyword: str, raw: dict[str, Any]) -> None:
    """Persist the raw DataForSEO response for a single keyword.

    Stored under ``raw_serp_json.<keyword_slug>`` so the full SERP page can
    be re-parsed without re-calling the API.  The keyword is slugified to
    produce a valid MongoDB field name.
    """
    slug = keyword.lower().replace(" ", "_").replace("-", "_")[:100]
    mongo_manager.connect()
    mongo_manager.serp_results.update_one(
        {"jobId": job_id},
        {"$set": {f"raw_serp_json.{slug}": raw}},
        upsert=True,
    )
