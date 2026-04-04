# module_e_ask_ai.py
#
# Module E — Ask AI
#
# A project-scoped assistant that answers any question about Module E data.
#
# Flow:
#   1. Load the latest Module E document from MongoDB (module_e collection)
#      into one context pack — same snapshot for every question in a session.
#   2. Context covers: content consistency, entity coverage, brand analysis,
#      AI Share of Voice (SOV), sentiment tracking, ranking analysis,
#      competitor mentions, SOV recommendations, and tracked-prompt recommendations.
#   3. Claude gets a glossary + full project data + optional routing hint.
#
# The model must not invent numbers — all facts come from the context pack.
# If data is missing it says so plainly.

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager

logger = logging.getLogger("module_e_ask_ai")

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
=== Module E / Brand Intelligence Glossary ===

Content Consistency Score (0–100): Measures how consistently the brand's
core mandate (topic, audience, tone) is communicated across all pages.
  - Topic density:    % of content aligned with the brand's main subject.
  - Audience density: % of content addressing the intended audience.
  - Brand density:    frequency of brand name across all pages.
  Higher score = clearer, more consistent brand messaging for AI models.

Entity Coverage Score (0–100%): % of expected industry entities (key terms,
product names, concepts) that actually appear in the crawled content.
  found    = entities present on site.
  missing  = expected entities absent from site (gaps AI models notice).

AI Share of Voice (SOV, 0–100%): How often the brand appears in AI-generated
answers compared to competitors when users ask industry questions.
  overall_sov          = brand SOV across all models and prompts.
  visibility_tier      = Dominant / Strong / Moderate / Weak / Not yet AI-indexed.
  brand_known_by_models = list of AI models that mention the brand.

Sentiment Score: Brand sentiment measured across AI model outputs and web.
  distribution = % positive / negative / neutral mentions.
  overall_score = 0 (very negative) to 100 (very positive).

Ranking Analysis: For each tracked prompt, measures how the brand ranks vs
competitors in AI responses.
  ranking_position_per_prompt = rank (1=first mention) per prompt.
  accuracy_score  = % of brand claims AI reproduces correctly for that prompt.
  sentiment_score = sentiment in AI responses mentioning the brand.

Content Quality Score: How well page content matches user intent for each
tracked prompt (0–100).

Competitor Mentions / Competitor SOV: How many times competitors appear in
AI responses vs the brand. High competitor SOV = brand displacement risk.

Brand Known-By: List of AI models (GPT-4, Claude, Gemini, etc.) that
reliably cite the brand when answering relevant queries.

Tracked Prompts Recommendations: IEU-prioritised actions to improve ranking
position and citation rates for specific prompts.

SOV Recommendations: Actions to increase AI Share of Voice vs competitors.

Severity levels (recommendations):
  critical = must fix immediately — significant brand visibility loss.
  warning  = should fix soon — competitive risk or content gap.
  info     = improvement opportunity — polish and optimisation.
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
        "content consistency", "entity coverage", "share of voice", "sov",
        "sentiment", "ranking analysis", "brand known", "visibility tier",
        "competitor mentions", "accuracy score",
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
    """Pure greetings / thanks — respond without hitting the DB or Claude."""
    q2 = question.strip().lower()
    q2 = re.sub(r"[!?.，。！？\s]+$", "", q2).strip()

    if len(q2) <= 14 and re.fullmatch(r"h+i+", q2):
        return (
            "Hello. Ask a specific question about your Module E analysis — for example "
            "your AI Share of Voice, brand sentiment, entity coverage gaps, "
            "ranking positions, or your top improvement recommendations."
        )

    if re.match(r"^(hi|hey|hello|yo|sup|hiya|heya)\s*$", q2) or q2 in ("hi", "hey", "hello", "yo", "sup"):
        return (
            "Hello. I answer focused questions using your latest Module E brand intelligence data. "
            "What do you want to know — AI SOV, sentiment, entity coverage, rankings, or recommendations?"
        )

    if re.match(r"^(hi|hey|hello)\s+there\s*$", q2):
        return (
            "Hello. Pose a concrete question (for example: what is my AI SOV, "
            "which competitors are displacing me, or what should I do first) "
            "and I will respond from your stored analysis."
        )

    if re.match(r"^good\s+(morning|afternoon|evening)\b", q2) and len(q2) < 40:
        return (
            "Hello. How can I help with your Module E brand intelligence — pick a topic "
            "(AI SOV, sentiment, entity gaps, or priorities) and ask directly."
        )

    if re.match(r"^(thanks|thank you|thx|ty|cheers)\b", q2) and len(q2) < 48:
        return "You are welcome. Ask another question whenever you need clarity on your Module E data."

    if q2 in ("ok", "okay", "k", "kk", "got it", "cool", "nice", "alright"):
        return "Understood. What should we look at next in your brand intelligence analysis?"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT LOADER
