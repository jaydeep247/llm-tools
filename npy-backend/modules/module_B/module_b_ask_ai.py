# module_b_ask_ai.py
#
# Module B — Ask AI
#
# A project-scoped assistant that answers any question about Module B data.
#
# Flow:
#   1. Load the latest Module B (schemas collection) from MongoDB into one
#      context pack — same snapshot for every question.
#   2. Context covers: schema type, LCS™ score breakdown, gap report,
#      fix patches, schema inventory, AIVS feed, and generated schema details.
#   3. Optionally cross-references Module F (D7 / AI visibility) to give
#      richer context on how structured data gaps affect AI citation readiness.
#   4. Claude gets a glossary + full project data + optional routing hint.
#
# The model must not invent numbers — all facts come from the context pack.
# If data is missing it says so plainly.

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager

logger = logging.getLogger("module_b_ask_ai")

# ─────────────────────────────────────────────────────────────────────────────
# PLAN LIMITS
# ─────────────────────────────────────────────────────────────────────────────

ASK_AI_DAILY_LIMITS: Dict[str, int] = {
    "free": 5,
    "pro": 30,
    "agency": 100,
    "enterprise": 999,
}

# ─────────────────────────────────────────────────────────────────────────────
# PRODUCT GLOSSARY
# ─────────────────────────────────────────────────────────────────────────────

GLOSSARY = """
=== Module B / Structured Data & Schema Intelligence Glossary ===

LCS™ (LLM Citation Readiness Score, 0–100): Measures how well a page's
structured data prepares it for citation by AI language models (LLMs).
Higher = better citation readiness. Composed of 6 weighted parameters:
  1. Schema Presence (20%)     — whether required schema types exist on the page
  2. Schema Completeness (25%) — how fully the detected schema is filled in
  3. Schema Accuracy (15%)     — whether values match page content
  4. Schema Richness (15%)     — depth of optional/recommended properties
  5. Schema Conflicts (10%)    — contradictions between schema blocks
  6. Citation Signals (15%)    — signals that aid LLM citation (AuthorName,
                                  datePublished, publisher, FAQ, HowTo steps)

LCS™ Grade:
  A+ / A = Excellent citation readiness (score 80–100)
  B       = Good, minor gaps (score 60–79)
  C       = Moderate, clear opportunities (score 40–59)
  D       = Weak, significant structured data gaps (score 20–39)
  F       = Critical — AI models unlikely to cite this page (score 0–19)

Schema Tiers (SOP-006):
  Tier 1 — Critical (direct LLM citation lift): Organization, Article,
    BlogPosting, FAQPage, HowTo, Product
  Tier 2 — High value: LocalBusiness, Review, BreadcrumbList,
    SiteNavigationElement, WebPage, WebSite
  Tier 3 — Supporting: VideoObject, ImageObject, Person, Event,
    Service, Course, JobPosting, SoftwareApplication

Citation Lift (Tier 1): Estimated % increase in LLM citation probability
  when the schema is correctly implemented.

Gap Report: List of missing required/recommended properties per schema type.
  Each gap has a severity (critical / warning / info) and a suggested fix.

Fix Patches: Auto-generated JSON-LD snippets Claude has created to fill
  the identified gaps. Ready to copy-paste into the page <head>.

Schema Inventory: All structured data blocks found on the page —
  schema type, implementation method (JSON-LD / Microdata / RDFa),
  and completeness %.

AIVS™ Feed (AI Visibility Score): Module B contributes to the master
  AIVS™ score via the structured data dimension.
  aivs_schema_contribution = lcs_score × schema_dimension_weight

Page Type: Auto-detected page classification that determines which
  schema types are expected (e.g. "article" → Article + BreadcrumbList).

Schema Type (User Selected): The schema type requested by the user
  (e.g. "FAQPage", "HowTo", "Product", "auto" for auto-detect).

D7 Score (Module F cross-reference): Competitive AI citation benchmark.
  When Module F data is available, LCS™ gaps that also hurt D7 are
  flagged as higher priority.
"""

# ─────────────────────────────────────────────────────────────────────────────
# QUESTION CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

