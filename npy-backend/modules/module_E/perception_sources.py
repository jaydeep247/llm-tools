import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple
from urllib.parse import urlparse

from utils.mongo import mongo_manager


PerceptionSourceType = Literal[
    "all",
    "owned",
    "third-party",
    "article",
    "blog",
    "case-study",
    "forum-community",
    "guide-tutorial",
    "homepage",
    "marketing-listing",
    "product-comparison",
    "product-page",
    "research",
    "broken",
]


_MARKETING_LISTING_DOMAINS = {
    "g2.com",
    "www.g2.com",
    "capterra.com",
    "www.capterra.com",
    "getapp.com",
    "www.getapp.com",
    "trustpilot.com",
    "www.trustpilot.com",
    "crunchbase.com",
    "www.crunchbase.com",
    "producthunt.com",
    "www.producthunt.com",
    "trustradius.com",
    "www.trustradius.com",
    "sourceforge.net",
    "www.sourceforge.net",
    "alternativeto.net",
    "www.alternativeto.net",
    "clutch.co",
    "www.clutch.co",
    "softwareadvice.com",
    "www.softwareadvice.com",
    "upcity.com",
    "www.upcity.com",
    "itqlick.com",
    "www.itqlick.com",
    "peerspot.com",
    "www.peerspot.com",
    "crozdesk.com",
    "www.crozdesk.com",
    "gartner.com",
    "www.gartner.com",
}


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lstrip("www.").lower()
    except Exception:
        return ""


def _normalize_model_filter(llm: Optional[str]) -> Optional[str]:
    """
    Frontend labels → stored model_version in Mongo.
    """
    if not llm:
        return None
    v = llm.strip().lower()
    if v in ("all", "all models", "*"):
        return None
    if v in ("chatgpt", "openai", "gpt", "gpt-4o"):
        return "gpt-4o"
    if v in ("gemini", "google", "gemini-2.0-flash"):
        return "gemini-2.0-flash"
    if v in ("claude", "anthropic", "claude-sonnet-4-5"):
        return "claude-sonnet-4-5"
    # allow passing exact stored value
    return llm


def _classify_property(prompt_text: str) -> str:
    """
    Best-effort property classifier (no extra schema required).
    This maps prompts into the dashboard property buckets used for filtering.
    """
    t = (prompt_text or "").lower()

    if re.search(r"\b(price|pricing|cost|plans?|billing|subscription)\b", t):
        return "Pricing"
    if re.search(r"\b(security|privacy|gdpr|soc\s?2|hipaa|encryption|compliance|secure)\b", t):
        return "Data Security"
    if re.search(r"\b(integrat|connect|api|zapier|webhook|gmail|outlook|slack|crm)\b", t):
        return "Integrations"
    if re.search(r"\b(support|customer support|help desk|sla|ticket|service)\b", t):
        return "Customer Support"
    if re.search(r"\b(customi[sz]e|customization|workflow|configuration|configurable)\b", t):
        return "Customization"
    if re.search(r"\b(feature|functionality|capabilit|what does|how does .* work)\b", t):
        return "Functionality"
    if re.search(r"\b(easy|ux|user experience|onboarding|learning curve|training)\b", t):
        return "User Experience"

    return "Other"


def _is_owned_domain(domain: str, root_domain: str) -> bool:
    """
    Owned: root domain OR any subdomain of root.
    Note: we still keep subdomains as separate rows; this is only for filtering.
    """
    d = (domain or "").lower()
    r = (root_domain or "").lower().lstrip("www.")
    if not d or not r:
        return False
    return d == r or d.endswith("." + r)


