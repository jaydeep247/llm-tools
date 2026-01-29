from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Literal, Optional, Dict, Any

from ...services.module_A.dataforseo_client import DataForSEOClient


router = APIRouter(prefix="/api/serp", tags=["SERP"])


class SerpFetchRequest(BaseModel):
    keyword: str
    location: str
    device: Literal["desktop", "mobile"] = "desktop"
    max_results: int = 100
    # Optional advanced fields if we decide to expose them later
    language_code: Optional[str] = "en"
    search_engine_domain: Optional[str] = "google.com"


class SerpResultItem(BaseModel):
    position: int
    url: str
    title: str
    type: Optional[str] = None


class SerpFeatures(BaseModel):
    featured_snippet: bool = False
    paa: bool = False
    video: bool = False
    images: bool = False


class SerpFetchResponse(BaseModel):
    results: List[SerpResultItem]
    features: SerpFeatures


def _extract_results_from_dataforseo(response: Dict[str, Any]) -> SerpFetchResponse:
    """
    Normalize DataForSEO SERP response into a compact, backend-agnostic format.

    We intentionally keep this mapping defensive because the exact shape of the
    DataForSEO response can evolve over time.
    """
    tasks = response.get("tasks") or []
    if not tasks:
        raise HTTPException(status_code=502, detail="DataForSEO response missing tasks")

    task = tasks[0] or {}
    result_list = task.get("result") or []
    if not result_list:
        # No SERP results (e.g. empty or error on their side)
        return SerpFetchResponse(results=[], features=SerpFeatures())

    result_block = result_list[0] or {}
    items = result_block.get("items") or []

    normalized_items: List[SerpResultItem] = []
    has_featured_snippet = False
    has_paa = False
    has_video = False
    has_images = False

    for item in items:
        item_type = item.get("type") or item.get("element_type") or ""
        # Only keep organic-like results for now
        if item_type not in ("organic", "featured_snippet", "answer_box", "local_pack", "video", "images") and not item_type.startswith("organic"):
            continue

        position = item.get("rank_group") or item.get("rank_absolute") or item.get("position")
        if position is None:
            continue

        url = item.get("url") or item.get("domain") or ""
        title = (
            item.get("title")
            or (item.get("title_extended") or {}).get("text")
            or ""
        )

        if not url:
            continue

        normalized_items.append(
            SerpResultItem(
                position=int(position),
                url=str(url),
                title=str(title) if title is not None else "",
                type=str(item_type) if item_type else None,
            )
        )

        # Basic feature flags
        if item_type == "featured_snippet":
            has_featured_snippet = True
        if item_type in ("people_also_ask", "related_questions", "paa"):
            has_paa = True
        if item_type in ("video", "videos_carousel", "video_carousel"):
            has_video = True
        if item_type in ("images", "images_carousel", "image_pack"):
            has_images = True

    # Some features may be exposed on result_block level as well
    # We keep this defensive and additive.
    serp_features = result_block.get("serp_features") or result_block.get("extra") or {}
    if serp_features:
        has_featured_snippet = has_featured_snippet or bool(
            serp_features.get("featured_snippet") or serp_features.get("answer_box")
        )
        has_paa = has_paa or bool(
            serp_features.get("people_also_ask")
            or serp_features.get("related_questions")
            or serp_features.get("paa")
        )
        has_video = has_video or bool(
            serp_features.get("video") or serp_features.get("videos")
        )
        has_images = has_images or bool(
            serp_features.get("images") or serp_features.get("image_pack")
        )

    return SerpFetchResponse(
        results=normalized_items,
        features=SerpFeatures(
            featured_snippet=has_featured_snippet,
            paa=has_paa,
            video=has_video,
            images=has_images,
        ),
    )


@router.post("/fetch", response_model=SerpFetchResponse)
async def fetch_serp(request: SerpFetchRequest) -> SerpFetchResponse:
    """
    Fetch a clean, non-personalized SERP snapshot from DataForSEO.

    This endpoint:
    - Uses a fixed user-agent
    - Disables cookies / logins (DataForSEO handles neutralization)
    - Uses location + device to emulate target context
    - Returns only the normalized organic-like results and core feature flags
    """
    client = DataForSEOClient()

    # Map our request to DataForSEO's organic live advanced endpoint
    payload = [
        {
            "keyword": request.keyword,
            "location_name": request.location,
            "language_code": request.language_code or "en",
            "device": "desktop" if request.device == "desktop" else "mobile",
            "os": "windows" if request.device == "desktop" else "android",
            "se_domain": request.search_engine_domain or "google.com",
            # maximum number of results to return
            "num": max(10, min(100, int(request.max_results))),
        }
    ]

    try:
        df_response = client.post(
            "/v3/serp/google/organic/live/advanced",
            payload,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch SERP from DataForSEO: {str(e)}",
        ) from e

    try:
        normalized = _extract_results_from_dataforseo(df_response)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to normalize SERP response: {str(e)}",
        ) from e

    return normalized

