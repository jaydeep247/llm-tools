# module_f_ask_ai.py
#
# Module F — Ask AI
#
# A project-scoped assistant that answers any question about Module F data.
#
# Flow:
#   1. Load latest Module F (+ Module E) from MongoDB into one context pack (same snapshot for every question).
#   2. MOAT 4 rows come from moat4_recommendations.all_actions (or role_output.actions); if missing,
#      regenerate in-memory via generate_moat7_recommendations() from the stored MOAT 7 payload.
#   3. Claude gets glossary + full project data + optional keyword "emphasis" for analytics only.
#
# The model must not invent numbers — facts come from the context pack. If data is missing, it says so.

import logging
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager

logger = logging.getLogger("module_f_ask_ai")

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
=== MOAT 7 / Module F Glossary ===

D7 Score (0–100): Competitive Citation Benchmarking Score. Measures how well your brand is cited
by AI models compared to competitors. Higher = better AI visibility vs competition.
  - Param 1 (30%): Share of Voice vs top 3 competitors
  - Param 2 (35%): Competitor content gap (prompts where competitors appear but you don't)
  - Param 3 (35%): Citation source overlap (do you share the same sources competitors use?)

D7 Grade:
  A+ / A = Excellent competitive position (score 80–100)
  B       = Good, some gaps to close (score 60–79)
  C       = Moderate, clear improvement opportunities (score 40–59)
  D       = Weak, competitors dominating (score 20–39)
  F       = Critical, brand barely appearing in AI responses (score 0–19)

D7 Delta: Change in D7 score vs previous run. Positive = improving, Negative = declining.

Delta Classes (why the score moved):
  competitor_threat   = A competitor gained 10+ points OR flipped a prompt from you to them
  critical_drop       = Your score dropped more than 15 points
  significant_drop    = Your score dropped 8–15 points or visibility dropped similarly
  improvement         = Your score gained more than 5 points
  plateau             = Score flat for 21+ days while you're still losing prompts
  stable              = No significant change

AIVS™ (AI Visibility Score): Master brand score across all 7 MOAT dimensions.
  D7 contributes 15% of the total AIVS™ score.
  aivs_d7_contribution = d7_score × 0.15

Share of Voice (SOV): % of AI responses where your brand appears vs all mentions
  (brand + competitors). Higher = AI talks about you more than competitors.

Coverage Gap Score (0–100): For a given prompt, how far behind competitors you are.
  0 = You rank #1. 100 = You don't appear at all.

Brand Win Rate: % of tracked prompts where your brand ranks #1 among competitors.

IEU Priority (Recommendations): Each recommendation is scored by:
  Priority = (Impact × 0.5) + ((11 - Effort) × 0.3) + (Urgency × 0.2)
  Higher priority = more impact for less effort, more urgent.

Alert Levels:
  high   = Immediate action needed (competitor threat or critical drop)
  medium = Attention needed soon
  low    = Monitor situation
  none   = All good
"""

# ─────────────────────────────────────────────────────────────────────────────
# MOAT 4 — ensure recommendations exist (DB snapshot or regenerate from same doc)
# ─────────────────────────────────────────────────────────────────────────────

def _coalesce_moat4_from_doc(module_f_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Stored runner output uses all_actions / role_output. Older Ask AI code only
    read recommendations/actions, so recs were often empty.

    If all_actions is missing/empty but the MOAT 7 payload is on the same document,
    regenerate MOAT 4 in-memory (no DB write) so Claude always gets IEU-ranked actions.
    """
    moat4 = module_f_doc.get("moat4_recommendations") or {}
    actions = moat4.get("all_actions") or moat4.get("recommendations") or []
    if actions:
        return moat4

    comparison = module_f_doc.get("compare_visibility_against_competitors") or {}
    competitor_wins = module_f_doc.get("competitor_wins") or {}
    gap_analysis = module_f_doc.get("gap_analysis") or []
    if not isinstance(gap_analysis, list):
        gap_analysis = []
    source_analysis = module_f_doc.get("source_analysis") or {}
    emerging_trends = module_f_doc.get("emerging_trends") or {}
    plan = str(module_f_doc.get("plan") or "agency").strip().lower()
    role = str(module_f_doc.get("role") or "seo_manager").strip()

    if not comparison or not competitor_wins:
        return moat4

    try:
        from .module_f_recommendation_engine import generate_moat7_recommendations

        regenerated = generate_moat7_recommendations(
            comparison=comparison,
            competitor_wins=competitor_wins,
            gap_analysis=gap_analysis,
            source_analysis=source_analysis,
            emerging_trends=emerging_trends or {},
            plan=plan,
            role=role,
            days_since_last_run=7,
        )
        if regenerated.get("all_actions"):
            logger.info("Ask AI: MOAT 4 regenerated in-memory from stored Module F payload")
            return regenerated
    except Exception as e:
        logger.warning(f"Ask AI: MOAT 4 regeneration skipped: {e}")

    return moat4


def _moat4_action_list(moat4: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Normalize recommendation rows for context + UI (supports runner + legacy shapes)."""
    ro = moat4.get("role_output") or {}
    from_role = ro.get("actions") or []
    if from_role:
        return list(from_role)
    return list(
        moat4.get("all_actions")
        or moat4.get("recommendations")
        or moat4.get("actions")
        or []
    )


# ─────────────────────────────────────────────────────────────────────────────
# QUESTION CLASSIFIER (lightweight routing for analytics / prompt emphasis only)
# ─────────────────────────────────────────────────────────────────────────────

def _classify_question(question: str) -> str:
    """
    Classify the user's question into one of 4 buckets:
      explain    → wants a definition or concept explained
      interpret  → wants to understand their specific data/results
      recommend  → wants advice on what to do
      out_of_scope → unrelated to Module F
    """
    q = question.lower().strip()

    # Out of scope signals
    out_of_scope_patterns = [
        "write", "create content", "write a blog", "draft", "generate post",
        "social media post", "email newsletter", "help me write",
    ]
    if any(p in q for p in out_of_scope_patterns):
        return "out_of_scope"

    # Explain signals — definitions, what does X mean
    explain_patterns = [
        "what is", "what does", "what are", "explain", "define", "mean",
        "definition", "how is", "how does", "what's", "tell me about",
        "d7 grade", "d7 score", "aivs", "sov", "share of voice",
        "delta class", "ieu", "coverage gap", "win rate", "alert level",
    ]
    if any(p in q for p in explain_patterns):
        return "explain"

    # Recommend signals — what to do
    recommend_patterns = [
        "what should", "how to improve", "how can i", "what can i do",
        "recommend", "suggestions", "next step", "action", "fix", "improve",
        "increase", "boost", "better", "priority", "top 3", "first thing",
        "what do i do", "help me", "strategy", "plan",
    ]
    if any(p in q for p in recommend_patterns):
        return "recommend"

    # Default to interpret for everything data-related
    return "interpret"


def _lightweight_chat_reply(question: str) -> Optional[str]:
    """
    Pure greetings / thanks / acknowledgements — respond without LLM or DB dump.
    Stops the model from treating 'hi' as a cue to paste the entire dashboard.
    """
    q2 = question.strip().lower()
    q2 = re.sub(r"[!?.，。！？\s]+$", "", q2).strip()

    if len(q2) <= 14 and re.fullmatch(r"h+i+", q2):
        return (
            "Hello. Ask a specific question about your Module F analysis — for example your D7 score "
            "and what drives it, which competitor wins on which prompts, content gaps, or MOAT 4 priorities — "
            "and I will answer from your stored run."
        )

    if re.match(r"^(hi|hey|hello|yo|sup|hiya|heya)\s*$", q2) or q2 in ("hi", "hey", "hello", "yo", "sup", "hiya"):
        return (
            "Hello. I answer focused questions using your latest Module F data. "
            "What do you want to know — metrics, competitors, or recommended actions?"
        )

    if re.match(r"^(hi|hey|hello)\s+there\s*$", q2):
        return (
            "Hello. Pose a concrete question (for example: why is my D7 low, who wins on SaaS prompts, "
            "or what should I do first) and I will respond from your results."
        )

    if re.match(r"^good\s+(morning|afternoon|evening)\b", q2) and len(q2) < 40:
        return (
            "Hello. How can I help with your Module F competitive intelligence — pick a topic "
            "(D7, win/loss prompts, gaps, or priorities) and ask directly."
        )

    if re.match(r"^(thanks|thank you|thx|ty|cheers)\b", q2) and len(q2) < 48:
        return "You are welcome. Ask another question whenever you need clarity on your Module F data."

    if q2 in ("ok", "okay", "k", "kk", "got it", "cool", "nice", "alright"):
        return "Understood. What should we look at next in your analysis?"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT LOADER — Fetches relevant Module F + E data from MongoDB
# ─────────────────────────────────────────────────────────────────────────────

def _load_context_pack(
    project_id: str,
    job_id: Optional[str] = None,
    question_type: str = "interpret",
) -> Dict[str, Any]:
    """
    Builds a context pack from MongoDB for the given project.

    For any in-scope question we attach the same factual snapshot (D7, MOAT 4,
    wins, gaps, visibility, E) so Claude can answer free-form questions accurately.
    question_type only affects logging / optional emphasis, not which facts are loaded.

    Returns a dict with structured data + a human-readable summary string.
    """
    context: Dict[str, Any] = {}

    # 1. Load latest Module F result
    try:
        query = {"projectId": project_id}
        if job_id:
            query["jobId"] = job_id

        module_f_doc = mongo_manager.db.module_f.find_one(
            query,
            sort=[("createdAt", -1)],
            projection={
                "jobId": 1, "url": 1, "plan": 1, "role": 1,
                "d7_aivs_output": 1, "moat4_recommendations": 1,
                "competitor_wins": 1, "gap_analysis": 1,
                "compare_visibility_against_competitors": 1,
                "emerging_trends": 1, "metric_recommendations": 1,
                "wins_library_recommendations": 1,
                "createdAt": 1, "_id": 0,
            }
        )
    except Exception as e:
        logger.error(f"Failed to load Module F doc: {e}")
        module_f_doc = None

    if not module_f_doc:
        return {"error": "No Module F analysis found for this project. Run a full analysis first."}

    context["job_id"] = module_f_doc.get("jobId")
    context["url"] = module_f_doc.get("url", "")
    context["plan"] = module_f_doc.get("plan", "agency")
    context["role"] = module_f_doc.get("role", "seo_manager")
    context["analysis_date"] = str(module_f_doc.get("createdAt", ""))

    # 2. Load Module E for brand info
    try:
        module_e_doc = mongo_manager.db.module_e.find_one(
            {"jobId": module_f_doc.get("jobId")},
            projection={
                "brand_description": 1, "ai_share_of_voice": 1,
                "competitor_mentions": 1, "_id": 0,
            }
        )
    except Exception:
        module_e_doc = {}

    # 3. D7 AIVS data — always include for interpret/recommend
    d7 = module_f_doc.get("d7_aivs_output") or {}
    if d7:
        context["d7"] = {
            "score": d7.get("d7_score"),
            "grade": d7.get("d7_grade"),
            "delta": d7.get("d7_delta"),
            "delta_direction": d7.get("d7_delta_direction"),
            "alert_level": d7.get("alert_level"),
            "aivs_contribution": d7.get("aivs_d7_contribution"),
            "projected_aivs": d7.get("projected_aivs_score"),
            "param_breakdown": d7.get("param_breakdown"),
        }

    # 4. MOAT 4 recommendations — always attach when payload exists (runner shape)
    moat4 = _coalesce_moat4_from_doc(module_f_doc)
    if moat4:
        recs = _moat4_action_list(moat4)
        # Prefer full IEU-ranked all_actions for accuracy; cap for token budget
        context["top_recommendations"] = recs[:12]
        context["delta_class"] = moat4.get("delta_class")
        ro = moat4.get("role_output") or {}
        context["rec_summary"] = ro.get("summary") or moat4.get("summary")

    # 5. Competitor wins summary
    comp_wins = module_f_doc.get("competitor_wins") or {}
    summary = comp_wins.get("summary") or {}
    if summary:
        context["competitor_wins_summary"] = {
            "total_prompts": summary.get("total_prompts"),
            "brand_wins": summary.get("brand_wins"),
            "competitor_wins": summary.get("competitor_wins"),
            "brand_win_rate": summary.get("brand_win_rate"),
            "competitor_win_rate": summary.get("competitor_win_rate"),
            "avg_gap_score": summary.get("avg_content_gap_score"),
        }
        # Top losing prompts
        detailed = comp_wins.get("detailed_results") or []
        losing = [r for r in detailed if r.get("winner") == "competitor"]
        losing.sort(key=lambda x: x.get("coverage_gap_score", 0), reverse=True)
        context["top_losing_prompts"] = [
            {
                "prompt": r.get("prompt", "")[:100],
                "lost_to": r.get("winner_name"),
                "brand_rank": r.get("brand_rank"),
                "gap_score": r.get("coverage_gap_score"),
            }
            for r in losing[:5]
        ]
        # Competitor breakdown
        breakdown = comp_wins.get("competitor_breakdown") or []
        context["competitor_breakdown"] = breakdown[:5]

    # 6. Gap analysis top items
    gap = module_f_doc.get("gap_analysis") or []
    if gap:
        context["top_gaps"] = [
            {
                "competitor": g.get("competitor"),
                "gap_score": g.get("gapScore"),
                "missing_prompts": g.get("missingPrompts"),
                "potential_gain": g.get("potentialGainPercent"),
            }
            for g in gap[:3]
        ]

    # 7. Visibility comparison (SOV)
    comparison = module_f_doc.get("compare_visibility_against_competitors") or {}
    if comparison:
        brand_entity = comparison.get("brand_entity") or {}
        context["visibility"] = {
            "brand_sov": brand_entity.get("share_of_voice"),
            "brand_citation_score": brand_entity.get("citation_score"),
            "brand_mention_count": brand_entity.get("mention_count"),
            "top_competitors": [
                {
                    "name": e.get("name"),
                    "sov": e.get("share_of_voice"),
                    "citation_score": e.get("citation_score"),
                }
                for e in (comparison.get("competitor_entities") or [])[:3]
            ]
        }

    # 8. Brand description from Module E
    if module_e_doc:
        context["brand_description"] = module_e_doc.get("brand_description", "")
        ai_sov = module_e_doc.get("ai_share_of_voice") or {}
        if ai_sov:
            context["ai_sov"] = {
                "overall": ai_sov.get("overall_sov"),
                "visibility_tier": ai_sov.get("visibility_tier"),
                "brand_known_by": ai_sov.get("brand_known_by_models", []),
            }

    # 9. Emerging trends
    trends = module_f_doc.get("emerging_trends") or {}
    if trends:
        context["emerging_trends"] = {
            "trend_direction": trends.get("trend_direction"),
            "weeks_declining": trends.get("weeks_declining"),
            "competitor_gaining": trends.get("fastest_rising_competitor"),
        }

    # 10. Wins library recommendations
    wins_recs = module_f_doc.get("wins_library_recommendations") or {}
    if wins_recs:
        context["wins_recommendations"] = (wins_recs.get("recommendations") or [])[:5]

    return context


def _build_context_summary(context: Dict[str, Any]) -> str:
    """
    Converts the context dict into a clean text summary for the AI prompt.
    This is what Claude reads to answer the question.
    """
    if context.get("error"):
        return f"ERROR: {context['error']}"

    lines = [
        f"=== Project Analysis for {context.get('url', 'unknown')} ===",
        f"Analysis date: {context.get('analysis_date', 'unknown')}",
        f"Plan: {context.get('plan', 'unknown')} | Role: {context.get('role', 'unknown')}",
        "",
    ]

    if context.get("brand_description"):
        lines += [f"Brand: {context['brand_description'][:200]}", ""]

    # D7 scores
    d7 = context.get("d7")
    if d7:
        lines += [
            "=== D7 Competitive Score ===",
            f"Score: {d7.get('score')} / 100  |  Grade: {d7.get('grade')}",
            f"Delta: {d7.get('delta')} ({d7.get('delta_direction', 'unknown direction')})",
            f"Alert level: {d7.get('alert_level', 'none')}",
            f"AIVS™ contribution: {d7.get('aivs_contribution')} (D7 = 15% of total)",
        ]
        pb = d7.get("param_breakdown") or {}
        if pb:
            lines += [
                f"  Param 1 — Share of Voice score: {pb.get('sov_score')}",
                f"  Param 2 — Content gap score: {pb.get('gap_score')}",
                f"  Param 3 — Source overlap score: {pb.get('overlap_score')}",
            ]
        lines.append("")

    # AI SOV
    ai_sov = context.get("ai_sov")
    if ai_sov:
        lines += [
            "=== AI Share of Voice ===",
            f"Overall SOV: {ai_sov.get('overall')}%  |  Tier: {ai_sov.get('visibility_tier')}",
            f"Brand known by AI models: {', '.join(ai_sov.get('brand_known_by', []))}",
            "",
        ]

    # Visibility
    vis = context.get("visibility")
    if vis:
        lines += [
            "=== Citation Visibility ===",
            f"Brand SOV: {vis.get('brand_sov')}%  |  Citation score: {vis.get('brand_citation_score')}",
        ]
        for comp in vis.get("top_competitors") or []:
            lines.append(f"  {comp.get('name')}: SOV={comp.get('sov')}%, Citation={comp.get('citation_score')}")
        lines.append("")

    # Win/loss
    cws = context.get("competitor_wins_summary")
    if cws:
        lines += [
            "=== Competitor Win/Loss ===",
            f"Brand win rate: {cws.get('brand_win_rate')}% | Competitor win rate: {cws.get('competitor_win_rate')}%",
            f"Total prompts tracked: {cws.get('total_prompts')} | Brand wins: {cws.get('brand_wins')} | Competitor wins: {cws.get('competitor_wins')}",
            f"Avg content gap score: {cws.get('avg_gap_score')}",
            "",
        ]

    # Top losing prompts
    losing = context.get("top_losing_prompts") or []
    if losing:
        lines.append("=== Top Prompts Where Competitors Beat You ===")
        for r in losing:
            lines.append(
                f"  \"{r.get('prompt', '')}\" → Lost to: {r.get('lost_to')} | Your rank: {r.get('brand_rank', 'not mentioned')} | Gap: {r.get('gap_score')}"
            )
        lines.append("")

    # Competitor breakdown
    breakdown = context.get("competitor_breakdown") or []
    if breakdown:
        lines.append("=== Competitor Performance Breakdown ===")
        for c in breakdown:
            lines.append(
                f"  {c.get('competitor')}: won {c.get('prompts_won')} prompts ({c.get('win_percent')}% win rate)"
            )
        lines.append("")

    # Gaps
    gaps = context.get("top_gaps") or []
    if gaps:
        lines.append("=== Biggest Content Gaps ===")
        for g in gaps:
            lines.append(
                f"  vs {g.get('competitor')}: gap score {g.get('gap_score')} | missing {g.get('missing_prompts')} prompts | potential gain: {g.get('potential_gain')}%"
            )
        lines.append("")

    # Recommendations (runner: action_title / action_detail / priority_score)
    recs = context.get("top_recommendations") or []
    if recs:
        lines.append("=== Current Prioritised Recommendations (MOAT 4, IEU order) ===")
        for i, r in enumerate(recs, 1):
            title = (
                r.get("action_title")
                or r.get("title")
                or r.get("action_type")
                or f"Action {i}"
            )
            action = r.get("action_detail") or r.get("action") or r.get("description") or ""
            priority = r.get("priority_score") or r.get("priority") or ""
            comp = r.get("competitor")
            suffix = f" (vs {comp})" if comp else ""
            lines.append(
                f"  {i}. [priority {priority}]{suffix} {title}: {str(action)[:200]}"
            )
        lines.append("")

    # Delta class
    if context.get("delta_class"):
        lines += [f"Current situation: {context['delta_class'].replace('_', ' ').upper()}", ""]

    # Trends
    trends = context.get("emerging_trends") or {}
    if trends:
        lines += [
            "=== Emerging Trends ===",
            f"Trend direction: {trends.get('trend_direction')}",
            f"Weeks declining: {trends.get('weeks_declining')}",
            f"Fastest rising competitor: {trends.get('competitor_gaining')}",
            "",
        ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ASK AI FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

async def ask_module_f_ai(
    project_id: str,
    question: str,
    job_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Module F Ask AI.

    Args:
        project_id: The project to answer questions about
        question: The user's natural language question
        job_id: Optional specific run to query (defaults to latest)
        conversation_history: Optional list of previous turns for multi-turn chat
                              Format: [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        {
          "answer": str,              # Claude's response
          "question_type": str,       # explain / interpret / recommend / out_of_scope
          "sources": list,            # which data fields were used
          "recommendation_ids": list, # if relevant recs were cited
          "data_available": bool,     # whether project data was found
        }
    """
    if not question or not question.strip():
        return {"answer": "Please ask a question.", "question_type": "unknown"}

    question = question.strip()

    # Step 0 — Greetings / small talk: never run a full analyst pass (avoids dumping the whole dashboard)
    small = _lightweight_chat_reply(question)
    if small is not None:
        return {
            "answer": small,
            "question_type": "chat",
            "sources": [],
            "data_available": True,
        }

    # Step 1 — Classify the question
    question_type = _classify_question(question)

    # Handle out of scope immediately
    if question_type == "out_of_scope":
        return {
            "answer": (
                "I'm focused on helping you understand and improve your Module F "
                "competitive intelligence results — things like your D7 score, "
                "competitor gaps, AI share of voice, and recommendations. "
                "I can't help with content creation or other topics outside this scope. "
                "Try asking something like: 'Why did my score drop?' or 'What should I do first?'"
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

    # Step 3 — Senior analyst persona: answer the actual question, no unsolicited mega-summaries
    system_instruction = f"""You are a senior competitive intelligence analyst for MOAT 7 / Module F
(competitive AI visibility and citation benchmarking). You write like an experienced consultant:
direct, precise, professional. No emojis. Avoid cheesy openings ("Hi there!", "Great question!").

The user's message includes a PROJECT DATA block from their latest stored analysis (MOAT 4 actions are IEU-ranked).

=== PRODUCT GLOSSARY (use when explaining terms) ===
{GLOSSARY}

=== HOW TO RESPOND ===
1) ANSWER ONLY WHAT THEY ASKED. Do not paste a full executive summary, "your current position", or every metric
   unless they explicitly ask for an overview, summary, full picture, "everything", or "walk me through the results".
2) NARROW QUESTIONS GET NARROW ANSWERS. Example: if they ask about D7, focus on D7 and its drivers; do not
   also recite win rates, SOV, and MOAT 4 unless needed to explain D7.
3) USE DATA AS EVIDENCE, NOT AS A DUMP. Cite specific numbers from PROJECT DATA only when they support your answer.
   Omit unrelated metrics entirely.
4) DEFINITIONS: use the glossary; tie in their numbers briefly when helpful.
5) RECOMMENDATIONS: when they want actions, anchor to MOAT 4 items in IEU order (highest priority_score first).
   Do not invent unrelated generic marketing tactics.
6) TONE: calm, expert, concise. Short paragraphs. Bullets only when comparing multiple items or listing
   actions they requested. If one tight paragraph suffices, use one.
7) NEVER invent facts. If something is missing from PROJECT DATA, say it is not in this run.
8) OUTPUT FORMAT (Markdown for the in-app chat UI): Write in GitHub-flavored Markdown so **bold**, lists,
   and code styling render properly — not raw asterisks in plain text.
   - Start with a one-sentence takeaway when helpful, then structure detail with **bold** labels or ### short headings.
   - Use numbered lists for steps or ranked priorities; use bullet lists for parallel points.
   - Put metric names or field labels in backticks (e.g. `D7 score`, `coverage_gap_score`).
   - Synthesize numbers into sentences; avoid pasting unstructured key:value dumps.

If the user's question is vague ("thoughts?", "what do you think?"), ask one clarifying line OR offer
two or three specific angles they could ask about — do not default to dumping all sections."""

    # Step 4 — Build messages for Claude
    messages = []

    # Add conversation history (last 4 turns to keep context lean)
    if conversation_history:
        messages.extend(conversation_history[-4:])

    # Light hint from keyword router (optional emphasis only)
    emphasis = {
        "explain": "They may mainly want definitions tied to their numbers.",
        "recommend": "They may mainly want actionable next steps from MOAT 4.",
        "interpret": "They may mainly want interpretation of their metrics.",
    }.get(question_type, "")

    # Add the current question with full context
    user_message = f"""PROJECT DATA:
{context_summary}

Routing hint (optional): {emphasis or "none — infer from the question only"}

The user's message to answer (respond to this specifically; no unsolicited full-dashboard recap):
{question}"""

    messages.append({"role": "user", "content": user_message})

    # Step 5 — Call Claude (using claude-sonnet for high quality reasoning)
    # System prompt goes in input_data["system"] per the ClaudeProvider._prepare_claude_messages pattern.
    # skip_cache=True because every Ask AI question is unique — caching would return wrong answers.
    try:
        resp = await execute_task(
            task_name="module_f_ask_ai",
            input_data={
                "system": system_instruction,
                "messages": messages,
            },
            provider="claude",
            options={
                "model": "claude-sonnet-4-20250514",   # latest Sonnet — best reasoning quality
                "temperature": 0.25,
                "max_tokens": 1200,
                "skip_cache": True,                    # every question is unique
            },
        )

        if not resp.success or not resp.data:
            raise ValueError(resp.error or "Empty response from Claude")

        answer = str(resp.data).strip()

    except Exception as e:
        logger.error(f"Ask AI call failed: {e}")
        answer = (
            "I couldn't generate an answer right now. "
            "Please try again in a moment."
        )

    # Step 6 — Build sources list (which data fields were used)
    sources = []
    if context.get("d7"):
        sources.append(f"D7 score: {context['d7'].get('score')} (grade {context['d7'].get('grade')})")
    if context.get("competitor_wins_summary"):
        sources.append(f"Brand win rate: {context['competitor_wins_summary'].get('brand_win_rate')}%")
    if context.get("top_recommendations"):
        sources.append(f"{len(context['top_recommendations'])} MOAT 4 recommendations")
    if context.get("ai_sov"):
        sources.append(f"AI SOV: {context['ai_sov'].get('overall')}%")

    # Step 7 — Extract recommendation IDs if any were cited
    rec_ids = []
    recs = context.get("top_recommendations") or []
    for rec in recs:
        rid = rec.get("id") or rec.get("rec_id")
        if rid:
            rec_ids.append(rid)

    # Step 8 — Log the question for analytics
    try:
        mongo_manager.db.module_f_ask_ai_log.insert_one({
            "projectId": project_id,
            "jobId": job_id or context.get("job_id"),
            "question": question,
            "question_type": question_type,
            "answer_length": len(answer),
            "asked_at": datetime.utcnow(),
        })
    except Exception:
        pass  # Non-critical

    return {
        "answer": answer,
        "question_type": question_type,
        "sources": sources,
        "recommendation_ids": rec_ids,
        "data_available": True,
        "context_snapshot": {
            "d7_score": (context.get("d7") or {}).get("score"),
            "d7_grade": (context.get("d7") or {}).get("grade"),
            "brand_win_rate": (context.get("competitor_wins_summary") or {}).get("brand_win_rate"),
            "alert_level": (context.get("d7") or {}).get("alert_level"),
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTED QUESTIONS — returned to frontend for quick-start chips
# ─────────────────────────────────────────────────────────────────────────────

def get_suggested_questions(project_id: str) -> List[str]:
    """
    Returns suggested questions derived from the latest Module F document when possible,
    plus a short generic fallback so chips stay relevant to real data (not one static list only).
    """
    fallback = [
        "Summarize my competitive position in plain language.",
        "What should I prioritize first based on my data?",
        "What does my D7 score and grade mean for us?",
        "Which metrics are pulling my score down?",
    ]

    try:
        doc = mongo_manager.db.module_f.find_one(
            {"projectId": project_id},
            sort=[("createdAt", -1)],
            projection={
                "d7_aivs_output": 1,
                "competitor_wins": 1,
                "compare_visibility_against_competitors": 1,
                "gap_analysis": 1,
                "source_analysis": 1,
                "emerging_trends": 1,
                "moat4_recommendations": 1,
                "plan": 1,
                "role": 1,
            },
        )
        if not doc:
            return fallback

        dynamic: List[str] = []
        d7 = doc.get("d7_aivs_output") or {}
        alert = d7.get("alert_level", "none")
        grade = str(d7.get("d7_grade") or "")
        delta_dir = str(d7.get("d7_delta_direction") or "")
        score = d7.get("d7_score")

        if score is not None:
            dynamic.append(f"My D7 score is {score} (grade {grade or '?'}). What does that imply?")
        if alert == "high":
            dynamic.append("Why is my alert level high and what should I check first?")
        if delta_dir == "dropped":
            dynamic.append("What changed — why did my benchmark drop vs last run?")
        if grade in ("D", "F"):
            dynamic.append("My grade is weak — what are the top fixes from my analysis?")
        if grade in ("A", "A+"):
            dynamic.append("We're scoring well — where are the remaining risks?")

        comparison = doc.get("compare_visibility_against_competitors") or {}
        comps = comparison.get("competitor_entities") or []
        for ent in comps[:2]:
            name = (ent.get("name") or "").strip()
            if name:
                dynamic.append(f"How am I doing against {name} specifically?")

        cw = doc.get("competitor_wins") or {}
        detailed = cw.get("detailed_results") or []
        losing = [r for r in detailed if isinstance(r, dict) and r.get("winner") == "competitor"]
        losing.sort(key=lambda x: float(x.get("coverage_gap_score") or 0), reverse=True)
        if losing:
            p = str(losing[0].get("prompt") or "")[:80].strip()
            lost_to = losing[0].get("winner_name") or "a competitor"
            if p:
                dynamic.append(f'I am losing on prompts like "{p}…" — what should I do vs {lost_to}?')

        gaps = doc.get("gap_analysis") or []
        if isinstance(gaps, list) and gaps:
            g0 = gaps[0]
            if isinstance(g0, dict):
                cname = g0.get("competitor")
                if cname:
                    dynamic.append(f"Where is my biggest content gap vs {cname}?")

        moat4 = _coalesce_moat4_from_doc(doc)
        actions = _moat4_action_list(moat4)
        if actions:
            t0 = (actions[0].get("action_title") or "").strip()
            if t0:
                dynamic.append(f'My #1 recommended action is "{t0}" — explain why and how to execute.')

        # De-dupe, cap length, merge with short fallback
        seen = set()
        ordered: List[str] = []
        for q in dynamic + fallback:
            k = q.strip().lower()
            if k and k not in seen:
                seen.add(k)
                ordered.append(q.strip())
        return ordered[:12]
    except Exception:
        return fallback