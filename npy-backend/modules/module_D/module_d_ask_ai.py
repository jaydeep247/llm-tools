# module_d_ask_ai.py
#
# Module D — Ask AI
#
# A project-scoped assistant that answers any question about Module D data.
#
# Flow:
#   1. Load latest Module D results from MongoDB into one context pack
#      (same snapshot for every question in a session).
#   2. Context includes: prompt tracking metrics, content metrics, entity
#      analysis, IEU-ranked recommendations, performance snapshots, and
#      Module E brand info where available.
#   3. Claude gets a glossary + full project data + optional routing hint.
#
# The model must not invent numbers — facts come from the context pack.
# If data is missing it says so.

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager

logger = logging.getLogger("module_d_ask_ai")

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
# PRODUCT GLOSSARY — static definitions Claude uses for EXPLAIN questions
# ─────────────────────────────────────────────────────────────────────────────

GLOSSARY = """
=== Module D / Prompt Tracking Glossary ===

Prompt Visibility Score (PVS, 0–100): Composite score measuring how well a
brand appears in AI responses for a tracked prompt.
  - Citation Rate (40%): % of AI responses that cite the brand for this prompt.
  - Share of Voice (25%): brand mentions vs all brand+competitor mentions.
  - Position Rank Score (20%): how prominently the brand appears (1st mention = highest).
  - Consistency Score (15%): how reliably the brand appears across repeated runs.

PVS Tiers:
  80–100  Dominant    — brand is the primary answer
  60–79   Strong      — brand appears consistently
  40–59   Moderate    — brand appears but competitors often rank higher
  20–39   Weak        — brand rarely cited; competitors dominating
  0–19    Critical    — brand almost invisible for this prompt

Prompt Difficulty Score (0–100): How hard it is to rank for this prompt.
  Low (0–35)   = achievable with focused content effort
  Medium (36–65) = competitive; requires sustained content strategy
  High (66–100)  = dominated by major brands; long-term play

Intent Clusters (5 buckets used in prompt expansion):
  Informational  — "what is / how does / why does"
  Navigational   — brand or product lookup
  Transactional  — buy / pricing / sign up
  Comparison     — "X vs Y" or "best options"
  Local          — geo-specific queries

IEU Priority Score: How each recommendation is ranked.
  Priority = (Impact × 0.5) + ((11 - Effort) × 0.3) + (Urgency × 0.2)
  Higher = more impact for less effort, more time-sensitive.

Citation Rate: % of AI model responses (across all sampled runs) in which the
brand URL or brand name appears as a cited source for that prompt.

Share of Voice (SOV) for a prompt: brand citations ÷ (brand + all competitor
citations) × 100 for that specific prompt.

Content Gap: A tracked prompt where one or more competitors appear in AI
responses but the brand does not — or appears significantly lower.

Delta (PVS Delta): Change in PVS since the previous tracking run.
  Positive = improving visibility. Negative = declining.

RAR / SLAR / RDR (Recommendation feedback types):
  RAR  — Recommendation Accepted and Resolved
  SLAR — Started Later (accepted but not yet completed)
  RDR  — Recommendation Declined / Rejected
"""

# ─────────────────────────────────────────────────────────────────────────────
# QUESTION CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

def _classify_question(question: str) -> str:
    """
    Classify into: explain / interpret / recommend / out_of_scope
    """
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
        "pvs", "prompt visibility", "citation rate", "share of voice",
        "difficulty score", "ieu", "intent cluster", "delta", "rar", "slar",
        "content gap", "position rank",
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
    """
    Pure greetings / thanks — respond without LLM or DB dump.
    """
    q2 = question.strip().lower()
    q2 = re.sub(r"[!?.，。！？\s]+$", "", q2).strip()

    if len(q2) <= 14 and re.fullmatch(r"h+i+", q2):
        return (
            "Hello. Ask a specific question about your Module D analysis — for example "
            "your top prompt visibility scores, which prompts have content gaps, "
            "your IEU-ranked recommendations, or how your citation rates compare to competitors."
        )

    if re.match(r"^(hi|hey|hello|yo|sup|hiya|heya)\s*$", q2) or q2 in ("hi", "hey", "hello", "yo", "sup"):
        return (
            "Hello. I answer focused questions using your latest Module D prompt-tracking data. "
            "What do you want to know — PVS scores, content gaps, recommendations, or trends?"
        )

    if re.match(r"^(hi|hey|hello)\s+there\s*$", q2):
        return (
            "Hello. Pose a concrete question (for example: which prompts have the lowest PVS, "
            "why is my citation rate dropping, or what should I work on first) and I will "
            "respond from your stored results."
        )

    if re.match(r"^good\s+(morning|afternoon|evening)\b", q2) and len(q2) < 40:
        return (
            "Hello. How can I help with your Module D prompt tracking — pick a topic "
            "(PVS, citation rates, content gaps, or priorities) and ask directly."
        )

    if re.match(r"^(thanks|thank you|thx|ty|cheers)\b", q2) and len(q2) < 48:
        return "You are welcome. Ask another question whenever you need clarity on your Module D data."

    if q2 in ("ok", "okay", "k", "kk", "got it", "cool", "nice", "alright"):
        return "Understood. What should we look at next in your prompt analysis?"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT LOADER — Fetches relevant Module D + E data from MongoDB
