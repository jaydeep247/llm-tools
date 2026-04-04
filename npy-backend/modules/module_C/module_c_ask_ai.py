# module_c_ask_ai.py
#
# Module C — Ask AI
#
# A project-scoped assistant that answers any question about Module C data.
#
# Flow:
#   1. Load latest Module C result from MongoDB (module_c collection) into
#      one context pack — same snapshot for every question in a session.
#   2. Context covers: AEO / LLM-friendliness score (C1), entity coverage (C3),
#      answer completeness (C4), missing info gaps (C6), LLM simulation (C7),
#      multi-model comparison (C9), and page actions / recommendations (C8).
#   3. Claude gets a glossary + full project data + optional routing hint.
#
# The model must not invent numbers — facts come only from the context pack.
# If data is missing it says so plainly.

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager

logger = logging.getLogger("module_c_ask_ai")

# ─────────────────────────────────────────────────────────────────────────────
# PLAN LIMITS — max questions per day per plan tier
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
=== Module C / AEO Analysis Glossary ===

LLM Friendliness Score (0–100): Master score measuring how well a page is
optimised for AI language models (AEO — Answer Engine Optimisation).
  - Crawl Access      (20%): Can AI bots access and index the page?
  - Schema Markup     (20%): Structured data (JSON-LD, etc.) quality and coverage.
  - Content Quality   (25%): Entity density, factual depth, E-E-A-T signals.
  - Technical Hygiene (15%): Canonical, meta, Open Graph, status codes.
  - Page Structure    (20%): Heading hierarchy, Q&A patterns, lists, tables.

LLM Friendliness Tiers:
  80–100  Excellent  — well-optimised for AI citation
  60–79   Good       — solid foundation, some gaps
  40–59   Moderate   — improvement opportunities exist
  20–39   Weak       — significant structural issues
  0–19    Critical   — major barriers to AI visibility

Page Type: The category Module C assigns to a page (homepage, blog, product,
  service, faq, about, contact, other). Actions and scoring thresholds
  are calibrated per page type.

Page Topic: The inferred subject matter of the page (e.g., "AI SEO tools",
  "enterprise pricing", "technical documentation").

Entity Coverage Score (C3, 0–100%): % of expected industry entities that
  appear on the page. High coverage = AI models find authoritative answers.

Answer Completeness Score (C4, 0–100): % of user questions about this page
  topic that the page content fully answers.
  - Fully answered: question + supporting evidence found.
  - Partially answered: question detected, evidence incomplete.
  - Not answered: question entirely missing from page content.

Missing Info Gap (C6): Facts or entities that should appear on the page
  (based on industry expectations) but are absent. Each gap is classified
  as critical / important / supporting.

LLM Simulation (C7): Module C runs the page content through AI models and
  measures how accurately and completely AI reproduces the brand's claims.
  - Accuracy:     % of extracted claims confirmed by AI (not contradicted).
  - Completeness: % of key facts included in AI-generated answers.
  - Consistency:  % agreement across multiple AI model runs.

Multi-Model (C9): Cross-model comparison across GPT-4, Claude, Gemini etc.
  Identifies which models cite the page most reliably.

Page Actions (C8): Prioritised improvement tasks generated from C1/C3/C4/C6.
  - High priority:   Blocking issues — fix immediately.
  - Medium priority: Improvement opportunities — tackle next sprint.
  - Low priority:    Polish and optimisation — backlog.
  Predicted delta: estimated LLM Friendliness Score gain after completing all actions.

Readability: Flesch-Kincaid Ease and Fog Index — lower complexity = better
  AI comprehension of the page.

E-E-A-T: Experience, Expertise, Authoritativeness, Trustworthiness signals
  detected in page content (author bios, citations, dates, credentials).
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
        "llm friendliness", "aeo", "answer engine", "entity coverage",
        "completeness score", "missing info", "c1", "c3", "c4", "c6", "c7",
        "c8", "c9", "page actions", "e-e-a-t", "eeat", "readability",
        "schema", "structured data", "crawl access",
    ]
    if any(p in q for p in explain_patterns):
        return "explain"

    recommend_patterns = [
        "what should", "how to improve", "how can i", "what can i do",
        "recommend", "suggestions", "next step", "action", "fix", "improve",
        "increase", "boost", "better", "priority", "top 3", "first thing",
        "what do i do", "help me", "strategy", "plan",
    ]
    if any(p in q for p in recommend_patterns):
        return "recommend"

    return "interpret"