# ─────────────────────────────────────────────────────────────────────────────

def _load_context_pack(
    project_id: str,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Loads the latest Module E document from MongoDB and returns a
    structured context pack for Claude to reason over.
    """
    context: Dict[str, Any] = {}

    try:
        mongo_manager.connect()
        query: Dict[str, Any] = {"jobId": job_id} if job_id else {"jobId": project_id}
        doc = mongo_manager.module_e.find_one(
            query,
            sort=[("updatedAt", -1)],
        )
    except Exception as e:
        logger.error(f"Failed to load Module E doc: {e}")
        doc = None

    if not doc:
        return {"error": "No Module E analysis found for this project. Run a brand intelligence analysis first."}

    context["job_id"] = doc.get("jobId")
    context["url"] = doc.get("url", "")
    context["brand_description"] = doc.get("brand_description", "")
    context["analysis_date"] = str(doc.get("updatedAt", ""))

    # ── Content Consistency ───────────────────────────────────────────────
    cc = doc.get("content_consistency") or {}
    if cc:
        mandate = cc.get("mandate") or {}
        context["content_consistency"] = {
            "score": cc.get("score"),
            "topic_density": cc.get("topic_density"),
            "audience_density": cc.get("audience_density"),
            "brand_density": cc.get("brand_density"),
            "mandate": {
                "brand_name": mandate.get("brand_name"),
                "topic": mandate.get("topic"),
                "audience": mandate.get("audience"),
                "tone": mandate.get("tone"),
                "location": mandate.get("location"),
            },
        }

    # ── Entity Coverage ───────────────────────────────────────────────────
    ec = doc.get("entity_coverage") or {}
    if ec:
        context["entity_coverage"] = {
            "score": ec.get("score"),
            "total_expected": ec.get("total_expected"),
            "found": (ec.get("found") or [])[:10],
            "missing": (ec.get("missing") or [])[:10],
        }

    # ── AI Share of Voice ─────────────────────────────────────────────────
    ai_sov = doc.get("ai_share_of_voice") or {}
    if ai_sov:
        context["ai_sov"] = {
            "overall_sov": ai_sov.get("overall_sov"),
            "visibility_tier": ai_sov.get("visibility_tier"),
            "brand_known_by_models": ai_sov.get("brand_known_by_models") or [],
            "by_model": ai_sov.get("by_model") or {},
        }

    # ── AI SOV History (trend — last 5 snapshots) ─────────────────────────
    sov_history = doc.get("ai_sov_history") or []
    if sov_history:
        context["sov_trend"] = [
            {
                "date": s.get("date"),
                "overall_sov": s.get("overall_sov"),
                "visibility_tier": s.get("visibility_tier"),
            }
            for s in sov_history[-5:]
        ]

    # ── Competitor Mentions ───────────────────────────────────────────────
    comp_mentions = doc.get("competitor_mentions") or {}
    if comp_mentions:
        data_rows = comp_mentions.get("data") or []
        brand_row = data_rows[0] if data_rows else {}
        competitor_rows = data_rows[1:6] if len(data_rows) > 1 else []
        context["competitor_mentions"] = {
            "brand_sov": comp_mentions.get("brand_sov"),
            "brand_mentions": brand_row.get("mentions"),
            "brand_sentiment": brand_row.get("sentiment"),
            "competitors": [
                {
                    "name": r.get("name"),
                    "mentions": r.get("mentions"),
                    "sentiment": r.get("sentiment"),
                }
                for r in competitor_rows
            ],
        }

    # ── Sentiment Tracking ────────────────────────────────────────────────
    sentiment = doc.get("sentiment_tracking") or {}
    if sentiment:
        context["sentiment"] = {
            "overall_score": sentiment.get("overall_score"),
            "distribution": sentiment.get("distribution") or {},
            "by_model": {
                model: {
                    "score": info.get("score"),
                    "distribution": info.get("distribution"),
                }
                for model, info in (sentiment.get("by_model") or {}).items()
            },
        }

    # ── Brand Analysis ────────────────────────────────────────────────────
    brand = doc.get("brand_analysis") or {}
    if brand:
        context["brand_analysis"] = {
            "brand_name": brand.get("brand_name"),
            "total_mentions": brand.get("total_mentions"),
            "sentiment_label": (brand.get("sentiment") or {}).get("label"),
            "top_sources": (brand.get("top_sources") or [])[:5],
        }

    # ── Ranking Analysis ──────────────────────────────────────────────────
    ranking = doc.get("ranking_analysis") or {}
    if ranking:
        ranking_per_prompt = ranking.get("ranking_position_per_prompt") or []
        metrics = ranking.get("metrics_summary") or {}
        content_quality = ranking.get("content_quality") or {}
        context["ranking_analysis"] = {
            "average_accuracy": metrics.get("average_accuracy"),
            "average_sentiment": metrics.get("average_sentiment"),
            "content_quality_overall": content_quality.get("overall_score"),
            "entity_coverage_score": (ranking.get("entity_coverage") or {}).get("score"),
            "missing_entities": (ranking.get("entity_coverage") or {}).get("missing_entities", [])[:5],
            "top_prompts": [
                {
                    "prompt": r.get("prompt", "")[:100],
                    "rank": r.get("rank"),
                    "accuracy_score": r.get("accuracy_score"),
                    "sentiment_score": r.get("sentiment_score"),
                }
                for r in ranking_per_prompt[:6]
            ],
        }

        # Tracked prompts recommendations
        tracked_recs = ranking.get("tracked_prompts_recommendations") or {}
        if tracked_recs:
            recs_list = tracked_recs.get("recommendations") or []
            recs_list_sorted = sorted(recs_list, key=lambda x: x.get("priority", 99))
            context["tracked_prompt_recommendations"] = {
                "health_score": tracked_recs.get("health_score"),
                "summary": tracked_recs.get("summary"),
                "recommendations": recs_list_sorted[:8],
            }

    # ── SOV Recommendations ───────────────────────────────────────────────
    sov_recs = doc.get("sov_recommendations") or {}
    if sov_recs:
        recs_list = sov_recs.get("recommendations") or []
        recs_list_sorted = sorted(recs_list, key=lambda x: x.get("priority", 99))
        context["sov_recommendations"] = {
            "health_score": sov_recs.get("health_score"),
            "summary": sov_recs.get("summary"),
            "recommendations": recs_list_sorted[:8],
        }

    # ── Master Analysis (multi-model summary) ────────────────────────────
    master = doc.get("master_analysis") or {}
    if master:
        models_data = master.get("models") or []
        context["master_analysis"] = {
            "mandate": master.get("mandate") or {},
            "model_count": len(models_data),
            "top_models": [
                {
                    "model": m.get("model"),
                    "completeness_score": m.get("completeness_score"),
                    "model_wise_performance_score": m.get("model_wise_performance_score"),
                }
                for m in models_data[:4]
            ],
        }

    return context


def _build_context_summary(context: Dict[str, Any]) -> str:
    """Converts the context dict into a clean text block for Claude."""
    if context.get("error"):
        return f"ERROR: {context['error']}"

    lines = [
        f"=== Module E Brand Intelligence Analysis for {context.get('url', 'unknown')} ===",
        f"Analysis date: {context.get('analysis_date', 'unknown')}",
    ]
    if context.get("brand_description"):
        lines.append(f"Brand: {context['brand_description'][:200]}")
    lines.append("")

    # Content Consistency
    cc = context.get("content_consistency") or {}
    if cc:
        mandate = cc.get("mandate") or {}
        lines += [
            "=== Content Consistency ===",
            f"Score: {cc.get('score')} / 100",
            f"Topic density: {cc.get('topic_density')}  |  Audience density: {cc.get('audience_density')}  |  Brand density: {cc.get('brand_density')}",
            f"Brand: {mandate.get('brand_name')}  |  Topic: {mandate.get('topic')}",
            f"Audience: {mandate.get('audience')}  |  Tone: {mandate.get('tone')}  |  Location: {mandate.get('location')}",
            "",
        ]

    # Entity Coverage
    ec = context.get("entity_coverage") or {}
    if ec:
        lines += [
            "=== Entity Coverage ===",
            f"Score: {ec.get('score')}%  |  Total expected: {ec.get('total_expected')}",
            f"Found entities: {', '.join(ec.get('found') or []) or 'none'}",
            f"Missing entities: {', '.join(ec.get('missing') or []) or 'none'}",
            "",
        ]

    # AI Share of Voice
    ai_sov = context.get("ai_sov") or {}
    if ai_sov:
        lines += [
            "=== AI Share of Voice ===",
            f"Overall SOV: {ai_sov.get('overall_sov')}%  |  Tier: {ai_sov.get('visibility_tier')}",
            f"Brand known by AI models: {', '.join(ai_sov.get('brand_known_by_models') or []) or 'none'}",
        ]
        by_model = ai_sov.get("by_model") or {}
        for model, score in list(by_model.items())[:4]:
            lines.append(f"  {model}: {score}%")
        lines.append("")

    # SOV Trend
    trend = context.get("sov_trend") or []
    if trend:
        lines.append("=== AI SOV Trend (oldest → newest) ===")
        for s in trend:
            lines.append(f"  {s.get('date')}: SOV={s.get('overall_sov')}%  Tier={s.get('visibility_tier')}")
        lines.append("")

    # Competitor Mentions
    cm = context.get("competitor_mentions") or {}
    if cm:
        lines += [
            "=== Competitor Mentions ===",
            f"Brand SOV: {cm.get('brand_sov')}%  |  Brand mentions: {cm.get('brand_mentions')}  |  Brand sentiment: {cm.get('brand_sentiment')}",
        ]
        for c in cm.get("competitors") or []:
            lines.append(f"  {c.get('name')}: {c.get('mentions')} mentions  sentiment={c.get('sentiment')}")
        lines.append("")

    # Sentiment
    sent = context.get("sentiment") or {}
    if sent:
        dist = sent.get("distribution") or {}
        lines += [
            "=== Sentiment Tracking ===",
            f"Overall sentiment score: {sent.get('overall_score')} / 100",
            f"Distribution: positive={dist.get('positive')}  negative={dist.get('negative')}  neutral={dist.get('neutral')}",
            "",
        ]

    # Brand Analysis
    ba = context.get("brand_analysis") or {}
    if ba:
        lines += [
            "=== Brand Analysis ===",
            f"Brand: {ba.get('brand_name')}  |  Total mentions: {ba.get('total_mentions')}  |  Sentiment: {ba.get('sentiment_label')}",
        ]
        sources = ba.get("top_sources") or []
        if sources:
            lines.append(f"Top sources: {', '.join(str(s) for s in sources)}")
        lines.append("")

    # Ranking Analysis
    ra = context.get("ranking_analysis") or {}
    if ra:
        lines += [
            "=== Ranking Analysis ===",
            f"Avg accuracy: {ra.get('average_accuracy')}%  |  Avg sentiment: {ra.get('average_sentiment')}  |  Content quality: {ra.get('content_quality_overall')}",
            f"Entity coverage (ranking): {ra.get('entity_coverage_score')}%",
        ]
        missing = ra.get("missing_entities") or []
        if missing:
            lines.append(f"Missing entities (ranking): {', '.join(str(e) for e in missing)}")
        prompts = ra.get("top_prompts") or []
        if prompts:
            lines.append("Prompt rankings:")
            for p in prompts:
                lines.append(
                    f"  \"{p.get('prompt', '')}\" → rank={p.get('rank')}  accuracy={p.get('accuracy_score')}%  sentiment={p.get('sentiment_score')}"
                )
        lines.append("")

    # Tracked Prompts Recommendations
    tpr = context.get("tracked_prompt_recommendations") or {}
    if tpr:
        lines += [
            f"=== Tracked Prompts Recommendations (health score: {tpr.get('health_score')}) ===",
        ]
        if tpr.get("summary"):
            lines.append(f"Summary: {tpr['summary']}")
        for i, r in enumerate((tpr.get("recommendations") or [])[:8], 1):
            lines.append(
                f"  {i}. [{r.get('severity', '').upper()}] {r.get('title', '')}: {r.get('fix', '')[:200]}"
            )
        lines.append("")

    # SOV Recommendations
    sovr = context.get("sov_recommendations") or {}
    if sovr:
        lines += [
            f"=== SOV Recommendations (health score: {sovr.get('health_score')}) ===",
        ]
        if sovr.get("summary"):
            lines.append(f"Summary: {sovr['summary']}")
        for i, r in enumerate((sovr.get("recommendations") or [])[:8], 1):
            lines.append(
                f"  {i}. [{r.get('severity', '').upper()}] {r.get('title', '')}: {r.get('fix', '')[:200]}"
            )
        lines.append("")

    # Master Analysis
    ma = context.get("master_analysis") or {}
    if ma:
        mandate = ma.get("mandate") or {}
        lines += [
            "=== Multi-Model Brand Summary ===",
            f"Models tested: {ma.get('model_count')}",
            f"Brand mandate (AI-inferred): topic={mandate.get('topic')}  audience={mandate.get('audience')}",
        ]
        for m in ma.get("top_models") or []:
            lines.append(
                f"  {m.get('model')}: completeness={m.get('completeness_score')}  performance={m.get('model_wise_performance_score')}"
            )
        lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ASK AI FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

async def ask_module_e_ai(
    project_id: str,
    question: str,
    job_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Module E Ask AI.

    Args:
        project_id: The project to answer questions about.
        question: The user's natural language question.
        job_id: Optional specific run (defaults to latest).
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
                "I'm focused on helping you understand and improve your Module E "
                "brand intelligence results — things like your AI Share of Voice, "
                "content consistency, entity coverage, brand sentiment, ranking positions, "
                "and prioritised recommendations. I can't help with content creation or "
                "other topics outside this scope. "
                "Try asking: 'What is my AI SOV?' or 'Which competitors are beating me?'"
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
    system_instruction = f"""You are a senior Brand Intelligence analyst for Module E.
You write like an experienced consultant: direct, precise, professional.
No emojis. Avoid cheesy openings ("Hi there!", "Great question!").

The user's message includes a PROJECT DATA block from their latest stored Module E analysis.
Recommendations are sorted by priority (1 = most urgent) and severity (critical > warning > info).

=== PRODUCT GLOSSARY (use when explaining terms) ===
{GLOSSARY}

=== HOW TO RESPOND ===
1) ANSWER ONLY WHAT THEY ASKED. Do not paste a full executive summary or every metric
   unless they explicitly ask for an overview, summary, or "walk me through everything".
