"""
Module C Runner — Orchestrates C5 → C1 → C3 → C6 → C4 → C2 → C7 → C9 → C8.

Processing order is mandated: each stage feeds into subsequent stages.

Input sources:
  - HTML: loaded from S3 via sourceJobId (the crawl job that stored it)
  - Page metadata: loaded from MongoDB `pages` collection for the crawl job
  - Domain: parsed from the URL
  - Industry: loaded from `module_e` collection (brand onboarding data)
  - robots.txt: fetched live from {domain}/robots.txt
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup

from utils.mongo import mongo_manager
from utils.storage import save_raw_html, load_raw_html
from utils.event_publisher import publisher

from .c5_entity_extractor import run_c5
from .c1_aeo_checker import run_c1
from .c3_entity_coverage import run_c3
from .c6_missing_info import run_c6
from .c4_answer_completeness import run_c4
from .c2_bulk_audit import run_c2_from_crawl, run_c2_from_urls
from .c7_llm_simulator import run_c7
from .c9_multi_model import run_c9
from .c8_page_actions import run_c8

logger = logging.getLogger("module_c")

SUBMODULE_ORDER = ["c5", "c1", "c3", "c6", "c4", "c2", "c7", "c9", "c8"]


# ═════════════════════════════════════════════════════════════════════════════
#  Input helpers — resolve all inputs from existing DB / live fetches
# ═════════════════════════════════════════════════════════════════════════════

def _domain_from_url(url: str) -> str:
    """Extract bare domain from a URL (e.g. 'colytics.ai')."""
    parsed = urlparse(url if url.startswith(("http://", "https://")) else f"https://{url}")
    return parsed.netloc or url


def _load_page_metadata(crawl_job_id: str, url: str) -> Dict[str, Any]:
    """
    Load page-level crawl metadata from the MongoDB `pages` collection.

    The crawl spider stores per-page data (status_code, response_time,
    word_count, canonical_url, has_structured_data, heading_structure, etc.)
    keyed by {jobId, url}. We use this instead of re-parsing HTML fields
    that are already computed.
    """
    try:
        doc = mongo_manager.db.pages.find_one(
            {"jobId": crawl_job_id, "url": url},
            {"_id": 0},
        )
        return dict(doc) if doc else {}
    except Exception as e:
        logger.warning(f"[MODULE_C] Could not load page metadata: {e}")
        return {}


def _load_industry(source_job_id: str) -> str:
    """
    Resolve the industry string from the brand-onboarding data stored in
    the `module_e` collection.  Falls back to empty string.
    """
    try:
        doc = mongo_manager.module_e.find_one(
            {"jobId": source_job_id},
            {"brand_description": 1, "_id": 0},
        )
        if doc and doc.get("brand_description"):
            # module_e stores a brand_description (LLM-generated text about
            # the brand).  There is no separate 'industry' field, so we
            # return the brand description itself as the industry context.
            return doc["brand_description"]
    except Exception as e:
        logger.warning(f"[MODULE_C] Could not load industry from module_e: {e}")
    return ""


async def _fetch_robots_txt(domain: str) -> str:
    """
    Fetch robots.txt live from the domain. This is NOT stored by the
    crawler so we fetch it on demand. Timeout after 5 s silently.
    """
    robots_url = f"https://{domain}/robots.txt"
    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=5),
            headers={"User-Agent": "Mozilla/5.0 (compatible; YogreetBot/1.0)"},
        ) as session:
            async with session.get(robots_url) as resp:
                if resp.status == 200:
                    return await resp.text()
    except Exception:
        logger.debug(f"[MODULE_C] robots.txt not available at {robots_url}")
    return ""


def _derive_query(html: str, url: str, query: Optional[str]) -> str:
    """Build a fallback query from the page title when none is provided."""
    if query:
        return query
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    return f"What is {title}?" if title else f"What is the content of {url} about?"


class ModuleCRunner:
    """Orchestrates the full Module C (AEO) analysis pipeline."""

    @staticmethod
    def _emit_progress(job_id: str, step: int, total_steps: int, stage: str, message: str) -> None:
        """Emit a non-blocking progress event for live UI streaming."""
        try:
            percent = int((step / max(total_steps, 1)) * 100)
            percent = max(5, min(98, percent))
            publisher.emit_event(
                job_id,
                "PROGRESS_UPDATE",
                {
                    "status": "running",
                    "progress": percent,
                    "stage": stage,
                    "step": step,
                    "total_steps": total_steps,
                    "message": message,
                },
            )
        except Exception as e:
            logger.debug(f"[MODULE_C] Failed to emit progress event: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    #  Full pipeline
    # ─────────────────────────────────────────────────────────────────────────

    async def run(
        self,
        job_id: str,
        url: str,
        source_job_id: str = "",
        html_content: Optional[str] = None,
        query: Optional[str] = None,
        domain: str = "",
        industry: str = "",
    ) -> Dict[str, Any]:
        """
        Run the complete Module C pipeline: C5→C1→C3→C6→C4→C2→C7→C9→C8.

        Args:
            job_id: The Module C analysis job ID (created by Node backend).
            url: The page URL to analyse.
            source_job_id: The crawl job ID whose data we reference.
                           Used to load HTML from S3 and page metadata from
                           the ``pages`` collection.
            html_content: Optional raw HTML (bypass S3 fetch).
            query: Optional user query for LLM simulation.
            domain: Domain string — auto-derived from *url* if empty.
            industry: Industry string — loaded from onboarding DB if empty.
        """
        # ── Resolve source_job_id (falls back to job_id for backwards compat)
        src_id = source_job_id or job_id

        # ── Load HTML from S3 (stored by crawler under the crawl job_id) ──
        if not html_content:
            html_content = await load_raw_html(src_id)
        if not html_content:
            logger.error(f"[MODULE_C] HTML not found for source job {src_id}")
            return {
                "error": "HTML not found in S3. Run CRAWLER job first or provide htmlContent.",
                "job_id": job_id,
            }

        # ── Resolve domain ───────────────────────────────────────────────
        if not domain:
            domain = _domain_from_url(url)

        # ── Resolve industry from onboarding DB ──────────────────────────
        if not industry:
            industry = _load_industry(src_id)

        # ── Load page metadata from crawl DB (status_code, response_time…)
        page_meta = _load_page_metadata(src_id, url)
        status_code = page_meta.get("status_code", 200)
        download_latency = page_meta.get("response_time", 0) or 0

        # ── Fetch robots.txt live (not stored by crawler) ────────────────
        robots_txt = await _fetch_robots_txt(domain)

        query = _derive_query(html_content, url, query)

        total_stages = 9

        # ── C5: Entity Extraction (synchronous, no AI calls) ─────────────
        self._emit_progress(job_id, 1, total_stages, "c5", "Extracting entities and content signals")
        logger.info(f"[MODULE_C] C5 — Entity Extraction | {url[:60]}")
        c5_output = run_c5(html_content, word_count=page_meta.get("word_count", 0))

        # ── C1: AEO Checker (sub-component scoring + entity ratio LLM) ──
        self._emit_progress(job_id, 2, total_stages, "c1", "Scoring AEO readiness")
        logger.info(f"[MODULE_C] C1 — AEO Checker | {url[:60]}")
        c1_output = await run_c1(
            html=html_content,
            url=url,
            c5_output=c5_output,
            robots_txt=robots_txt,
            download_latency_s=download_latency,
            status_code=status_code,
            industry=industry,
        )

        page_topic = c1_output.get("page_topic", "")
        page_type = c1_output.get("page_type", "other")

        # ── C3: Entity Coverage Audit ────────────────────────────────────
        self._emit_progress(job_id, 3, total_stages, "c3", "Measuring entity coverage")
        logger.info(f"[MODULE_C] C3 — Entity Coverage | {url[:60]}")
        c3_output = await run_c3(
            c1_output=c1_output,
            c5_output=c5_output,
            url=url,
        )

        # ── C6: Missing Information Analysis ─────────────────────────────
        self._emit_progress(job_id, 4, total_stages, "c6", "Finding missing information gaps")
        logger.info(f"[MODULE_C] C6 — Missing Information | {url[:60]}")
        c6_output = await run_c6(
            c3_output=c3_output,
            c5_output=c5_output,
            page_topic=page_topic,
            industry=industry,
        )

        # ── C4: Answer Completeness Score ────────────────────────────────
        self._emit_progress(job_id, 5, total_stages, "c4", "Scoring answer completeness")
        logger.info(f"[MODULE_C] C4 — Answer Completeness | {url[:60]}")
        c4_output = await run_c4(
            visible_text=c5_output.get("visible_text", ""),
            page_topic=page_topic,
            page_type=page_type,
        )

        # ── C2: Bulk — skipped for single-page; run via run_bulk_audit() ─
        self._emit_progress(job_id, 6, total_stages, "c2", "Skipping bulk audit for single-page analysis")
        c2_output: Dict[str, Any] = {}

        # ── C7: Live LLM Answer Simulation (most expensive) ─────────────
        self._emit_progress(job_id, 7, total_stages, "c7", "Running AI answer simulation")
        logger.info(f"[MODULE_C] C7 — LLM Answer Simulation | {url[:60]}")
        c7_output = await run_c7(
            visible_text=c5_output.get("visible_text", ""),
            page_topic=page_topic,
        )

        # Raw answer strings for C9
        c7_raw_answers: Dict[str, List[str]] = c7_output.get("raw_answers", {})

        # ── C9: Multi-Model Insights ─────────────────────────────────────
        self._emit_progress(job_id, 8, total_stages, "c9", "Comparing cross-model response quality")
        logger.info(f"[MODULE_C] C9 — Multi-Model Insights | {url[:60]}")
        c9_output = await run_c9(
            domain=domain,
            c7_output=c7_output,
            c7_raw_answers=c7_raw_answers,
        )

        # ── C8: Page-Level Improvement Actions (final aggregation) ───────
        self._emit_progress(job_id, 9, total_stages, "c8", "Generating improvement actions")
        logger.info(f"[MODULE_C] C8 — Improvement Actions | {url[:60]}")
        c8_output = run_c8(
            c1_output=c1_output,
            c3_output=c3_output,
            c4_output=c4_output,
            c6_output=c6_output,
        )

        # ── Overall Score ────────────────────────────────────────────────
        overall_score = round(
            (c1_output.get("llm_friendliness_score", 0) * 0.30)
            + (c4_output.get("completeness_score", 0) * 0.20)
            + (c3_output.get("entity_coverage_pct", 0) * 0.20)
            + (c7_output.get("consistency", {}).get("overall", 0) * 0.15)
            + (c7_output.get("accuracy", {}).get("overall", 0) * 0.15),
            1,
        )

        result: Dict[str, Any] = {
            "job_id": src_id,
            "url": url,
            "domain": domain,
            "industry": industry,
            "overall_score": overall_score,
            "modules": {
                "entity_extraction": c5_output,
                "aeo_checker": c1_output,
                "entity_coverage": c3_output,
                "missing_info": c6_output,
                "answer_completeness": c4_output,
                "llm_simulator": c7_output,
                "multi_model": c9_output,
                "page_actions": c8_output,
            },
        }

        # ── Persist to aeo_analysis collection ───────────────────────────
        try:
            from utils.storage import save_aeo_analysis
            self._emit_progress(job_id, total_stages, total_stages, "persist", "Saving analysis results")
            await save_aeo_analysis(src_id, url, result)
        except Exception as e:
            logger.error(f"[MODULE_C] Failed to save AEO analysis: {e}")

        logger.info(f"[MODULE_C] Full pipeline done | score={overall_score} | {url[:60]}")
        return result

    # ─────────────────────────────────────────────────────────────────────────
    #  Individual submodule execution
    # ─────────────────────────────────────────────────────────────────────────

    async def run_submodule(
        self,
        submodule: str,
        job_id: str,
        url: str,
        source_job_id: str = "",
        html_content: Optional[str] = None,
        query: Optional[str] = None,
        domain: str = "",
        industry: str = "",
    ) -> Dict[str, Any]:
        """Run a single submodule of Module C."""
        src_id = source_job_id or job_id

        if not html_content:
            html_content = await load_raw_html(src_id)
        if not html_content:
            logger.error(f"[MODULE_C] HTML not found for job {src_id} ({submodule})")
            return {"error": "HTML not found in S3. Run CRAWLER job first or provide htmlContent."}

        if not domain:
            domain = _domain_from_url(url)
        if not industry:
            industry = _load_industry(src_id)

        page_meta = _load_page_metadata(src_id, url)

        try:
            c5_output = run_c5(html_content, word_count=page_meta.get("word_count", 0))

            if submodule == "c5":
                return c5_output

            if submodule == "c1":
                robots_txt = await _fetch_robots_txt(domain)
                return await run_c1(
                    html=html_content, url=url, c5_output=c5_output,
                    robots_txt=robots_txt,
                    download_latency_s=page_meta.get("response_time", 0) or 0,
                    status_code=page_meta.get("status_code", 200),
                    industry=industry,
                )

            # For deeper submodules, build prerequisites in chain
            robots_txt = await _fetch_robots_txt(domain)
            c1_output = await run_c1(
                html=html_content, url=url, c5_output=c5_output,
                robots_txt=robots_txt,
                download_latency_s=page_meta.get("response_time", 0) or 0,
                status_code=page_meta.get("status_code", 200),
                industry=industry,
            )

            if submodule == "c3":
                return await run_c3(c1_output=c1_output, c5_output=c5_output, url=url)

            if submodule == "c6":
                c3_output = await run_c3(c1_output=c1_output, c5_output=c5_output, url=url)
                return await run_c6(
                    c3_output=c3_output, c5_output=c5_output,
                    page_topic=c1_output.get("page_topic", ""),
                    industry=industry,
                )

            if submodule == "c4":
                return await run_c4(
                    visible_text=c5_output.get("visible_text", ""),
                    page_topic=c1_output.get("page_topic", ""),
                    page_type=c1_output.get("page_type", "other"),
                )

            if submodule == "c7":
                return await run_c7(
                    visible_text=c5_output.get("visible_text", ""),
                    page_topic=c1_output.get("page_topic", ""),
                )

            if submodule == "c9":
                c7_output = await run_c7(
                    visible_text=c5_output.get("visible_text", ""),
                    page_topic=c1_output.get("page_topic", ""),
                )
                return await run_c9(
                    domain=domain, c7_output=c7_output,
                    c7_raw_answers=c7_output.get("raw_answers", {}),
                )

            if submodule == "c8":
                c3_output = await run_c3(c1_output=c1_output, c5_output=c5_output, url=url)
                c6_output = await run_c6(
                    c3_output=c3_output, c5_output=c5_output,
                    page_topic=c1_output.get("page_topic", ""),
                    industry=industry,
                )
                c4_output = await run_c4(
                    visible_text=c5_output.get("visible_text", ""),
                    page_topic=c1_output.get("page_topic", ""),
                    page_type=c1_output.get("page_type", "other"),
                )
                return run_c8(
                    c1_output=c1_output, c3_output=c3_output,
                    c4_output=c4_output, c6_output=c6_output,
                )

            # Legacy submodule names → full pipeline
            if submodule in ("ai_presence", "answerability", "knowledge_base",
                             "llm_simulator", "actionable_insights"):
                full = await self.run(
                    job_id, url, source_job_id=src_id,
                    html_content=html_content, query=query,
                    domain=domain, industry=industry,
                )
                return full.get("modules", {})

            return {"error": f"Unknown submodule: {submodule}"}

        except Exception as e:
            logger.error(f"[MODULE_C] Submodule {submodule} failed: {e}", exc_info=True)
            return {"error": str(e)}

    # ─────────────────────────────────────────────────────────────────────────
    #  Bulk audit (C2)
    # ─────────────────────────────────────────────────────────────────────────

    async def run_bulk_audit(
        self,
        urls: Optional[List[str]] = None,
        job_id: str = "bulk_audit",
        industry: str = "",
        robots_txt: str = "",
    ) -> Dict[str, Any]:
        if urls:
            return await run_c2_from_urls(urls, robots_txt=robots_txt, industry=industry)
        return await run_c2_from_crawl(job_id, robots_txt=robots_txt, industry=industry)


# ── Singleton ────────────────────────────────────────────────────────────────
runner = ModuleCRunner()


async def run_module_c(
    job_id: str,
    url: str,
    source_job_id: str = "",
    html_content: Optional[str] = None,
    query: Optional[str] = None,
    domain: str = "",
    industry: str = "",
) -> Dict[str, Any]:
    """
    Entry point for Module C analysis.

    Called by the executor.  Passes ``source_job_id`` through to the runner
    so that it can resolve HTML from S3, page metadata from the ``pages``
    collection, and industry from the ``module_e`` collection — all keyed
    on the original crawl job.
    """
    return await runner.run(
        job_id=job_id,
        url=url,
        source_job_id=source_job_id,
        html_content=html_content,
        query=query,
        domain=domain,
        industry=industry,
    )