def _lightweight_chat_reply(question: str) -> Optional[str]:
    """Pure greetings / thanks — respond without LLM or DB dump."""
    q2 = question.strip().lower()
    q2 = re.sub(r"[!?.，。！？\s]+$", "", q2).strip()

    if len(q2) <= 14 and re.fullmatch(r"h+i+", q2):
        return (
            "Hello. Ask a specific question about your Module C analysis — for example "
            "your LLM Friendliness Score, entity coverage gaps, answer completeness, "
            "missing info, or your page improvement actions."
        )

    if re.match(r"^(hi|hey|hello|yo|sup|hiya|heya)\s*$", q2) or q2 in ("hi", "hey", "hello", "yo", "sup"):
        return (
            "Hello. I answer focused questions using your latest Module C AEO results. "
            "What do you want to know — scores, entity gaps, missing content, or recommended actions?"
        )

    if re.match(r"^(hi|hey|hello)\s+there\s*$", q2):
        return (
            "Hello. Pose a concrete question (for example: why is my LLM score low, "
            "what entities am I missing, or what should I fix first) and I will respond "
            "from your stored analysis."
        )

    if re.match(r"^good\s+(morning|afternoon|evening)\b", q2) and len(q2) < 40:
        return (
            "Hello. How can I help with your Module C analysis — pick a topic "
            "(AEO score, entity coverage, content gaps, or actions) and ask directly."
        )

    if re.match(r"^(thanks|thank you|thx|ty|cheers)\b", q2) and len(q2) < 48:
        return "You are welcome. Ask another question whenever you need clarity on your Module C data."

    if q2 in ("ok", "okay", "k", "kk", "got it", "cool", "nice", "alright"):
        return "Understood. What should we look at next in your AEO analysis?"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT LOADER
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_c4_gaps(gaps: Any, limit: int = 5) -> List[str]:
    """
    C4 `gaps` may be a list (legacy) or a dict mapping question/topic -> detail.
    Slicing a dict raises TypeError; normalize to a short list of strings.
    """
    if gaps is None:
        return []
    if isinstance(gaps, list):
        return [str(x) for x in gaps[:limit]]
    if isinstance(gaps, dict):
        out: List[str] = []
        for k, v in list(gaps.items())[:limit]:
            if v is not None and str(v).strip():
                out.append(f"{k}: {v}")
            else:
                out.append(str(k))
        return out
    return [str(gaps)][:1]