def _classify_question(question: str) -> str:
    """Classify into: explain / interpret / recommend / out_of_scope"""
    q = question.lower().strip()

    out_of_scope_patterns = [
        "write", "create content", "write a blog", "draft", "generate post",
        "social media post", "email newsletter", "help me write",
    ]
    if any(p in q for p in out_of_scope_patterns):
        return "out_of_scope"

    explain_patterns = [
        "what is", "what does", "what are", "explain", "define", "mean",
        "definition", "how is", "how does", "what's", "tell me about",
        "lcs", "citation readiness", "schema", "structured data", "json-ld",
        "microdata", "rdfa", "tier", "gap report", "fix patch", "aivs",
        "faqpage", "howto", "organization", "article", "product", "breadcrumb",
        "citation lift", "page type",
    ]
    if any(p in q for p in explain_patterns):\
        return "explain"

    recommend_patterns = [
        "what should", "how to improve", "how can i", "what can i do",
        "recommend", "suggestions", "next step", "action", "fix", "improve",
        "increase", "boost", "better", "priority", "top 3", "first thing",
        "what do i do", "help me", "strategy", "plan", "worst", "biggest issue",
        "patch", "implement", "add schema", "missing",
    ]
    if any(p in q for p in recommend_patterns):
        return "recommend"

    return "interpret"


def _lightweight_chat_reply(question: str) -> Optional[str]:
    """Pure greetings / thanks — respond without hitting the DB or Claude."""
    q2 = question.strip().lower()
    q2 = re.sub(r"[!?.，。！？\s]+$", "", q2).strip()

    if len(q2) <= 14 and re.fullmatch(r"h+i+", q2):
        return (
            "Hello. Ask a specific question about your Module B structured data analysis — for example "
            "your LCS™ score, which schema gaps are hurting your citation readiness, the generated "
            "fix patches, or how to prioritize schema improvements."
        )

    if re.match(r"^(hi|hey|hello|yo|sup|hiya|heya)\s*$", q2) or q2 in ("hi", "hey", "hello", "yo", "sup"):
        return (
            "Hello. I answer focused questions using your latest Module B schema and structured data "
            "audit results. What do you want to know — LCS™ score, schema gaps, fix patches, or priorities?"
        )

    if re.match(r"^(hi|hey|hello)\s+there\s*$", q2):
        return (
            "Hello. Pose a concrete question (for example: why is my LCS™ score low, "
            "which schema types are missing, or what should I implement first) and I will respond "
            "from your stored schema analysis."
        )

    if re.match(r"^good\s+(morning|afternoon|evening)\b", q2) and len(q2) < 40:
        return (
            "Hello. How can I help with your Module B schema audit — pick a topic "
            "(LCS™ score, schema gaps, fix patches, or citation readiness) and ask directly."
        )

    if re.match(r"^(thanks|thank you|thx|ty|cheers)\b", q2) and len(q2) < 48:
        return "You are welcome. Ask another question whenever you need clarity on your Module B data."

    if q2 in ("ok", "okay", "k", "kk", "got it", "cool", "nice", "alright"):
        return "Understood. What should we look at next in your schema audit?"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT LOADER
# ─────────────────────────────────────────────────────────────────────────────