2) NARROW QUESTIONS GET NARROW ANSWERS. If they ask about AI SOV, focus on SOV.
   Do not also recite ranking analysis and entity coverage unless they explain SOV.
3) USE DATA AS EVIDENCE, NOT A DUMP. Cite specific numbers from PROJECT DATA only when
   they support your answer. Omit unrelated metrics entirely.
4) DEFINITIONS: use the glossary; tie in the user's actual numbers briefly when helpful.
5) RECOMMENDATIONS: when they want actions, anchor to SOV Recommendations or Tracked
   Prompts Recommendations (critical severity first). Do not invent generic tactics.
6) TONE: calm, expert, concise. Short paragraphs. Bullets only when comparing items or
   listing requested actions. One tight paragraph is fine when that suffices.
7) NEVER invent facts. If something is missing from PROJECT DATA, say so plainly.
8) OUTPUT FORMAT (Markdown for in-app chat UI): Use **bold** labels, ### short headings,
   numbered lists for ranked priorities, bullet lists for parallel points.
   Put metric names in backticks (e.g. `overall_sov`, `content_consistency_score`).
   Synthesize numbers into sentences; avoid raw key:value dumps.

If the question is vague ("thoughts?", "what do you think?"), ask one clarifying line OR
offer two or three specific angles they could explore — do not dump all sections."""

    # Step 4 — Build messages
    messages: List[Dict[str, str]] = []

    if conversation_history:
        messages.extend(conversation_history[-4:])

    emphasis = {
        "explain": "They may mainly want definitions tied to their numbers.",
        "recommend": "They may mainly want actionable next steps from SOV or tracked-prompt recommendations.",
        "interpret": "They may mainly want interpretation of their brand intelligence metrics.",
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
            task_name="module_e_ask_ai",
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
        logger.error(f"Module E Ask AI call failed: {e}")
        answer = (
            "I couldn't generate an answer right now. "
            "Please try again in a moment."
        )

    # Step 6 — Sources
    sources: List[str] = []
    ai_sov = context.get("ai_sov") or {}
    if ai_sov.get("overall_sov") is not None:
        sources.append(f"AI SOV: {ai_sov['overall_sov']}% ({ai_sov.get('visibility_tier')})")
    cc = context.get("content_consistency") or {}
    if cc.get("score") is not None:
        sources.append(f"Content consistency: {cc['score']}")
    ec = context.get("entity_coverage") or {}
    if ec.get("score") is not None:
        sources.append(f"Entity coverage: {ec['score']}%")
    sent = context.get("sentiment") or {}
    if sent.get("overall_score") is not None:
        sources.append(f"Sentiment score: {sent['overall_score']}")
    sovr = context.get("sov_recommendations") or {}
    tpr = context.get("tracked_prompt_recommendations") or {}
    total_recs = len(sovr.get("recommendations") or []) + len(tpr.get("recommendations") or [])
    if total_recs:
        sources.append(f"{total_recs} total recommendations")

    # Step 7 — Log (non-critical)
    try:
        mongo_manager.db.module_e_ask_ai_log.insert_one({
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
            "overall_sov": ai_sov.get("overall_sov"),
            "visibility_tier": ai_sov.get("visibility_tier"),
            "content_consistency_score": cc.get("score"),
            "entity_coverage_score": ec.get("score"),
            "sentiment_score": sent.get("overall_score"),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTED QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

def get_suggested_questions(project_id: str) -> List[str]:
    """
    Returns data-driven suggested questions from the latest Module E run,
    with a generic fallback so chips are always useful.
    """
    fallback = [
        "Summarize my brand intelligence results in plain language.",
        "What is my AI Share of Voice and what's driving it?",
        "Which competitors are appearing more than me in AI responses?",
        "What should I prioritize first to improve my brand visibility?",
    ]

    try:
        mongo_manager.connect()
        doc = mongo_manager.module_e.find_one(
            {"jobId": project_id},
            sort=[("updatedAt", -1)],
            projection={
                "ai_share_of_voice": 1,
                "ai_sov_history": 1,
                "content_consistency": 1,
                "entity_coverage": 1,
                "sentiment_tracking": 1,
                "competitor_mentions": 1,
                "ranking_analysis": 1,
                "sov_recommendations": 1,
            },
        )
        if not doc:
            return fallback

        dynamic: List[str] = []

        # AI SOV chip
        ai_sov = doc.get("ai_share_of_voice") or {}
        sov = ai_sov.get("overall_sov")
        tier = ai_sov.get("visibility_tier", "")
        if sov is not None:
            dynamic.append(f"My AI SOV is {sov}% (tier: {tier}). What does that mean and how do I improve it?")
        if sov is not None and sov < 20:
            dynamic.append("My AI SOV is very low — what are the critical steps to get my brand cited more?")

        # SOV trend chip
        history = doc.get("ai_sov_history") or []
        if len(history) >= 2:
            prev = history[-2].get("overall_sov", 0)
            latest = history[-1].get("overall_sov", 0)
            if latest < prev:
                dynamic.append(f"My SOV dropped from {prev}% to {latest}% — what changed?")
            elif latest > prev:
                dynamic.append(f"My SOV improved from {prev}% to {latest}% — what drove that?")

        # Competitor chip
        cm = doc.get("competitor_mentions") or {}
        data_rows = cm.get("data") or []
        if len(data_rows) > 1:
            top_comp = data_rows[1].get("name", "")
            top_mentions = data_rows[1].get("mentions", 0)
            brand_mentions = data_rows[0].get("mentions", 0)
            if top_comp and top_mentions > brand_mentions:
                dynamic.append(f"{top_comp} has more AI mentions than us ({top_mentions} vs {brand_mentions}). How do we close that gap?")

        # Entity coverage chip
        ec = doc.get("entity_coverage") or {}
        missing = ec.get("missing") or []
        if missing:
            dynamic.append(f"I'm missing {len(missing)} expected entities — which ones matter most?")

        # Content consistency chip
        cc = doc.get("content_consistency") or {}
        cc_score = cc.get("score")
        if cc_score is not None and cc_score < 50:
            dynamic.append(f"My content consistency score is {cc_score} — why is it low and what should I fix?")

        # Sentiment chip
        sentiment = doc.get("sentiment_tracking") or {}
        sent_score = sentiment.get("overall_score")
        if sent_score is not None and sent_score < 50:
            dynamic.append(f"My sentiment score is {sent_score} — what's driving negative sentiment?")

        # Ranking chip
        ranking = doc.get("ranking_analysis") or {}
        rpp = ranking.get("ranking_position_per_prompt") or []
        low_rank = [r for r in rpp if r.get("rank") and r.get("rank") > 3]
        if low_rank:
            p0 = str(low_rank[0].get("prompt", ""))[:80].strip()
            if p0:
                dynamic.append(f'I rank poorly on "{p0}…" — what content changes would improve my position?')

        # Top SOV recommendation chip
        sovr = doc.get("sov_recommendations") or {}
        sov_recs = sorted(sovr.get("recommendations") or [], key=lambda x: x.get("priority", 99))
        if sov_recs:
            t0 = str(sov_recs[0].get("title", "")).strip()
            if t0:
                dynamic.append(f'My top SOV recommendation is "{t0}" — explain why and how to execute it.')

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