"""
Performance Metrics Sub-module

Extracts ranking, GA traffic, and keyword volume signals.

Field sources:
  currentRanking       - DataForSEO SERP position for primary keyword (placeholder)
  ga30DaysTraffic      - GA4 BetaAnalyticsDataClient.run_report() (sessions, last 30d, per pagePath)
  overallKeywords      - Total keyword count from rank-tracking API (placeholder)
  firstPageKeywords    - Keywords ranking on page 1 (placeholder)
"""
import logging
import os
import re
from datetime import date, timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlparse

try:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange,
        Dimension,
        Filter,
        FilterExpression,
        FilterExpressionList,
        Metric,
        RunReportRequest,
    )
    from google.oauth2 import service_account as ga_service_account
    _GA_AVAILABLE = True
except ImportError:
    _GA_AVAILABLE = False

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# GA Traffic Helper
# ---------------------------------------------------------------------------

async def _fetch_ga_traffic(url: str, ga_property_id: str) -> int:
    """
    Fetch 30-day session count from GA4 via BetaAnalyticsDataClient.

    Reads credentials from GA_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.
    The GA property ID is resolved from (in order):
      1. *ga_property_id* argument (per-job override)
      2. GA_PROPERTY_ID environment variable (site-wide default)

    Runs the synchronous GA client in a thread executor so the event loop is not blocked.
    Returns 0 when credentials/property ID are absent or on any API error.
    """
    if not _GA_AVAILABLE:
        logger.warning("[PM][GA] google-analytics-data package not installed — ga30DaysTraffic=0. Run: pip install google-analytics-data")
        return 0

    # Resolve property ID: explicit argument > env var
    ga_property_id = ga_property_id or os.environ.get("GA_PROPERTY_ID", "")
    if not ga_property_id:
        logger.info("[PM][GA] ga_property_id not set — ga30DaysTraffic=0. Set GA_PROPERTY_ID env var or pass ga_property_id to the crawler job.")
        return 0

    creds_path = os.environ.get("GA_SERVICE_ACCOUNT_JSON") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS", ""
    )
    if not creds_path:
        logger.warning(
            "[PM][GA] No GA credentials env var set — ga30DaysTraffic=0. "
            "Set GA_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path."
        )
        return 0
    if not os.path.exists(creds_path):
        logger.warning(f"[PM][GA] Credentials file not found at {creds_path!r} — ga30DaysTraffic=0.")
        return 0
    logger.info(f"[PM][GA] Using credentials from {creds_path!r}, property={ga_property_id!r}")

    raw_path = urlparse(url).path or "/"
    # Normalise: strip trailing slash so we can match both variants
    page_path_stripped = raw_path.rstrip("/") or ""

    # Build a regex that matches with or without trailing slash.
    # GA4 may record /page or /page/ depending on how the hit was collected.
    if not page_path_stripped:
        # Homepage – match exactly "/"
        page_path_regex = "^/$"
    else:
        page_path_regex = f"^{re.escape(page_path_stripped)}/?$"

    logger.info(f"[PM][GA] pagePath filter regex: {page_path_regex!r}")

    def _run_report() -> int:
        credentials = ga_service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=["https://www.googleapis.com/auth/analytics.readonly"],
        )
        client = BetaAnalyticsDataClient(credentials=credentials)
        today = date.today()

        # ── One-time diagnostic: fetch top-10 pages to verify GA access ──
        if not _fetch_ga_traffic._diag_done:
            _fetch_ga_traffic._diag_done = True
            try:
                # 1) Which hostnames does this property have?
                host_req = RunReportRequest(
                    property=f"properties/{ga_property_id}",
                    dimensions=[Dimension(name="hostName")],
                    metrics=[Metric(name="sessions")],
                    date_ranges=[
                        DateRange(
                            start_date=(today - timedelta(days=30)).strftime("%Y-%m-%d"),
                            end_date=today.strftime("%Y-%m-%d"),
                        )
                    ],
                    limit=20,
                )
                host_resp = client.run_report(host_req)
                if host_resp.rows:
                    logger.info(f"[PM][GA][DIAG] Property {ga_property_id} — hostnames (last 30d):")
                    for row in host_resp.rows:
                        logger.info(f"[PM][GA][DIAG]   host={row.dimension_values[0].value} => {row.metric_values[0].value} sessions")
                else:
                    logger.warning(f"[PM][GA][DIAG] Property {ga_property_id} has ZERO hostnames in last 30 days.")

                # 2) Top-10 pages by sessions
                diag_req = RunReportRequest(
                    property=f"properties/{ga_property_id}",
                    dimensions=[Dimension(name="hostName"), Dimension(name="pagePath")],
                    metrics=[Metric(name="sessions")],
                    date_ranges=[
                        DateRange(
                            start_date=(today - timedelta(days=30)).strftime("%Y-%m-%d"),
                            end_date=today.strftime("%Y-%m-%d"),
                        )
                    ],
                    limit=15,
                )
                diag_resp = client.run_report(diag_req)
                if diag_resp.rows:
                    logger.info(f"[PM][GA][DIAG] Property {ga_property_id} — top-15 pages (last 30d):")
                    for row in diag_resp.rows:
                        logger.info(f"[PM][GA][DIAG]   {row.dimension_values[0].value}{row.dimension_values[1].value} => {row.metric_values[0].value} sessions")
                else:
                    logger.warning(f"[PM][GA][DIAG] Property {ga_property_id} returned ZERO page rows for last 30 days. "
                                   "Either the property has no data or the service account lacks access.")
            except Exception as diag_exc:
                logger.error(f"[PM][GA][DIAG] Diagnostic query failed: {diag_exc}")

        # Extract hostname from URL to filter multi-site property
        parsed = urlparse(url)
        hostname = parsed.hostname or ""

        request = RunReportRequest(
            property=f"properties/{ga_property_id}",
            dimensions=[Dimension(name="pagePath")],
            metrics=[Metric(name="sessions")],
            date_ranges=[
                DateRange(
                    start_date=(today - timedelta(days=30)).strftime("%Y-%m-%d"),
                    end_date=today.strftime("%Y-%m-%d"),
                )
            ],
            dimension_filter=FilterExpression(
                and_group=FilterExpressionList(
                    expressions=[
                        FilterExpression(
                            filter=Filter(
                                field_name="hostName",
                                string_filter=Filter.StringFilter(
                                    value=hostname,
                                    match_type=Filter.StringFilter.MatchType.EXACT,
                                ),
                            )
                        ),
                        FilterExpression(
                            filter=Filter(
                                field_name="pagePath",
                                string_filter=Filter.StringFilter(
                                    value=page_path_regex,
                                    match_type=Filter.StringFilter.MatchType.FULL_REGEXP,
                                ),
                            )
                        ),
                    ]
                )
            ),
        )
        response = client.run_report(request)
        total = 0
        for row in response.rows:
            total += int(row.metric_values[0].value)
        if response.rows:
            logger.info(f"[PM][GA] Matched {len(response.rows)} row(s) for regex {page_path_regex!r}")
        return total

    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(_run_report).result(timeout=30)
        logger.info(f"[PM][GA] {url} | sessions_30d={result}")
        return result
    except Exception as exc:
        logger.error(f"[PM][GA] GA4 traffic fetch FAILED for {url}: {exc}")
        return 0