def _load_context_pack(
    project_id: str,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Loads Module B schema data from MongoDB (schemas collection) and
    optionally cross-references Module F for AI visibility context.

    Returns a structured context pack for Claude to reason over.
    """
    context: Dict[str, Any] = {}

    try:
        mongo_manager.connect()

        # ── Load latest Module B schema result ────────────────────────────
        query: Dict[str, Any] = {"projectId": project_id}
        if job_id:
            query["jobId"] = job_id

        schema_doc = mongo_manager.schemas.find_one(
            query,
            sort=[("createdAt", -1)],
        )

        if not schema_doc:
            return {"error": "No Module B schema analysis found for this project. Run a schema generation first."}

        context["job_id"] = schema_doc.get("jobId")
        context["url"] = schema_doc.get("url", "")
        context["schema_type_requested"] = schema_doc.get("schemaType", "auto")
        context["schema_type_detected"] = schema_doc.get("type")
        context["analysis_date"] = str(schema_doc.get("createdAt", ""))
        context["success"] = schema_doc.get("success", False)
        context["cached"] = schema_doc.get("cached", False)
        context["generator_version"] = schema_doc.get("generatorVersion")

        if not context["success"]:
            context["error_code"] = schema_doc.get("error")
            context["error_message"] = schema_doc.get("message")
            return context

        # ── LCS™ Score Report ──────────────────────────────────────────────
        lcs_report = schema_doc.get("lcs_score_report") or {}
        if lcs_report:
            context["lcs"] = {
                "score": lcs_report.get("lcs_score"),
                "grade": lcs_report.get("lcs_grade"),
                "param_scores": lcs_report.get("parameter_scores") or {},
                "aivs_contribution": lcs_report.get("aivs_schema_contribution"),
                "citation_lift_estimate": lcs_report.get("citation_lift_estimate"),
            }

        # ── Summary ──────────────────────────────────────────────────────
        summary = schema_doc.get("summary") or {}
        if summary:
            context["summary"] = {
                "lcs_score": summary.get("lcs_score"),
                "lcs_grade": summary.get("lcs_grade"),
                "page_type": summary.get("page_type"),
                "total_schemas_found": summary.get("total_schemas_found"),
                "total_gaps": summary.get("total_gaps"),
                "critical_gaps": summary.get("critical_gaps"),
                "warning_gaps": summary.get("warning_gaps"),
                "top_priority": summary.get("top_priority_action"),
            }

        # ── Gap Report — top issues ────────────────────────────────────────
        gap_report = schema_doc.get("gap_report") or []
        if isinstance(gap_report, list):
            critical_gaps = [g for g in gap_report if g.get("severity") == "critical"]
            warning_gaps = [g for g in gap_report if g.get("severity") == "warning"]
            context["critical_gaps"] = [
                {
                    "schema_type": g.get("schema_type"),
                    "property": g.get("property"),
                    "issue": g.get("issue"),
                    "fix": (g.get("fix") or "")[:200],
                }
                for g in critical_gaps[:6]
            ]
            context["warning_gaps"] = [
                {
                    "schema_type": g.get("schema_type"),
                    "property": g.get("property"),
                    "issue": g.get("issue"),
                }
                for g in warning_gaps[:5]
            ]

        # ── Fix Patches — auto-generated JSON-LD snippets ────────────────
        fix_patches = schema_doc.get("fix_patches") or []
        if isinstance(fix_patches, list):
            context["fix_patches"] = [
                {
                    "schema_type": p.get("schema_type") or p.get("type"),
                    "description": p.get("description") or p.get("title"),
                    "priority": p.get("priority"),
                    "has_patch": bool(p.get("patch") or p.get("json_ld")),
                }
                for p in fix_patches[:6]
            ]

        # ── Schema Inventory — what's on the page already ────────────────
        inventory = schema_doc.get("schema_inventory") or []
        if isinstance(inventory, list):
            context["schema_inventory"] = [
                {
                    "type": s.get("type") or s.get("schema_type"),
                    "method": s.get("method") or s.get("implementation"),
                    "completeness_pct": s.get("completeness_pct") or s.get("completeness"),
                    "tier": s.get("tier"),
                }
                for s in inventory[:8]
            ]

        # ── AIVS Feed ──────────────────────────────────────────────────────
        aivs_feed = schema_doc.get("aivs_feed") or {}
        if aivs_feed:
            context["aivs"] = {
                "schema_dimension_score": aivs_feed.get("schema_dimension_score"),
                "dimension_weight": aivs_feed.get("dimension_weight"),
                "contribution": aivs_feed.get("aivs_contribution"),
                "recommended_types": aivs_feed.get("recommended_schema_types") or [],
            }

        # ── Generated schema overview ─────────────────────────────────────
        schema_obj = schema_doc.get("schema")
        if schema_obj:
            if isinstance(schema_obj, dict):
                context["generated_schema_type"] = schema_obj.get("@type")
                context["generated_schema_keys"] = list(schema_obj.keys())[:15]
            elif isinstance(schema_obj, list):
                context["generated_schema_type"] = [
                    s.get("@type") for s in schema_obj if isinstance(s, dict)
                ]

        # ── Module F cross-reference (AI visibility context) ──────────────
        try:
            module_f_doc = mongo_manager.db.module_f.find_one(
                {"projectId": project_id},
                sort=[("createdAt", -1)],
                projection={
                    "d7_aivs_output": 1,
                    "gap_analysis": 1,
                    "compare_visibility_against_competitors": 1,
                    "_id": 0,
                },
            )
            if module_f_doc:
                d7 = module_f_doc.get("d7_aivs_output") or {}
                if d7:
                    context["module_f_reference"] = {
                        "d7_score": d7.get("d7_score"),
                        "d7_grade": d7.get("d7_grade"),
                        "alert_level": d7.get("alert_level"),
                        "note": (
                            "D7 is the competitive AI citation benchmark from Module F. "
                            "A low LCS™ score in Module B directly reduces citation readiness, "
                            "which also suppresses the D7 score."
                        ),
                    }
        except Exception:
            pass  # Module F cross-reference is optional

    except Exception as e:
        logger.error(f"Failed to load Module B context: {e}")
        return {"error": f"Failed to load Module B data: {e}"}

    return context


def _build_context_summary(context: Dict[str, Any]) -> str:
    """Converts the context dict into a clean text block for Claude."""
    if context.get("error"):
        return f"ERROR: {context['error']}"

    lines = [
        f"=== Module B Schema & Structured Data Analysis ===",
        f"URL: {context.get('url', 'unknown')}",
        f"Analysis date: {context.get('analysis_date', 'unknown')}",
        f"Schema type requested: {context.get('schema_type_requested', 'auto')} "
        f"| Detected: {context.get('schema_type_detected', 'unknown')}",
        "",
    ]

    # Error case
    if not context.get("success"):
        lines += [
            "=== Analysis Status ===",
            f"Status: FAILED",
            f"Error code: {context.get('error_code')}",
            f"Message: {context.get('error_message')}",
            "",
        ]
        return "\n".join(lines)

    # LCS Score
    lcs = context.get("lcs") or context.get("summary") or {}
    lcs_score = lcs.get("score") or lcs.get("lcs_score")
    lcs_grade = lcs.get("grade") or lcs.get("lcs_grade")
    if lcs_score is not None:
        lines += [
            "=== LCS™ Score (LLM Citation Readiness) ===",
            f"Score: {lcs_score} / 100  |  Grade: {lcs_grade}",
        ]
        param_scores = (context.get("lcs") or {}).get("param_scores") or {}
        if param_scores:
            lines.append("Parameter breakdown:")
            for param, score in param_scores.items():
                lines.append(f"  {param}: {score}")
        aivs_contribution = (context.get("lcs") or {}).get("aivs_contribution")
        if aivs_contribution is not None:
            lines.append(f"AIVS™ schema dimension contribution: {aivs_contribution}")
        citation_lift = (context.get("lcs") or {}).get("citation_lift_estimate")
        if citation_lift:
            lines.append(f"Estimated citation lift: {citation_lift}")
        lines.append("")

    # Summary
    summ = context.get("summary") or {}
    if summ:
        lines += [
            "=== Audit Summary ===",
            f"Page type detected: {summ.get('page_type', 'unknown')}",
            f"Schema blocks found on page: {summ.get('total_schemas_found', 0)}",
            f"Total gaps: {summ.get('total_gaps', 0)}  "
            f"(Critical: {summ.get('critical_gaps', 0)}, Warning: {summ.get('warning_gaps', 0)})",
        ]
        if summ.get("top_priority"):
            lines.append(f"Top priority action: {summ['top_priority']}")
        lines.append("")

    # Schema Inventory
    inventory = context.get("schema_inventory") or []
    if inventory:
        lines.append("=== Schema Inventory (Existing on Page) ===")
        for s in inventory:
            lines.append(
                f"  {s.get('type')} | method={s.get('method')} | "
                f"completeness={s.get('completeness_pct')}% | tier={s.get('tier')}"
            )
        lines.append("")

    # Critical Gaps
    crit = context.get("critical_gaps") or []
    if crit:
        lines.append("=== Critical Schema Gaps ===")
        for i, g in enumerate(crit, 1):
            lines.append(
                f"  {i}. [{g.get('schema_type')}] Missing: {g.get('property')} — {g.get('issue')}"
            )
            if g.get("fix"):
                lines.append(f"     Fix: {g['fix']}")
        lines.append("")

    # Warning Gaps
    warn = context.get("warning_gaps") or []
    if warn:
        lines.append("=== Warning-Level Schema Gaps ===")
        for g in warn:
            lines.append(
                f"  [{g.get('schema_type')}] {g.get('property')}: {g.get('issue')}"
            )
        lines.append("")

    # Fix Patches available
    patches = context.get("fix_patches") or []
    if patches:
        lines.append("=== Available Fix Patches (Auto-Generated JSON-LD) ===")
        for p in patches:
            patch_available = "✓ patch ready" if p.get("has_patch") else "no patch"
            lines.append(
                f"  [{p.get('schema_type')}] {p.get('description')} | "
                f"priority={p.get('priority')} | {patch_available}"
            )
        lines.append("")

    # AIVS Feed
    aivs = context.get("aivs") or {}
    if aivs:
        lines += [
            "=== AIVS™ Schema Dimension ===",
            f"Schema dimension score: {aivs.get('schema_dimension_score')}  "
            f"| Weight: {aivs.get('dimension_weight')}",
            f"AIVS™ contribution: {aivs.get('contribution')}",
        ]
        recs = aivs.get("recommended_types") or []
        if recs:
            lines.append(f"Recommended schema types to add: {', '.join(recs)}")
        lines.append("")

    # Generated schema summary
    gen_type = context.get("generated_schema_type")
    gen_keys = context.get("generated_schema_keys")
    if gen_type:
        lines += [
            "=== Generated Schema ===",
            f"Schema @type: {gen_type}",
        ]
        if gen_keys:
            lines.append(f"Properties included: {', '.join(gen_keys)}")
        lines.append("")

    # Module F cross-reference
    f_ref = context.get("module_f_reference") or {}
    if f_ref:
        lines += [
            "=== Module F Cross-Reference (AI Competitive Context) ===",
            f"D7 competitive score: {f_ref.get('d7_score')} / 100  |  Grade: {f_ref.get('d7_grade')}",
            f"Alert level: {f_ref.get('alert_level')}",
            f"Note: {f_ref.get('note')}",
            "",
        ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ASK AI FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

async def ask_module_b_ai(
    project_id: str,
    question: str,
    job_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Module B Ask AI.

    Args:
        project_id: The project to answer questions about.
        question: The user's natural language question.
        job_id: Optional specific schema job (defaults to latest).
        conversation_history: Optional previous turns for multi-turn chat.
                              Format: [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        {
          "answer": str,
          "question_type": str,    # explain / interpret / recommend / out_of_scope
          "sources": list,
          "data_available": bool,
          "context_snapshot": dict,
        }
    """
    if not question or not question.strip():
        return {"answer": "Please ask a question.", "question_type": "unknown"}

    question = question.strip()

    # Step 0 — Greetings / small talk
    small = _lightweight_chat_reply(question)
    if small is not None:
        return {
            "answer": small,
            "question_type": "chat",
            "sources": [],
            "data_available": True,
        }

    # Step 1 — Classify
    question_type = _classify_question(question)

    if question_type == "out_of_scope":
        return {
            "answer": (
                "I'm focused on helping you understand and improve your Module B "
                "structured data and schema analysis results — things like your LCS™ score, "
                "schema gaps, fix patches, schema inventory, and AIVS™ contribution. "
                "I can't help with content creation or other topics outside this scope. "
                "Try asking: 'Why is my LCS™ score low?' or 'What schema should I add first?'"
            ),
            "question_type": "out_of_scope",
            "sources": [],
            "data_available": False,
        }

    # Step 2 — Load context
    context = _load_context_pack(project_id, job_id)

    if context.get("error"):
        return {
            "answer": context["error"],
            "question_type": question_type,
            "sources": [],
            "data_available": False,
        }

    context_summary = _build_context_summary(context)

    # Step 3 — System prompt
    system_instruction = f"""You are a senior structured data and schema analyst for Module B.
You write like an experienced technical SEO consultant: direct, precise, professional.
No emojis. Avoid cheesy openings ("Hi there!", "Great question!").

The user's message includes a PROJECT DATA block from their latest stored Module B schema
generation and LCS™ (LLM Citation Readiness Score) audit. The data may also include a
Module F cross-reference showing how schema gaps affect the competitive D7 score.

=== PRODUCT GLOSSARY (use when explaining terms) ===
{GLOSSARY}

=== HOW TO RESPOND ===
1) ANSWER ONLY WHAT THEY ASKED. Do not paste a full schema audit or every metric
   unless they explicitly ask for an overview, summary, or "walk me through everything".
2) NARROW QUESTIONS GET NARROW ANSWERS. If they ask about LCS™, focus on LCS™ and
   its drivers. Do not also recite fix patches and AIVS feed unless they support the answer.
3) USE DATA AS EVIDENCE, NOT A DUMP. Cite specific numbers from PROJECT DATA only when
   they support your answer. Omit unrelated metrics entirely.
4) DEFINITIONS: use the glossary; tie in the user's actual numbers when helpful.
5) RECOMMENDATIONS: when they want actions, anchor to Critical gaps first, then Warning.
   Mention specific schema types and properties. Reference fix patches where relevant.
6) TONE: calm, expert, concise. Short paragraphs. Bullets only when comparing items or
   listing requested actions. One tight paragraph is fine when that suffices.
7) NEVER invent facts. If something is missing from PROJECT DATA, say so plainly.
8) FIX PATCHES: When recommending schema changes, remind the user that ready-made
   JSON-LD fix patches are available in the Module B UI to copy-paste into their page.
9) MODULE F CONNECTION: If the user asks about AI visibility or citations and Module F
   data is present in PROJECT DATA, briefly connect how LCS™ improvements would also
   lift the D7 score.
10) OUTPUT FORMAT (Markdown for in-app chat UI): Use **bold** labels, ### short headings,
    numbered lists for ranked priorities, bullet lists for parallel points.
    Put schema types and property names in backticks (e.g. `FAQPage`, `datePublished`).
    Synthesize numbers into sentences; avoid raw key:value dumps.

If the question is vague ("thoughts?", "what do you think?"), ask one clarifying line OR
offer two or three specific angles they could explore — do not dump all sections."""

    # Step 4 — Build messages
    messages: List[Dict[str, str]] = []

    if conversation_history:
        messages.extend(conversation_history[-4:])

    emphasis = {
        "explain": "They may mainly want definitions tied to their schema data.",
        "recommend": "They may mainly want actionable next steps — critical gaps and fix patches first.",
        "interpret": "They may mainly want interpretation of their LCS™ score and schema audit metrics.",
    }.get(question_type, "")

    user_message = f"""PROJECT DATA:
{context_summary}

Routing hint (optional): {emphasis or "none — infer from the question only"}

The user's message to answer (respond to this specifically; no unsolicited full-audit recap):
{question}"""

    messages.append({"role": "user", "content": user_message})

    # Step 5 — Call Claude
    try:
        resp = await execute_task(
            task_name="b_ask_ai",
            input_data={
                "system": system_instruction,
                "messages": messages,
            },
            provider="claude",
            options={
                "model": "claude-sonnet-4-20250514",
                "temperature": 0.25,
                "max_tokens": 1200,
                "skip_cache": True,
            },
        )

        if not resp.success or not resp.data:
            raise ValueError(resp.error or "Empty response from Claude")

        answer = str(resp.data).strip()

    except Exception as e:
        logger.error(f"Module B Ask AI call failed: {e}")
        answer = (
            "I couldn't generate an answer right now. "
            "Please try again in a moment."
        )

    # Step 6 — Sources
    sources: List[str] = []
    lcs = context.get("lcs") or context.get("summary") or {}
    lcs_score = lcs.get("score") or lcs.get("lcs_score")
    if lcs_score is not None:
        sources.append(f"LCS™ score: {lcs_score} (grade {lcs.get('grade') or lcs.get('lcs_grade')})")
    summ = context.get("summary") or {}
    if summ.get("critical_gaps"):
        sources.append(f"Critical gaps: {summ['critical_gaps']}")
    if context.get("fix_patches"):
        sources.append(f"{len(context['fix_patches'])} fix patches available")
    if context.get("schema_inventory"):
        sources.append(f"{len(context['schema_inventory'])} schema blocks on page")
    if context.get("module_f_reference"):
        d7s = context["module_f_reference"].get("d7_score")
        if d7s is not None:
            sources.append(f"Module F D7 score: {d7s}")

    # Step 7 — Log (non-critical)
    try:
        mongo_manager.db.b_ask_ai_log.insert_one({
            "projectId": project_id,
            "jobId": job_id or context.get("job_id"),
            "question": question,
            "question_type": question_type,
            "answer_length": len(answer),
            "asked_at": datetime.utcnow(),
        })
    except Exception:
        pass

    return {
        "answer": answer,
        "question_type": question_type,
        "sources": sources,
        "data_available": True,
        "context_snapshot": {
            "lcs_score": lcs_score,
            "lcs_grade": lcs.get("grade") or lcs.get("lcs_grade"),
            "critical_gaps": summ.get("critical_gaps"),
            "total_schemas_found": summ.get("total_schemas_found"),
            "schema_type": context.get("schema_type_detected"),
            "url": context.get("url"),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTED QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

def get_suggested_questions(project_id: str) -> List[str]:
    """
    Returns data-driven suggested questions from the latest Module B schema run,
    with a generic fallback so chips are always useful.
    """
    fallback = [
        "Summarize my schema audit and LCS™ score in plain language.",
        "Which schema gaps are hurting my citation readiness the most?",
        "What structured data should I add first?",
        "How does my LCS™ score affect AI visibility?",
    ]

    try:
        mongo_manager.connect()

        doc = mongo_manager.schemas.find_one(
            {"projectId": project_id},
            sort=[("createdAt", -1)],
        )
        if not doc or not doc.get("success"):
            return fallback

        dynamic: List[str] = []

        # LCS score chip
        lcs_report = doc.get("lcs_score_report") or doc.get("summary") or {}
        lcs_score = lcs_report.get("lcs_score")
        lcs_grade = lcs_report.get("lcs_grade") or lcs_report.get("grade")
        if lcs_score is not None:
            dynamic.append(
                f"My LCS™ score is {lcs_score} (grade {lcs_grade or '?'}). What does that mean and how do I improve it?"
            )

        # Critical gaps chip
        gap_report = doc.get("gap_report") or []
        if isinstance(gap_report, list):
            critical = [g for g in gap_report if g.get("severity") == "critical"]
            if critical:
                schema_types = list({g.get("schema_type") for g in critical if g.get("schema_type")})
                dynamic.append(
                    f"I have {len(critical)} critical schema gaps "
                    f"({'in ' + ', '.join(schema_types[:2]) if schema_types else ''}) — which should I fix first?"
                )

        # Fix patches chip
        fix_patches = doc.get("fix_patches") or []
        if isinstance(fix_patches, list) and fix_patches:
            dynamic.append(
                f"I have {len(fix_patches)} auto-generated fix patches — how do I apply them?"
            )

        # Schema inventory chip — missing Tier 1 types
        inventory = doc.get("schema_inventory") or []
        aivs_feed = doc.get("aivs_feed") or {}
        recommended = aivs_feed.get("recommended_schema_types") or []
        if recommended:
            dynamic.append(
                f"The analysis recommends adding {', '.join(recommended[:2])} schema — why and how?"
            )

        # Low completeness chip
        if isinstance(inventory, list):
            incomplete = [
                s for s in inventory
                if s.get("completeness_pct") is not None and s.get("completeness_pct") < 50
            ]
            if incomplete:
                t = incomplete[0].get("type") or "a schema type"
                pct = incomplete[0].get("completeness_pct")
                dynamic.append(
                    f"My `{t}` schema is only {pct}% complete — what properties am I missing?"
                )

        # Module F cross-reference chip
        try:
            mf = mongo_manager.db.module_f.find_one(
                {"projectId": project_id},
                sort=[("createdAt", -1)],
                projection={"d7_aivs_output": 1, "_id": 0},
            )
            if mf:
                d7 = mf.get("d7_aivs_output") or {}
                d7_score = d7.get("d7_score")
                if d7_score is not None and lcs_score is not None and lcs_score < 60:
                    dynamic.append(
                        f"My D7 competitive score is {d7_score} and my LCS™ is {lcs_score} — "
                        "how do schema improvements help my AI citation rankings?"
                    )
        except Exception:
            pass

        # De-dupe and merge with fallback
        seen: set = set()
        ordered: List[str] = []
        for q in dynamic + fallback:
            k = q.strip().lower()
            if k and k not in seen:
                seen.add(k)
                ordered.append(q.strip())
        return ordered[:12]

    except Exception:
        return fallback