def _load_context_pack(
    project_id: str,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Loads the latest Module C document from MongoDB and extracts a
    structured context pack for Claude to reason over.
    """
    context: Dict[str, Any] = {}

    try:
        mongo_manager.connect()
        query: Dict[str, Any] = {"jobId": job_id} if job_id else {"jobId": project_id}
        doc = mongo_manager.module_c.find_one(
            query,
            sort=[("timestamp", -1)],
        )
    except Exception as e:
        logger.error(f"Failed to load Module C doc: {e}")
        doc = None

    if not doc:
        return {"error": "No Module C analysis found for this project. Run an AEO analysis first."}

    context["job_id"] = doc.get("jobId")
    context["url"] = doc.get("url", "")
    context["domain"] = doc.get("domain", "")
    context["industry"] = doc.get("industry", "")
    context["overall_score"] = doc.get("overall_score")
    context["analysis_date"] = str(doc.get("timestamp", ""))

    modules: Dict[str, Any] = doc.get("modules") or {}

    # ── C1 — AEO Checker / LLM Friendliness ──────────────────────────────
    c1 = modules.get("aeo_checker") or {}
    if c1:
        sub_scores = c1.get("sub_scores") or {}
        context["aeo"] = {
            "llm_friendliness_score": c1.get("llm_friendliness_score"),
            "page_type": c1.get("page_type"),
            "page_topic": c1.get("page_topic"),
            "word_count": c1.get("word_count"),
            "sub_scores": {
                "crawl_access": (sub_scores.get("crawl_access") or {}).get("total"),
                "schema": (sub_scores.get("schema") or {}).get("total"),
                "content": (sub_scores.get("content") or {}).get("total"),
                "tech_hygiene": (sub_scores.get("tech_hygiene") or {}).get("total"),
                "structure": (sub_scores.get("structure") or {}).get("total"),
            },
            "structured_data": c1.get("structured_data") or {},
            "readability": c1.get("readability") or {},
        }

    # ── C3 — Entity Coverage ──────────────────────────────────────────────
    c3 = modules.get("entity_coverage") or {}
    if c3:
        context["entity_coverage"] = {
            "site_coverage_pct": c3.get("site_coverage_pct"),
            "total_pages": c3.get("total_pages"),
            "by_page_type": c3.get("by_page_type") or {},
            "missing_entities": (c3.get("missing_entities") or [])[:8],
        }

    # ── C4 — Answer Completeness ──────────────────────────────────────────
    c4 = modules.get("answer_completeness") or {}
    if c4:
        context["answer_completeness"] = {
            "completeness_score": c4.get("completeness_score"),
            "pct_fully_answered": c4.get("pct_fully_answered"),
            "questions_generated": c4.get("questions_generated"),
            "fully_answered": c4.get("fully_answered"),
            "partially_answered": c4.get("partially_answered"),
            "not_answered": c4.get("not_answered"),
            "missing_questions": (c4.get("missing_questions") or [])[:5],
            "partial_questions": (c4.get("partial_questions") or [])[:3],
            "gaps": _normalize_c4_gaps(c4.get("gaps"), limit=5),
        }

    # ── C6 — Missing Info ─────────────────────────────────────────────────
    c6 = modules.get("missing_info") or {}
    if c6:
        context["missing_info"] = {
            "missing_entity_count": c6.get("missing_entity_count"),
            "missing_fact_count": c6.get("missing_fact_count"),
            "total_missing": c6.get("total_missing"),
            "classification": c6.get("classification"),
            "gap": c6.get("gap"),
            "missing_facts": (c6.get("missing_facts") or [])[:6],
        }

    # ── C7 — LLM Simulation ───────────────────────────────────────────────
    c7 = modules.get("llm_simulator") or {}
    if c7:
        accuracy = c7.get("accuracy") or {}
        completeness = c7.get("completeness") or {}
        consistency = c7.get("consistency") or {}
        context["llm_simulation"] = {
            "accuracy_overall": accuracy.get("overall"),
            "completeness_overall": completeness.get("overall"),
            "consistency_score": consistency.get("consistency_score"),
            "citation_variance": consistency.get("citation_variance"),
            "prompts_used": (c7.get("prompts_used") or [])[:3],
        }

    # ── C9 — Multi-model ─────────────────────────────────────────────────
    c9 = modules.get("multi_model") or {}
    if c9:
        context["multi_model"] = {
            "models_tested": list((c9.get("per_model_scores") or {}).keys()),
            "per_model_scores": c9.get("per_model_scores") or {},
            "best_model": c9.get("best_model"),
            "weakest_model": c9.get("weakest_model"),
        }

    # ── C8 — Page Actions (recommendations) ──────────────────────────────
    c8 = modules.get("page_actions") or {}
    if c8:
        actions = c8.get("actions") or []
        # Sort: High first, then Medium, then Low
        priority_order = {"High": 0, "Medium": 1, "Low": 2}
        actions_sorted = sorted(actions, key=lambda a: priority_order.get(a.get("priority", "Low"), 2))
        context["page_actions"] = {
            "total_actions": c8.get("total_actions"),
            "high_priority": c8.get("high_priority"),
            "medium_priority": c8.get("medium_priority"),
            "low_priority": c8.get("low_priority"),
            "current_llm_friendliness": c8.get("current_llm_friendliness"),
            "predicted_llm_friendliness": c8.get("predicted_llm_friendliness"),
            "predicted_delta": c8.get("predicted_llm_friendliness_delta"),
            "actions": actions_sorted[:12],
        }

    # ── C5 content signals (word count already in c1, skip full dump) ─────
    c5 = modules.get("content_signals") or {}
    if c5:
        context["content_signals"] = {
            "word_count": c5.get("word_count"),
            "entity_count": c5.get("entity_count"),
        }

    return context


def _build_context_summary(context: Dict[str, Any]) -> str:
    """Converts context dict into a clean text block for Claude."""
    if context.get("error"):
        return f"ERROR: {context['error']}"

    lines = [
        f"=== Module C AEO Analysis for {context.get('url', 'unknown')} ===",
        f"Domain: {context.get('domain', 'unknown')}  |  Industry: {context.get('industry', 'unknown')}",
        f"Analysis date: {context.get('analysis_date', 'unknown')}",
        f"Overall score: {context.get('overall_score')} / 100",
        "",
    ]

    # AEO / LLM Friendliness
    aeo = context.get("aeo") or {}
    if aeo:
        sub = aeo.get("sub_scores") or {}
        rd = aeo.get("readability") or {}
        sd = aeo.get("structured_data") or {}
        lines += [
            "=== LLM Friendliness Score (C1) ===",
            f"Score: {aeo.get('llm_friendliness_score')} / 100",
            f"Page type: {aeo.get('page_type')}  |  Page topic: {aeo.get('page_topic')}",
            f"Word count: {aeo.get('word_count')}",
            "Sub-scores:",
            f"  Crawl Access:      {sub.get('crawl_access')} / 100",
            f"  Schema Markup:     {sub.get('schema')} / 100",
            f"  Content Quality:   {sub.get('content')} / 100",
            f"  Tech Hygiene:      {sub.get('tech_hygiene')} / 100",
            f"  Page Structure:    {sub.get('structure')} / 100",
        ]
        if rd:
            lines.append(
                f"Readability: FK Ease={rd.get('fk_ease')}  Fog={rd.get('fog_index')}  Avg sentence={rd.get('avg_sentence_length')} words"
            )
        if sd:
            lines += [
                f"Structured data: type coverage={sd.get('type_coverage_pct')}%  "
                f"completeness={sd.get('completeness_score')}  "
                f"errors={sd.get('error_count')}",
                f"  Missing schema types: {', '.join(sd.get('missing_types') or []) or 'none'}",
            ]
        lines.append("")

    # Entity Coverage
    ec = context.get("entity_coverage") or {}
    if ec:
        lines += [
            "=== Entity Coverage (C3) ===",
            f"Site entity coverage: {ec.get('site_coverage_pct')}%  |  Pages audited: {ec.get('total_pages')}",
        ]
        bpt = ec.get("by_page_type") or {}
        if bpt:
            for ptype, score in list(bpt.items())[:4]:
                lines.append(f"  {ptype}: {score}%")
        missing = ec.get("missing_entities") or []
        if missing:
            lines.append(f"Missing entities (top {len(missing)}): {', '.join(str(e) for e in missing)}")
        lines.append("")

    # Answer Completeness
    ac = context.get("answer_completeness") or {}
    if ac:
        lines += [
            "=== Answer Completeness (C4) ===",
            f"Completeness score: {ac.get('completeness_score')} / 100",
            f"Questions generated: {ac.get('questions_generated')}  |  "
            f"Fully answered: {ac.get('fully_answered')}  |  "
            f"Partial: {ac.get('partially_answered')}  |  "
            f"Not answered: {ac.get('not_answered')}",
            f"% fully answered: {ac.get('pct_fully_answered')}%",
        ]
        mq = ac.get("missing_questions") or []
        if mq:
            lines.append(f"Top unanswered questions: {'; '.join(str(q) for q in mq[:3])}")
        lines.append("")

    # Missing Info
    mi = context.get("missing_info") or {}
    if mi:
        lines += [
            "=== Missing Information (C6) ===",
            f"Total missing items: {mi.get('total_missing')}  "
            f"(entities: {mi.get('missing_entity_count')}, facts: {mi.get('missing_fact_count')})",
            f"Gap classification: {mi.get('classification')}  |  Gap level: {mi.get('gap')}",
        ]
        mf = mi.get("missing_facts") or []
        if mf:
            lines.append(f"Missing facts (top {len(mf)}): {'; '.join(str(f) for f in mf)}")
        lines.append("")

    # LLM Simulation
    sim = context.get("llm_simulation") or {}
    if sim:
        lines += [
            "=== LLM Simulation (C7) ===",
            f"Accuracy: {sim.get('accuracy_overall')}%  |  "
            f"Completeness: {sim.get('completeness_overall')}%  |  "
            f"Consistency: {sim.get('consistency_score')}%",
            f"Citation variance: {sim.get('citation_variance')}",
        ]
        prompts = sim.get("prompts_used") or []
        if prompts:
            lines.append(f"Prompts tested: {'; '.join(str(p) for p in prompts)}")
        lines.append("")

    # Multi-model
    mm = context.get("multi_model") or {}
    if mm:
        lines += ["=== Multi-Model Comparison (C9) ==="]
        per = mm.get("per_model_scores") or {}
        for model, score in per.items():
            lines.append(f"  {model}: {score}")
        if mm.get("best_model"):
            lines.append(f"Best model: {mm['best_model']}  |  Weakest: {mm.get('weakest_model')}")
        lines.append("")

    # Page Actions
    pa = context.get("page_actions") or {}
    if pa:
        lines += [
            "=== Page Improvement Actions (C8) ===",
            f"Total actions: {pa.get('total_actions')}  "
            f"(High: {pa.get('high_priority')}, Medium: {pa.get('medium_priority')}, Low: {pa.get('low_priority')})",
            f"Current LLM Friendliness: {pa.get('current_llm_friendliness')}  →  "
            f"Predicted after fixes: {pa.get('predicted_llm_friendliness')} "
            f"(+{pa.get('predicted_delta')} points)",
            "",
        ]
        actions = pa.get("actions") or []
        for i, a in enumerate(actions, 1):
            title = a.get("title") or a.get("action") or a.get("type") or f"Action {i}"
            desc = a.get("description") or a.get("detail") or ""
            priority = a.get("priority", "")
            lines.append(f"  {i}. [{priority}] {title}: {str(desc)[:200]}")
        lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ASK AI FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

async def ask_module_c_ai(
    project_id: str,
    question: str,
    job_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Module C Ask AI.

    Args:
        project_id: The project to answer questions about.
        question: The user's natural language question.
        job_id: Optional specific run to query (defaults to latest).
        conversation_history: Optional previous turns for multi-turn chat.
                              Format: [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        {
          "answer": str,
          "question_type": str,    # explain / interpret / recommend / out_of_scope
          "sources": list,
          "data_available": bool,
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
                "I'm focused on helping you understand and improve your Module C "
                "AEO analysis results — things like your LLM Friendliness Score, "
                "entity coverage, answer completeness, missing content gaps, and "
                "page improvement actions. I can't help with content creation or "
                "other topics outside this scope. "
                "Try asking: 'Why is my score low?' or 'What should I fix first?'"
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
    system_instruction = f"""You are a senior AEO (Answer Engine Optimisation) analyst for Module C.
You write like an experienced consultant: direct, precise, professional.
No emojis. Avoid cheesy openings ("Hi there!", "Great question!").

The user's message includes a PROJECT DATA block from their latest stored Module C analysis.

=== PRODUCT GLOSSARY (use when explaining terms) ===
{GLOSSARY}

=== HOW TO RESPOND ===
1) ANSWER ONLY WHAT THEY ASKED. Do not paste a full executive summary or every sub-score
   unless they explicitly ask for an overview, summary, or "walk me through everything".
