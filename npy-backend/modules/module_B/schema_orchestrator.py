"""
schema_orchestrator.py
======================
Colytics AI — Module B Controller
Orchestrates SchemaGenerator (Builder) + SchemaIntelligenceEngine (Auditor).

THE FIX — why LCS was identical for every schema type:
  Before: auditor.analyse(html, url) — always same HTML, same URL
          → same page_type detected → same expected schemas
          → same gaps → same LCS score for EVERY markup type

  After:  auditor.analyse(
            html               = original html,
            url                = url,
            page_data          = pre-extracted (shared, no re-parse),
            schema_type        = user's selected type e.g. "HowTo",
            generated_schema_text = Claude's JSON-LD output
          )
          → page_type forced to match selected schema type
          → generated schema injected before extraction
          → gaps detected against GENERATED schema
          → unique LCS score per schema type ✅
"""

import json
import logging
from typing import Any, Dict, Optional


try:
    from .schema_generator import SchemaGenerator
    from .schema_intelligence import SchemaIntelligenceEngine
except ImportError:
    try:
        from schema_generator import SchemaGenerator
        from schema_intelligence import SchemaIntelligenceEngine
    except ImportError:
        SchemaGenerator = None       # type: ignore
        SchemaIntelligenceEngine = None  # type: ignore


class SchemaOrchestrator:
    """
    Single entry point for schema generation + LCS™ intelligence audit.

    Pipeline:
      1. SchemaGenerator extracts page_data once (shared with auditor)
      2. SchemaGenerator calls Claude → generates JSON-LD
      3. SchemaIntelligenceEngine analyses GENERATED schema
         with the correct page_type for the selected schema_type
      4. Returns unified response with both generation + audit results
    """

    def __init__(self) -> None:
        self.generator = SchemaGenerator()
        self.auditor   = SchemaIntelligenceEngine(
            schema_generator=self.generator
        )

    def run(
        self,
        html: str,
        url: str,
        schema_type: str = "auto",
    ) -> Dict[str, Any]:
        """
        Generate schema + run LCS™ audit in one call.

        Args:
            html:        Raw HTML of the page
            url:         Canonical URL
            schema_type: User-selected type ('auto', 'HowTo', 'FAQPage', etc.)

        Returns unified dict with:
            success, schema_type, schema, schema_text   ← from SchemaGenerator
            summary, gap_report, fix_patches,           ← from SchemaIntelligence
            lcs_score_report, schema_inventory,
            aivs_feed
        """
        logging.info(
            f"[ORCHESTRATOR] Starting run | url={url} | type={schema_type}"
        )

        # ── STEP 1: Generate schema (Claude) ──────────────────────────
        # generate_schema() internally:
        #   - extracts page_data and saves as self.generator.last_page_data
        #   - runs multi-page enrichment if needed
        #   - calls Claude to fill the schema
        gen_result = self.generator.generate_schema(html, url, schema_type)

        if not gen_result.get("success"):
            logging.error(
                f"[ORCHESTRATOR] Generation failed: {gen_result.get('message')}"
            )
            return gen_result

        # ── STEP 2: Get shared page_data (no re-parse) ────────────────
        page_data: Optional[Dict[str, Any]] = getattr(
            self.generator, "last_page_data", None
        )

        # ── STEP 3: Get generated schema text for injection ───────────
        # This is injected into the HTML before SchemaExtractor runs,
        # so gap detection sees Claude's output, not the original page.
        generated_schema_text: str = gen_result.get("schema_text") or ""

        # ── STEP 4: Run LCS™ intelligence audit ───────────────────────
        try:
            intel_report = self.auditor.analyse(
                html=html,
                url=url,
                page_data=page_data,
                schema_type=schema_type,                      # ← KEY FIX 1
                generated_schema_text=generated_schema_text,  # ← KEY FIX 2
            )

            lcs = intel_report.get("summary", {}).get("lcs_score", "N/A")
            page_type = intel_report.get("page_type", "N/A")
            logging.info(
                f"[ORCHESTRATOR] Audit complete | "
                f"page_type={page_type} | LCS={lcs}"
            )

            # Merge intelligence into generation result
            gen_result.update(intel_report)

        except Exception as exc:
            logging.error(f"[ORCHESTRATOR] Intelligence audit failed: {exc}")
            # Return generation result without audit on failure
            gen_result["_audit_error"] = str(exc)

        return gen_result