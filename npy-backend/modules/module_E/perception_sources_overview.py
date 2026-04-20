from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from utils.mongo import mongo_manager
from .perception_sources import _classify_property, _normalize_model_filter, _to_dt


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lstrip("www.").lower()
    except Exception:
        return ""


def _is_owned_domain(domain: str, root_domain: str) -> bool:
    d = (domain or "").lower()
    r = (root_domain or "").lower().lstrip("www.")
    return bool(d and r and (d == r or d.endswith("." + r)))


def _week_start(dt: datetime) -> datetime:
    base = dt if isinstance(dt, datetime) else datetime.utcnow()
    return datetime(base.year, base.month, base.day) - timedelta(days=base.weekday())


def get_perception_sources_overview(
    *,
    job_id: str,
    customer_root_domain: str,
    llm: Optional[str] = None,
    property_filter: str = "All Topics",
    type_filter: str = "all",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    top_n_domains: int = 7,
) -> Dict[str, Any]:
    if not job_id:
        return {"success": False, "error": "job_id is required"}

    mongo_manager.connect()
    model_version = _normalize_model_filter(llm)
    dt_from = _to_dt(date_from)
    dt_to = _to_dt(date_to)

    query: Dict[str, Any] = {"job_id": job_id}
    if model_version:
        query["model_version"] = model_version
    if dt_from or dt_to:
        query["event_timestamp"] = {}
        if dt_from:
            query["event_timestamp"]["$gte"] = dt_from
        if dt_to:
            query["event_timestamp"]["$lte"] = dt_to

    projection = {
        "_id": 0,
        "raw_cited_url": 1,
        "cited_url": 1,
        "prompt_text": 1,
        "event_timestamp": 1,
    }
    events = list(mongo_manager.db.citation_events.find(query, projection))

    filtered: List[Dict[str, Any]] = []
    for e in events:
        raw = str(e.get("raw_cited_url") or e.get("cited_url") or "")
        dom = _extract_domain(raw)
        if not dom:
            continue

        if property_filter and property_filter not in ("All Topics", "All Properties", "All", "*"):
            if _classify_property(str(e.get("prompt_text") or "")) != property_filter:
                continue

        owned = _is_owned_domain(dom, customer_root_domain)
        if type_filter == "owned" and not owned:
            continue
        if type_filter == "third-party" and owned:
            continue

        ts = e.get("event_timestamp")
        if not isinstance(ts, datetime):
            ts = datetime.utcnow()
        filtered.append({"domain": dom, "event_timestamp": ts})

    total_sources = len(filtered)
    domain_counts: Dict[str, int] = {}
    weekly_total: Dict[str, int] = {}
    weekly_domain_counts: Dict[str, Dict[str, int]] = {}

    for row in filtered:
        dom = row["domain"]
        wk = _week_start(row["event_timestamp"]).date().isoformat()
        domain_counts[dom] = domain_counts.get(dom, 0) + 1
        weekly_total[wk] = weekly_total.get(wk, 0) + 1
        weekly_domain_counts.setdefault(wk, {})
        weekly_domain_counts[wk][dom] = weekly_domain_counts[wk].get(dom, 0) + 1

    unique_domains = len(domain_counts)
    ranked = sorted(domain_counts.items(), key=lambda x: (-x[1], x[0]))
    top_domains = [d for d, _ in ranked[: max(1, int(top_n_domains or 7))]]

    domain_share = []
    for d, c in ranked:
        pct = (c / total_sources * 100.0) if total_sources else 0.0
        domain_share.append({"domain": d, "citations": c, "share_pct": round(pct, 2)})

    timeline = sorted(weekly_total.keys())
    trend_series = []
    for d in top_domains:
        points = []
        for wk in timeline:
            wk_total = weekly_total.get(wk, 0)
            wk_dom = weekly_domain_counts.get(wk, {}).get(d, 0)
            share = (wk_dom / wk_total * 100.0) if wk_total else 0.0
            points.append({"week_start": wk, "citations": wk_dom, "share_pct": round(share, 2)})
        trend_series.append({"domain": d, "points": points})

    return {
        "success": True,
        "job_id": job_id,
        "filters": {
            "llm": llm or "All Models",
            "property": property_filter,
            "type": type_filter,
            "date_from": date_from,
            "date_to": date_to,
        },
        "kpis": {
            "total_sources": total_sources,
            "unique_domains": unique_domains,
        },
        "domain_share": domain_share,
        "trend": {
            "timeline": timeline,
            "series": trend_series,
        },
    }