def _classify_source_type(url: str, is_broken: bool = False) -> PerceptionSourceType:
    """
    Best-effort classifier for cited URLs.

    This intentionally uses simple heuristics (domain + path keywords) so the
    filter works without requiring extra schema or crawl metadata.
    """
    if is_broken:
        return "broken"

    try:
        parsed = urlparse((url or "").strip())
        domain = (parsed.netloc or "").lower()
        path = (parsed.path or "").lower()
        query = (parsed.query or "").lower()
    except Exception:
        domain = ""
        path = ""
        query = ""

    if not domain:
        return "article"

    # 0. Broken / Hallucinated detection (high priority)
    # Detects common 404 patterns and LLM placeholders/hallucinations
    if any(tok in path for tok in ("404", "not-found", "error-404", "page-not-found", "dead-link", "undefined", "null")):
        return "broken"
    if any(tok in domain for tok in ("example.com", "placeholder.com", "yourdomain.com", "company.com")):
        return "broken"
    # Detect extremely long random-looking paths which are often hallucinated
    if len(path) > 150 and re.search(r'[a-z0-9]{32,}', path):
        return "broken"

    if domain in _MARKETING_LISTING_DOMAINS:
        return "marketing-listing"

    # Homepage: root or near-root URLs.
    if path in ("", "/"):
        return "homepage"

    # Forum / community pages.
    if any(d in domain for d in (
        "reddit.com", "stackoverflow.com", "stackexchange.com", "quora.com",
        "github.com", "medium.com", "dev.to", "hacker-news.firebaseio.com",
        "news.ycombinator.com", "twitter.com", "x.com", "linkedin.com", "facebook.com"
    )):
        return "forum-community"
    if any(tok in path for tok in ("/forum", "/forums", "/community", "/communities", "/discuss", "/discussion", "/groups/")):
        return "forum-community"

    # Case studies.
    if any(tok in path for tok in ("case-study", "case_study", "case-studies", "customer-stories", "success-stories")):
        return "case-study"

    # Guides / tutorials / Documentation.
    if any(tok in path for tok in (
        "/guide", "/guides", "/tutorial", "/tutorials", "/how-to", "/howto",
        "/docs", "/documentation", "/help", "/support", "/kb", "/knowledge-base"
    )):
        return "guide-tutorial"

    # Blog posts.
    if domain.startswith("blog.") or any(tok in path for tok in ("/blog", "/posts/", "/news/", "/updates/")):
        return "blog"

    # Research / whitepapers / reports.
    if any(tok in path for tok in ("/research", "whitepaper", "white-paper", "/papers", "/paper", "/report", "/reports", "/study")):
        return "research"

    # Product comparisons.
    if any(tok in path for tok in ("/compare", "comparison", "/vs", "-vs-", "/alternatives")) or "vs=" in query:
        return "product-comparison"

    # Product / marketing pages.
    if any(tok in path for tok in ("/product", "/products", "/features", "/pricing", "/solution", "/solutions", "/platform")):
        return "product-page"

    # Default bucket.
    return "article"


def _to_dt(val: Optional[str]) -> Optional[datetime]:
    if not val:
        return None
    try:
        # supports both "2026-04-17" and ISO timestamps
        if len(val.strip()) == 10:
            return datetime.fromisoformat(val.strip() + "T00:00:00")
        return datetime.fromisoformat(val.strip().replace("Z", "+00:00"))
    except Exception:
        return None


@dataclass(frozen=True)
class _EventRow:
    response_id: str
    model_version: str
    prompt_text: str
    raw_cited_url: str
    cited_url: str
    event_timestamp: Optional[datetime]
    is_broken: bool = False


def _load_events(
    job_id: str,
    model_version: Optional[str],
    dt_from: Optional[datetime],
    dt_to: Optional[datetime],
) -> List[_EventRow]:
    mongo_manager.connect()
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
        "response_id": 1,
        "model_version": 1,
        "prompt_text": 1,
        "raw_cited_url": 1,
        "cited_url": 1,
        "event_timestamp": 1,
        "is_broken": 1,
        "_id": 0,
    }

    rows: List[_EventRow] = []
    for e in mongo_manager.db.citation_events.find(query, projection):
        rows.append(
            _EventRow(
                response_id=str(e.get("response_id") or ""),
                model_version=str(e.get("model_version") or ""),
                prompt_text=str(e.get("prompt_text") or ""),
                raw_cited_url=str(e.get("raw_cited_url") or ""),
                cited_url=str(e.get("cited_url") or ""),
                event_timestamp=e.get("event_timestamp"),
                is_broken=bool(e.get("is_broken", False)),
            )
        )
    return rows