2) NARROW QUESTIONS GET NARROW ANSWERS. If they ask about entity coverage (C3), focus on that.
   Do not also recite LLM simulation and page actions unless they directly explain C3.
3) USE DATA AS EVIDENCE, NOT A DUMP. Cite specific numbers from PROJECT DATA only when they
   support your answer. Omit unrelated metrics entirely.
4) DEFINITIONS: use the glossary; tie in the user's actual numbers briefly when helpful.
5) RECOMMENDATIONS: when they want actions, anchor to the C8 Page Actions list (High priority
   first). Do not invent generic SEO tactics not present in PROJECT DATA.
6) TONE: calm, expert, concise. Short paragraphs. Bullets only when comparing items or listing
   requested actions. One tight paragraph is fine when that suffices.
7) NEVER invent facts. If something is missing from PROJECT DATA, say so plainly.
8) OUTPUT FORMAT (Markdown for in-app chat UI): Use **bold** labels, ### short headings,
   numbered lists for ranked priorities, bullet lists for parallel points.
   Put metric names in backticks (e.g. `LLM Friendliness Score`, `completeness_score`).
   Synthesize numbers into sentences; avoid raw key:value dumps.

If the question is vague ("thoughts?", "what do you think?"), ask one clarifying line OR offer
two or three specific angles they could explore — do not dump all sections."""

    # Step 4 — Build messages
    messages: List[Dict[str, str]] = []

    if conversation_history:
        messages.extend(conversation_history[-4:])

    emphasis = {
        "explain": "They may mainly want definitions tied to their numbers.",
        "recommend": "They may mainly want actionable next steps from C8 Page Actions.",
        "interpret": "They may mainly want interpretation of their AEO metrics.",
    }.get(question_type, "")

    user_message = f"""PROJECT DATA:
{context_summary}