# Initialise the one-time diagnostic flag
_fetch_ga_traffic._diag_done = False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def extract_performance_metrics(
    url: str,
    html_content: str = "",
    main_keyword: str = "",
    ga_property_id: str = None,
    response_headers: Dict[str, str] = None,
    existing_item: Dict[str, Any] = None,
    h1: str = "",
    title: str = "",
    **kwargs,
) -> Dict[str, Any]:
    """
    Async entry point for Performance Metrics extraction.

    Returns:
        {
            "currentRanking":    int | None,   # SERP rank for primary keyword (placeholder)
            "ga30DaysTraffic":   int,           # GA4 sessions last 30 days
            "overallKeywords":   int,           # total keywords tracked (placeholder)
            "firstPageKeywords": int,           # keywords on page 1 (placeholder)
        }
    """
    existing = existing_item or {}

    logger.info(f"[PM] START extract_performance_metrics for {url} | ga_property={ga_property_id!r}")

    # 1. Current Ranking (placeholder — rank-tracking API integration pending) --
    current_ranking = existing.get("currentRanking") or None

    # 2. GA 30-day traffic ---------------------------------------------------
    if existing.get("ga30DaysTraffic") is not None:
        ga_traffic = int(existing["ga30DaysTraffic"])
        logger.info(f"[PM] ga30DaysTraffic: reusing existing value={ga_traffic}")
    else:
        ga_traffic = await _fetch_ga_traffic(url, ga_property_id or "")

    # 3. Overall Keywords (placeholder — rank-tracking API integration pending) -
    overall_keywords = existing.get("overallKeywords") or 0

    # 4. First Page Keywords (placeholder — rank-tracking API integration pending)
    first_page_keywords = existing.get("firstPageKeywords") or 0

    logger.info(
        f"[PM] DONE {url} | ranking={current_ranking} ga={ga_traffic}"
        f" overallKW={overall_keywords} firstPageKW={first_page_keywords}"
    )

    return {
        "currentRanking": current_ranking,
        "ga30DaysTraffic": ga_traffic,
        "overallKeywords": overall_keywords,
        "firstPageKeywords": first_page_keywords,
    }