def get_perception_sources(
    *,
    job_id: str,
    customer_root_domain: str,
    search: str = "",
    llm: Optional[str] = None,
    property_filter: str = "All Properties",
    type_filter: PerceptionSourceType = "all",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit_domains: int = 200,
) -> Dict[str, Any]:
    """
    Aggregates citation domains from stored multi-model AI responses.

    Returns a structure shaped for the `PerceptionSources.tsx` table:
      - domains[]: { domain, totalUrls, responses, urls[] }
      - totals: unique_domains, unique_urls, responses
    """
    if not job_id:
        return {"success": False, "error": "job_id is required"}

    model_version = _normalize_model_filter(llm)
    dt_from = _to_dt(date_from)
    dt_to = _to_dt(date_to)

    events = _load_events(job_id, model_version, dt_from, dt_to)

    q = (search or "").strip().lower()
    prop = (property_filter or "").strip()

    # domain -> url -> set(response_id)
    domain_url_responses: Dict[str, Dict[str, set]] = {}
    domain_response_ids: Dict[str, set] = {}
    url_broken_map: Dict[str, bool] = {}

    for ev in events:
        raw = ev.raw_cited_url or ev.cited_url
        dom = _extract_domain(raw)
        if not dom:
            continue

        if prop and prop not in ("All Properties", "All", "*"):
            if _classify_property(ev.prompt_text) != prop:
                continue

        if type_filter != "all":
            # Back-compat: owned vs third-party based on domain relationship.
            if type_filter in ("owned", "third-party"):
                owned = _is_owned_domain(dom, customer_root_domain)
                if type_filter == "owned" and not owned:
                    continue
                if type_filter == "third-party" and owned:
                    continue
            else:
                # Content type classification based on the cited URL.
                norm_for_type = (ev.cited_url or raw or "").strip()
                if _classify_source_type(norm_for_type, ev.is_broken) != type_filter:
                    continue
        else:
            # DEFAULT: exclude broken/hallucinated pages from the 'all' view.
            if ev.is_broken:
                continue

        norm_url = (ev.cited_url or raw or "").strip()
        if not norm_url:
            continue

        if q:
            if q not in dom and q not in norm_url.lower():
                continue

        domain_url_responses.setdefault(dom, {}).setdefault(norm_url, set()).add(ev.response_id)
        domain_response_ids.setdefault(dom, set()).add(ev.response_id)
        url_broken_map[norm_url] = url_broken_map.get(norm_url, False) or ev.is_broken

    items = []
    for dom, url_map in domain_url_responses.items():
        # A URL is broken if ANY event citing it is marked broken
        urls = [
            {
                "url": u,
                "responses": len(rids),
                "type": _classify_source_type(u, url_broken_map.get(u, False))
            }
            for u, rids in sorted(url_map.items(), key=lambda x: -len(x[1]))
        ]
        items.append(
            {
                "domain": dom,
                "totalUrls": len(urls),
                "responses": len(domain_response_ids.get(dom, set())),
                "urls": urls,
            }
        )

    items.sort(key=lambda x: (-x["responses"], -x["totalUrls"], x["domain"]))
    items = items[: max(1, int(limit_domains or 200))]

    total_unique_domains = len(items)
    total_unique_urls = sum(i["totalUrls"] for i in items)
    total_responses = sum(i["responses"] for i in items)

    return {
        "success": True,
        "job_id": job_id,
        "filters": {
            "search": search or "",
            "llm": llm or "All Models",
            "property": property_filter or "All Properties",
            "type": type_filter,
            "date_from": date_from,
            "date_to": date_to,
        },
        "totals": {
            "unique_domains": total_unique_domains,
            "unique_urls": total_unique_urls,
            "responses": total_responses,
        },
        "domains": items,
    }


def get_perception_source_responses(
    *,
    job_id: str,
    domain: str,
    customer_root_domain: str,
    llm: Optional[str] = None,
    property_filter: str = "All Properties",
    type_filter: PerceptionSourceType = "all",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 250,
) -> Dict[str, Any]:
    """
    Returns response rows (prompt × model) that cited a specific domain.
    """
    if not job_id or not domain:
        return {"success": False, "error": "job_id and domain are required"}

    model_version = _normalize_model_filter(llm)
    dt_from = _to_dt(date_from)
    dt_to = _to_dt(date_to)

    events = _load_events(job_id, model_version, dt_from, dt_to)
    domain = domain.strip().lower()
    prop = (property_filter or "").strip()

    # distinct by response_id
    seen: set = set()
    rows: List[Dict[str, Any]] = []

    for ev in events:
        raw = ev.raw_cited_url or ev.cited_url
        dom = _extract_domain(raw)
        if dom != domain:
            continue

        if prop and prop not in ("All Properties", "All", "*"):
            if _classify_property(ev.prompt_text) != prop:
                continue

        if type_filter != "all":
            if type_filter in ("owned", "third-party"):
                owned = _is_owned_domain(dom, customer_root_domain)
                if type_filter == "owned" and not owned:
                    continue
                if type_filter == "third-party" and owned:
                    continue
            else:
                norm_for_type = (ev.cited_url or raw or "").strip()
                if _classify_source_type(norm_for_type, ev.is_broken) != type_filter:
                    continue
        else:
            # DEFAULT: exclude broken/hallucinated pages from the 'all' view.
            if ev.is_broken:
                continue

        if ev.response_id in seen:
            continue
        seen.add(ev.response_id)

        rows.append(
            {
                "response_id": ev.response_id,
                "prompt": ev.prompt_text,
                "property": _classify_property(ev.prompt_text),
                "llm": ev.model_version,
                "timestamp": ev.event_timestamp.isoformat() if ev.event_timestamp else None,
            }
        )

        if len(rows) >= max(1, int(limit or 250)):
            break

    return {
        "success": True,
        "job_id": job_id,
        "domain": domain,
        "count": len(rows),
        "rows": rows,
    }