# ─────────────────────────────────────────────────────────────────────────────

def _load_context_pack(
    project_id: str,
    job_id: Optional[str] = None,
    question_type: str = "interpret",
) -> Dict[str, Any]:
    """
    Builds a context pack from MongoDB for the given project.

    Loads prompt tracking metrics, content metrics, entity analysis,
    IEU recommendations, and Module E brand data.

    Returns a dict with structured data + a human-readable summary string.
    """
    context: Dict[str, Any] = {}

    try:
        mongo_manager.connect()
        query: Dict[str, Any] = {"jobId": project_id} if not job_id else {"jobId": job_id}

        # Module D main document (content_metrics collection stores the merged run output)
        module_d_doc = mongo_manager.content_metrics.find_one(
            {"jobId": project_id} if not job_id else {"jobId": job_id},
            sort=[("updatedAt", -1)],
        )
    except Exception as e:
        logger.error(f"Failed to load Module D doc: {e}")
        module_d_doc = None

    if not module_d_doc:
        return {"error": "No Module D analysis found for this project. Run a full analysis first."}

    effective_job_id = module_d_doc.get("jobId", project_id)
    context["job_id"] = effective_job_id
    context["url"] = module_d_doc.get("url", "")
    context["analysis_date"] = str(module_d_doc.get("updatedAt", ""))

    # ── Prompt tracking metrics ────────────────────────────────────────────
    try:
        tracking_doc = mongo_manager.db.prompt_tracking.find_one(
            {"jobId": effective_job_id},
            projection={
                "tracked_prompts": 1,
                "overall_pvs": 1,
                "avg_citation_rate": 1,
                "avg_share_of_voice": 1,
                "total_prompts": 1,
                "prompts_improved": 1,
                "prompts_declined": 1,
                "_id": 0,
            },
        )
    except Exception:
        tracking_doc = None

    if tracking_doc:
        context["tracking_summary"] = {
            "overall_pvs": tracking_doc.get("overall_pvs"),
            "avg_citation_rate": tracking_doc.get("avg_citation_rate"),
            "avg_share_of_voice": tracking_doc.get("avg_share_of_voice"),
            "total_prompts": tracking_doc.get("total_prompts"),
            "prompts_improved": tracking_doc.get("prompts_improved"),
            "prompts_declined": tracking_doc.get("prompts_declined"),
        }

        # Top and bottom prompts by PVS
        tracked = tracking_doc.get("tracked_prompts") or []
        if tracked:
            sorted_by_pvs = sorted(
                [p for p in tracked if isinstance(p, dict) and p.get("pvs") is not None],
                key=lambda x: float(x.get("pvs", 0)),
                reverse=True,
            )
            context["top_prompts"] = [
                {
                    "prompt": p.get("prompt_text", "")[:100],
                    "pvs": p.get("pvs"),
                    "citation_rate": p.get("citation_rate"),
                    "delta": p.get("pvs_delta"),
                }
                for p in sorted_by_pvs[:5]
            ]
            context["bottom_prompts"] = [
                {
                    "prompt": p.get("prompt_text", "")[:100],
                    "pvs": p.get("pvs"),
                    "citation_rate": p.get("citation_rate"),
                    "delta": p.get("pvs_delta"),
                }
                for p in sorted_by_pvs[-5:]
                if p.get("pvs") is not None
            ]
            # Content gaps: prompts where competitor appears but brand doesn't
            gaps = [
                p for p in tracked
                if isinstance(p, dict) and p.get("has_content_gap") is True
            ]
            gaps.sort(key=lambda x: float(x.get("pvs", 100)))
            context["content_gaps"] = [
                {
                    "prompt": g.get("prompt_text", "")[:100],
                    "pvs": g.get("pvs"),
                    "gap_competitor": g.get("winning_competitor"),
                }
                for g in gaps[:5]
            ]

    # ── Content metrics ────────────────────────────────────────────────────
    cm = module_d_doc.get("content_metrics") or {}
    if cm:
        context["content_metrics"] = {
            "word_count": cm.get("word_count"),
            "readability_score": cm.get("readability_score"),
            "entity_density": cm.get("entity_density"),
            "content_freshness": cm.get("content_freshness"),
            "structured_data_present": cm.get("structured_data_present"),
            "missing_entities": (cm.get("missing_entities") or [])[:5],
            "content_issues": (cm.get("content_issues") or [])[:5],
        }

    # ── Entity analysis ────────────────────────────────────────────────────
    entity = module_d_doc.get("entity_analysis") or {}
    if entity:
        context["entity_analysis"] = {
            "entities_found": entity.get("entities_found"),
            "entities_missing": (entity.get("entities_missing") or [])[:5],
            "entity_coverage_score": entity.get("entity_coverage_score"),
            "top_entities": (entity.get("top_entities") or [])[:5],
        }

    # ── IEU Recommendations ────────────────────────────────────────────────
    try:
        rec_docs = list(
            mongo_manager.db.recommendations.find(
                {"job_id": effective_job_id},
                projection={
                    "title": 1, "action": 1, "description": 1,
                    "priority_score": 1, "impact": 1, "effort": 1,
                    "urgency": 1, "recommendation_type": 1,
                    "prompt_text": 1, "_id": 0,
                },
                sort=[("priority_score", -1)],
                limit=12,
            )
        )
    except Exception:
        rec_docs = []

    if rec_docs:
        context["recommendations"] = rec_docs
    elif module_d_doc.get("recommendations"):
        recs_raw = module_d_doc["recommendations"]
        if isinstance(recs_raw, dict):
            recs_list = (
                recs_raw.get("recommendations")
                or recs_raw.get("actions")
                or []
            )
        elif isinstance(recs_raw, list):
            recs_list = recs_raw
        else:
            recs_list = []
        recs_list.sort(key=lambda x: float(x.get("priority_score", 0)), reverse=True)
        context["recommendations"] = recs_list[:12]

    # ── Performance trend (last 5 snapshots) ─────────────────────────────
    try:
        snapshots = list(
            mongo_manager.db.prompt_performance_snapshots.find(
                {"job_id": effective_job_id},
                projection={
                    "prompt_visibility_score": 1,
                    "avg_citation_rate": 1,
                    "recorded_at": 1,
                    "_id": 0,
                },
                sort=[("recorded_at", -1)],
                limit=5,
            )
        )
        if snapshots:
            context["performance_trend"] = [
                {
                    "pvs": s.get("prompt_visibility_score"),
                    "citation_rate": s.get("avg_citation_rate"),
                    "date": str(s.get("recorded_at", ""))[:10],
                }
                for s in snapshots
            ]
    except Exception:
        pass

    # ── Module E brand data ────────────────────────────────────────────────
    try:
        module_e_doc = mongo_manager.module_e.find_one(
            {"jobId": effective_job_id},
            projection={
                "brand_description": 1,
                "ai_share_of_voice": 1,
                "_id": 0,
            },
        )
    except Exception:
        module_e_doc = None

    if module_e_doc:
        context["brand_description"] = module_e_doc.get("brand_description", "")
        ai_sov = module_e_doc.get("ai_share_of_voice") or {}
        if ai_sov:
            context["ai_sov"] = {
                "overall": ai_sov.get("overall_sov"),
                "visibility_tier": ai_sov.get("visibility_tier"),
                "brand_known_by": ai_sov.get("brand_known_by_models", []),
            }

    # ── Feedback stats ─────────────────────────────────────────────────────
    try:
        total_fb = mongo_manager.db.recommendation_feedback.count_documents(
            {"job_id": effective_job_id}
        )
        done_fb = mongo_manager.db.recommendation_feedback.count_documents(
            {"job_id": effective_job_id, "feedback": "completed"}
        )
        context["recommendation_feedback"] = {
            "total": total_fb,
            "completed": done_fb,
        }
    except Exception:
        pass

    return context