Routing hint (optional): {emphasis or "none — infer from the question only"}

The user's message to answer (respond to this specifically; no unsolicited full-dashboard recap):
{question}"""

    messages.append({"role": "user", "content": user_message})

    # Step 5 — Call Claude
    try:
        resp = await execute_task(
            task_name="module_c_ask_ai",
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
        logger.error(f"Module C Ask AI call failed: {e}")
        answer = (
            "I couldn't generate an answer right now. "
            "Please try again in a moment."
        )

    # Step 6 — Sources
    sources: List[str] = []
    aeo = context.get("aeo") or {}
    if aeo.get("llm_friendliness_score") is not None:
        sources.append(f"LLM Friendliness Score: {aeo['llm_friendliness_score']}")
    ec = context.get("entity_coverage") or {}
    if ec.get("site_coverage_pct") is not None:
        sources.append(f"Entity coverage: {ec['site_coverage_pct']}%")
    ac = context.get("answer_completeness") or {}
    if ac.get("completeness_score") is not None:
        sources.append(f"Answer completeness: {ac['completeness_score']}")
    pa = context.get("page_actions") or {}
    if pa.get("total_actions"):
        sources.append(f"{pa['total_actions']} page actions (High: {pa.get('high_priority')})")

    # Step 7 — Log (non-critical)
    try:
        mongo_manager.db.module_c_ask_ai_log.insert_one({
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
            "llm_friendliness_score": aeo.get("llm_friendliness_score"),
            "overall_score": context.get("overall_score"),
            "page_type": aeo.get("page_type"),
            "high_priority_actions": pa.get("high_priority"),
            "predicted_score_after_fixes": pa.get("predicted_llm_friendliness"),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTED QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

def get_suggested_questions(project_id: str) -> List[str]:
    """
    Returns data-driven suggested questions from the latest Module C run,
    with a generic fallback so chips are always useful.
    """
    fallback = [
        "Summarize my AEO analysis results in plain language.",
        "What is my LLM Friendliness Score and what's pulling it down?",
        "Which page actions should I tackle first?",
        "What entities am I missing that I should add?",
    ]

    try:
        mongo_manager.connect()
        doc = mongo_manager.module_c.find_one(
            {"jobId": project_id},
            sort=[("timestamp", -1)],
            projection={
                "overall_score": 1,
                "modules.aeo_checker": 1,
                "modules.entity_coverage": 1,
                "modules.answer_completeness": 1,
                "modules.missing_info": 1,
                "modules.page_actions": 1,
            },
        )
        if not doc:
            return fallback

        dynamic: List[str] = []
        modules = doc.get("modules") or {}

        # AEO score chip
        c1 = modules.get("aeo_checker") or {}
        score = c1.get("llm_friendliness_score")
        page_type = c1.get("page_type", "page")
        if score is not None:
            dynamic.append(
                f"My LLM Friendliness Score is {score} for my {page_type}. What does that mean?"
            )
        if score is not None and score < 50:
            dynamic.append("My score is below 50 — what are the top structural issues I need to fix?")

        # Sub-score lowest
        sub = (c1.get("sub_scores") or {})
        if sub:
            lowest_key = min(sub, key=lambda k: (sub[k] or {}).get("total", 100))
            lowest_val = (sub[lowest_key] or {}).get("total")
            if lowest_val is not None and lowest_val < 60:
                label = lowest_key.replace("_", " ").title()
                dynamic.append(f"My {label} sub-score is {lowest_val} — why and how do I fix it?")

        # Entity coverage chip
        c3 = modules.get("entity_coverage") or {}
        cov = c3.get("site_coverage_pct")
        if cov is not None and cov < 70:
            dynamic.append(f"My entity coverage is {cov}% — which entities am I missing?")

        # Answer completeness
        c4 = modules.get("answer_completeness") or {}
        not_answered = c4.get("not_answered", 0)
        if not_answered:
            dynamic.append(
                f"I have {not_answered} unanswered questions on this page — what should I add?"
            )

        # Missing info
        c6 = modules.get("missing_info") or {}
        total_missing = c6.get("total_missing", 0)
        if total_missing:
            dynamic.append(
                f"There are {total_missing} missing information items — what are the most critical?"
            )

        # Top page action
        c8 = modules.get("page_actions") or {}
        actions = c8.get("actions") or []
        high_actions = [a for a in actions if a.get("priority") == "High"]
        if high_actions:
            t0 = str(high_actions[0].get("title") or high_actions[0].get("action") or "").strip()
            if t0:
                dynamic.append(f'My top High-priority action is "{t0}" — explain why and how to do it.')

        predicted = c8.get("predicted_llm_friendliness")
        current = c8.get("current_llm_friendliness")
        if predicted and current and predicted > current:
            dynamic.append(
                f"If I complete all actions my score goes from {current} to {predicted} — what gives the biggest gain?"
            )

        # De-dupe and merge
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