def _build_context_summary(context: Dict[str, Any]) -> str:
    """
    Converts the context dict into a clean text summary for the AI prompt.
    This is what Claude reads to answer the question.
    """
    if context.get("error"):
        return f"ERROR: {context['error']}"

    lines = [
        f"=== Module D Prompt Tracking Analysis for {context.get('url', 'unknown')} ===",
        f"Analysis date: {context.get('analysis_date', 'unknown')}",
        "",
    ]

    if context.get("brand_description"):
        lines += [f"Brand: {context['brand_description'][:200]}", ""]

    # Tracking summary
    ts = context.get("tracking_summary")
    if ts:
        lines += [
            "=== Overall Prompt Visibility ===",
            f"Overall PVS: {ts.get('overall_pvs')} / 100",
            f"Avg citation rate: {ts.get('avg_citation_rate')}%  |  Avg SOV: {ts.get('avg_share_of_voice')}%",
            f"Total prompts tracked: {ts.get('total_prompts')}  |  Improved: {ts.get('prompts_improved')}  |  Declined: {ts.get('prompts_declined')}",
            "",
        ]

    # AI SOV from Module E
    ai_sov = context.get("ai_sov")
    if ai_sov:
        lines += [
            "=== AI Share of Voice (Module E) ===",
            f"Overall SOV: {ai_sov.get('overall')}%  |  Tier: {ai_sov.get('visibility_tier')}",
            f"Brand known by AI models: {', '.join(ai_sov.get('brand_known_by', []))}",
            "",
        ]

    # Top performing prompts
    top = context.get("top_prompts") or []
    if top:
        lines.append("=== Top Performing Prompts (highest PVS) ===")
        for p in top:
            delta_str = f"  Δ{p['delta']:+.1f}" if p.get("delta") is not None else ""
            lines.append(
                f'  "{p["prompt"]}" → PVS: {p.get("pvs")}  |  Citation rate: {p.get("citation_rate")}%{delta_str}'
            )
        lines.append("")

    # Bottom prompts
    bottom = context.get("bottom_prompts") or []
    if bottom:
        lines.append("=== Weakest Prompts (lowest PVS) ===")
        for p in bottom:
            delta_str = f"  Δ{p['delta']:+.1f}" if p.get("delta") is not None else ""
            lines.append(
                f'  "{p["prompt"]}" → PVS: {p.get("pvs")}  |  Citation rate: {p.get("citation_rate")}%{delta_str}'
            )
        lines.append("")

    # Content gaps
    gaps = context.get("content_gaps") or []
    if gaps:
        lines.append("=== Content Gaps (competitor appears, brand does not) ===")
        for g in gaps:
            lines.append(
                f'  "{g["prompt"]}" → PVS: {g.get("pvs")}  |  Competitor winning: {g.get("gap_competitor", "unknown")}'
            )
        lines.append("")

    # Content metrics
    cm = context.get("content_metrics") or {}
    if cm:
        lines += [
            "=== Content Metrics ===",
            f"Word count: {cm.get('word_count')}  |  Readability: {cm.get('readability_score')}  |  Entity density: {cm.get('entity_density')}",
            f"Content freshness: {cm.get('content_freshness')}  |  Structured data: {cm.get('structured_data_present')}",
        ]
        issues = cm.get("content_issues") or []
        if issues:
            lines.append(f"Issues: {', '.join(str(i) for i in issues)}")
        missing_ents = cm.get("missing_entities") or []
        if missing_ents:
            lines.append(f"Missing entities: {', '.join(str(e) for e in missing_ents)}")
        lines.append("")

    # Entity analysis
    ea = context.get("entity_analysis") or {}
    if ea:
        lines += [
            "=== Entity Analysis ===",
            f"Entities found: {ea.get('entities_found')}  |  Entity coverage score: {ea.get('entity_coverage_score')}",
        ]
        top_ents = ea.get("top_entities") or []
        if top_ents:
            lines.append(f"Top entities: {', '.join(str(e) for e in top_ents)}")
        missing_ents = ea.get("entities_missing") or []
        if missing_ents:
            lines.append(f"Missing entities: {', '.join(str(e) for e in missing_ents)}")
        lines.append("")

    # Performance trend
    trend = context.get("performance_trend") or []
    if trend:
        lines.append("=== PVS Trend (most recent first) ===")
        for s in trend:
            lines.append(
                f"  {s.get('date')}: PVS={s.get('pvs')}  |  Citation rate={s.get('citation_rate')}%"
            )
        lines.append("")

    # IEU recommendations
    recs = context.get("recommendations") or []
    if recs:
        lines.append("=== Prioritised Recommendations (IEU order) ===")
        for i, r in enumerate(recs, 1):
            title = (
                r.get("title")
                or r.get("action_title")
                or r.get("recommendation_type")
                or f"Recommendation {i}"
            )
            action = r.get("action") or r.get("description") or r.get("action_detail") or ""
            priority = r.get("priority_score") or r.get("priority") or ""
            prompt_ref = r.get("prompt_text", "")
            prompt_str = f' [prompt: "{prompt_ref[:60]}"]' if prompt_ref else ""
            lines.append(
                f"  {i}. [priority {priority}]{prompt_str} {title}: {str(action)[:200]}"
            )
        lines.append("")

    # Feedback stats
    fb = context.get("recommendation_feedback") or {}
    if fb.get("total"):
        lines += [
            f"Recommendation feedback: {fb.get('completed')} completed / {fb.get('total')} total",
            "",
        ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ASK AI FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

async def ask_module_d_ai(
    project_id: str,
    question: str,
    job_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Module D Ask AI.

    Args:
        project_id: The project to answer questions about.
        question: The user's natural language question.
        job_id: Optional specific run to query (defaults to latest).
        conversation_history: Optional previous turns for multi-turn chat.
                              Format: [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        {
          "answer": str,              # Claude's response
          "question_type": str,       # explain / interpret / recommend / out_of_scope
          "sources": list,            # which data fields were used
          "data_available": bool,     # whether project data was found
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
                "I'm focused on helping you understand and improve your Module D "
                "prompt tracking results — things like your PVS scores, citation rates, "
                "content gaps, entity coverage, and IEU-ranked recommendations. "
                "I can't help with content creation or other topics outside this scope. "
                "Try asking something like: 'Why is my PVS dropping?' or 'Which prompts have the biggest gaps?'"
            ),
            "question_type": "out_of_scope",
            "sources": [],
            "data_available": False,
        }

    # Step 2 — Load context from MongoDB
    context = _load_context_pack(project_id, job_id, question_type)

    if context.get("error"):
        return {
            "answer": context["error"],
            "question_type": question_type,
            "sources": [],
            "data_available": False,
        }

    context_summary = _build_context_summary(context)

    # Step 3 — System prompt: senior analyst persona
    system_instruction = f"""You are a senior AI visibility analyst for Module D (Prompt Tracking
and Content Intelligence). You write like an experienced consultant:
direct, precise, professional. No emojis. Avoid cheesy openings ("Hi there!", "Great question!").

The user's message includes a PROJECT DATA block from their latest stored Module D analysis.
Recommendations are IEU-ranked (Impact × 0.5 + (11-Effort) × 0.3 + Urgency × 0.2).

=== PRODUCT GLOSSARY (use when explaining terms) ===
{GLOSSARY}

=== HOW TO RESPOND ===
1) ANSWER ONLY WHAT THEY ASKED. Do not paste a full executive summary or every metric
   unless they explicitly ask for an overview, summary, or "walk me through everything".
2) NARROW QUESTIONS GET NARROW ANSWERS. If they ask about PVS, focus on PVS and its drivers.
   Do not also recite entity analysis and content metrics unless they support that answer.
3) USE DATA AS EVIDENCE, NOT A DUMP. Cite specific numbers from PROJECT DATA only when they
   support your answer. Omit unrelated metrics entirely.
4) DEFINITIONS: use the glossary; tie in the user's actual numbers briefly when helpful.
5) RECOMMENDATIONS: when they want actions, anchor to IEU-ranked recommendations in order
   (highest priority_score first). Do not invent generic marketing tactics.
6) TONE: calm, expert, concise. Short paragraphs. Bullets only when comparing items or listing
   requested actions. One tight paragraph is fine when that suffices.
7) NEVER invent facts. If something is missing from PROJECT DATA, say so plainly.
8) OUTPUT FORMAT (Markdown for in-app chat UI): Use **bold** labels, ### short headings,
   numbered lists for ranked priorities, bullet lists for parallel points.
   Put metric names in backticks (e.g. `PVS`, `citation_rate`).
   Synthesize numbers into sentences; avoid raw key:value dumps.

If the question is vague ("thoughts?", "what do you think?"), ask one clarifying line OR offer
two or three specific angles they could explore — do not dump all sections."""

    # Step 4 — Build messages
    messages = []

    if conversation_history:
        messages.extend(conversation_history[-4:])

    emphasis = {
        "explain": "They may mainly want definitions tied to their numbers.",
        "recommend": "They may mainly want actionable next steps from IEU-ranked recommendations.",
        "interpret": "They may mainly want interpretation of their prompt tracking metrics.",
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
            task_name="module_d_ask_ai",
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
        logger.error(f"Module D Ask AI call failed: {e}")
        answer = (
            "I couldn't generate an answer right now. "
            "Please try again in a moment."
        )

    # Step 6 — Build sources list
    sources = []
    ts = context.get("tracking_summary") or {}
    if ts.get("overall_pvs") is not None:
        sources.append(f"Overall PVS: {ts['overall_pvs']}")
    if ts.get("avg_citation_rate") is not None:
        sources.append(f"Avg citation rate: {ts['avg_citation_rate']}%")
    recs = context.get("recommendations") or []
    if recs:
        sources.append(f"{len(recs)} IEU-ranked recommendations")
    if context.get("content_gaps"):
        sources.append(f"{len(context['content_gaps'])} content gaps identified")

    # Step 7 — Log for analytics (non-critical)
    try:
        mongo_manager.db.module_d_ask_ai_log.insert_one({
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
            "overall_pvs": ts.get("overall_pvs"),
            "avg_citation_rate": ts.get("avg_citation_rate"),
            "total_prompts": ts.get("total_prompts"),
            "prompts_declined": ts.get("prompts_declined"),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTED QUESTIONS — returned to frontend for quick-start chips
# ─────────────────────────────────────────────────────────────────────────────

def get_suggested_questions(project_id: str) -> List[str]:
    """
    Returns suggested questions derived from the latest Module D document,
    with a generic fallback so chips are always useful.
    """
    fallback = [
        "Summarize my prompt tracking results in plain language.",
        "Which prompts have the lowest PVS and what should I do about them?",
        "What does my overall citation rate tell us?",
        "What is my top priority recommendation right now?",
    ]

    try:
        mongo_manager.connect()

        doc = mongo_manager.content_metrics.find_one(
            {"jobId": project_id},
            sort=[("updatedAt", -1)],
            projection={
                "url": 1, "updatedAt": 1,
                "recommendations": 1,
            },
        )
        tracking_doc = mongo_manager.db.prompt_tracking.find_one(
            {"jobId": project_id},
            projection={
                "overall_pvs": 1,
                "avg_citation_rate": 1,
                "tracked_prompts": 1,
                "prompts_declined": 1,
            },
        )

        if not doc and not tracking_doc:
            return fallback

        dynamic: List[str] = []

        if tracking_doc:
            pvs = tracking_doc.get("overall_pvs")
            cit = tracking_doc.get("avg_citation_rate")
            declined = tracking_doc.get("prompts_declined", 0)

            if pvs is not None:
                dynamic.append(f"My overall PVS is {pvs}. What does that mean and what's driving it?")
            if declined and declined > 0:
                dynamic.append(f"{declined} prompts declined since the last run — what changed?")
            if cit is not None and cit < 30:
                dynamic.append("My citation rate is low. What content changes would raise it?")

            tracked = tracking_doc.get("tracked_prompts") or []
            gaps = [p for p in tracked if isinstance(p, dict) and p.get("has_content_gap")]
            gaps.sort(key=lambda x: float(x.get("pvs", 100)))
            if gaps:
                p0 = str(gaps[0].get("prompt_text", ""))[:80].strip()
                comp = gaps[0].get("winning_competitor", "a competitor")
                if p0:
                    dynamic.append(
                        f'I have a content gap on "{p0}…" — how do I close it against {comp}?'
                    )

            if tracked:
                worst = sorted(
                    [p for p in tracked if p.get("pvs") is not None],
                    key=lambda x: float(x.get("pvs", 100)),
                )
                if worst:
                    wt = str(worst[0].get("prompt_text", ""))[:80].strip()
                    if wt:
                        dynamic.append(f'My weakest prompt is "{wt}…" — what should I prioritize?')

        if doc:
            recs_raw = doc.get("recommendations") or {}
            if isinstance(recs_raw, dict):
                recs_list = recs_raw.get("recommendations") or recs_raw.get("actions") or []
            elif isinstance(recs_raw, list):
                recs_list = recs_raw
            else:
                recs_list = []

            recs_list = sorted(recs_list, key=lambda x: float(x.get("priority_score", 0)), reverse=True)
            if recs_list:
                t0 = str(recs_list[0].get("title") or recs_list[0].get("action_title") or "").strip()
                if t0:
                    dynamic.append(
                        f'My #1 recommended action is "{t0}" — explain why and how to execute it.'
                    )

        # De-dupe, cap length, merge with fallback
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