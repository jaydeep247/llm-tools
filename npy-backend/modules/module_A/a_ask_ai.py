# a_ask_ai.py
#
# Module A — Ask AI
#
# A project-scoped assistant that answers any question about Module A data.
#
# Flow:
#   1. Load the latest Module A crawl data from MongoDB (pages + fields
#      collections) into one context pack — same snapshot for every question.
#   2. Context covers: crawl summary, page health scores, SEO issues,
#      keyword metrics (volume, KD, CPC), performance rankings, content
#      word-count gaps, backlink metrics, and page-level recommendations.
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

logger = logging.getLogger("module_a_ask_ai")

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
=== Module A / SEO Crawl & Content Audit Glossary ===

Health Score (0–100): Per-page SEO health. Starts at 100 and loses points for
each recommendation issue found. Weighted by severity:
  critical  → -20 pts each  (indexability, broken pages, missing titles)
  warning   → -8 pts each   (thin content, missing H1, slow page speed)
  info      → -3 pts each   (minor meta gaps, Open Graph, viewport)

Recommendation Categories (ordered by SEO impact):
  1. Indexability      — page is invisible to Google until fixed (404, noindex, wrong canonical)
  2. Titles & Meta     — missing or duplicate title/meta affects SERP CTR
  3. Heading Structure — primary keyword signal (H1 missing or mismatched)
  4. Content           — thin or duplicate content hurts rankings
  5. Structured Data   — required for rich result eligibility
  6. Page Speed        — Core Web Vitals ranking factor
  7. Open Graph        — social sharing CTR (not a direct ranking factor)
  8. Security / Mobile — mixed content, missing viewport

Page Metrics (page_matrix): Per-page crawl data.
  status_code      — HTTP status (200, 301, 404, 500, etc.)
  indexable        — whether Google can index this page
  word_count       — total words on the page
  title            — <title> tag content
  h1               — first H1 heading
  canonical_url    — declared canonical (should match or redirect to itself)
  meta_description — meta description tag
  page_speed_ms    — server response time in milliseconds
  internal_links   — count of internal links pointing to this page

Keyword Metrics (keyword_metrics): SEO keyword data per page.
  main_keyword     — the primary keyword this page targets
  volume_global    — global monthly search volume
  volume_us        — US monthly search volume
  kd_us            — keyword difficulty 0–100 (higher = harder to rank)
  cpc_usd          — cost-per-click in USD (indicates commercial value)

Performance Metrics (performance_metrics): SERP ranking data.
  currentRanking      — current Google ranking position for main keyword
  overallKeywords     — total keywords the page ranks for
  firstPageKeywords   — keywords ranking on page 1 (positions 1–10)

Content Metrics (content_matrix): Word count gap vs SERP competitors.
  currentWordCount    — current word count on the page
  serpIntentWordCount — average word count of top-ranking competitor pages
  needToAddWordCount  — words to add to be competitive (serpIntent - current)

Backlink Metrics (backlink_metrics): Link authority data.
  internal_links         — inbound internal links from other site pages
  external_outlinks      — links from this page to external sites
  pr_score               — PageRank-style authority score
  current_ref_domains    — number of unique referring domains (backlinks)
  need_to_acquire_ref_domains — gap vs competitor backlink count
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
        "health score", "indexable", "canonical", "page speed", "kd", "cpc",
        "word count", "backlink", "referring domain", "page rank", "serp",
        "keyword difficulty", "first page", "structured data", "open graph",
        "e-e-a-t", "eeat", "core web vitals", "meta description",
    ]
    if any(p in q for p in explain_patterns):
        return "explain"

    recommend_patterns = [
        "what should", "how to improve", "how can i", "what can i do",
        "recommend", "suggestions", "next step", "action", "fix", "improve",
        "increase", "boost", "better", "priority", "top 3", "first thing",
        "what do i do", "help me", "strategy", "plan", "worst", "biggest issue",
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
            "Hello. Ask a specific question about your Module A analysis — for example "
            "your site health score, pages with critical issues, keyword opportunities, "
            "content gaps, backlink status, or your top SEO priorities."
        )

    if re.match(r"^(hi|hey|hello|yo|sup|hiya|heya)\s*$", q2) or q2 in ("hi", "hey", "hello", "yo", "sup"):
        return (
            "Hello. I answer focused questions using your latest Module A crawl and SEO audit data. "
            "What do you want to know — site health, page issues, keywords, performance, or recommendations?"
        )

    if re.match(r"^(hi|hey|hello)\s+there\s*$", q2):
        return (
            "Hello. Pose a concrete question (for example: which pages have critical issues, "
            "what keywords am I missing, or what should I fix first) and I will respond "
            "from your stored crawl data."
        )

    if re.match(r"^good\s+(morning|afternoon|evening)\b", q2) and len(q2) < 40:
        return (
            "Hello. How can I help with your Module A SEO audit — pick a topic "
            "(site health, critical pages, keyword gaps, or top actions) and ask directly."
        )

    if re.match(r"^(thanks|thank you|thx|ty|cheers)\b", q2) and len(q2) < 48:
        return "You are welcome. Ask another question whenever you need clarity on your Module A data."

    if q2 in ("ok", "okay", "k", "kk", "got it", "cool", "nice", "alright"):
        return "Understood. What should we look at next in your SEO audit?"

    return None


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT LOADER
# ─────────────────────────────────────────────────────────────────────────────

def _load_context_pack(
    project_id: str,
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Loads Module A crawl data from MongoDB (pages + fields collections)
    and returns a structured context pack for Claude to reason over.

    We aggregate site-wide stats plus the worst/best pages so Claude can
    answer questions about both the overall site and specific pages.
    """
    context: Dict[str, Any] = {}

    try:
        mongo_manager.connect()
        effective_job_id = job_id or project_id

        # ── Site-level summary from pages collection ───────────────────────
        total_pages = mongo_manager.pages.count_documents({"jobId": effective_job_id})
        if total_pages == 0:
            # Try project_id as fallback key name
            total_pages = mongo_manager.pages.count_documents({"projectId": effective_job_id})
            if total_pages == 0:
                return {"error": "No Module A crawl data found for this project. Run a crawl first."}

        context["job_id"] = effective_job_id
        context["total_pages_crawled"] = total_pages

        # Status code breakdown
        pipeline_status = [
            {"$match": {"jobId": effective_job_id}},
            {"$group": {"_id": "$status_code", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        status_breakdown: Dict[str, int] = {}
        for row in mongo_manager.pages.aggregate(pipeline_status):
            code = str(row.get("_id") or "unknown")
            status_breakdown[code] = row.get("count", 0)
        context["status_breakdown"] = status_breakdown

        # Indexability
        indexable_count = mongo_manager.pages.count_documents(
            {"jobId": effective_job_id, "indexable": True}
        )
        non_indexable_count = total_pages - indexable_count
        context["indexable_pages"] = indexable_count
        context["non_indexable_pages"] = non_indexable_count

        # ── Fields collection — aggregated metrics ─────────────────────────
        field_docs = list(
            mongo_manager.fields.find(
                {"jobId": effective_job_id},
                {
                    "_id": 0,
                    "url": 1,
                    "main_keyword": 1,
                    "volume_global": 1,
                    "volume_us": 1,
                    "kd_us": 1,
                    "cpc_usd": 1,
                    "page_matrix": 1,
                    "content_matrix": 1,
                    "performance_metrics": 1,
                    "backlink_metrics": 1,
                    "recommendations": 1,
                },
            )
        )

        if not field_docs:
            # Try to get basic page data even without enrichment
            context["note"] = "Content audit metrics not yet run. Only crawl summary available."
            _load_pages_fallback(context, effective_job_id)
            return context

        # ── Health scores ─────────────────────────────────────────────────
        health_scores = []
        critical_pages = []
        low_health_pages = []

        for doc in field_docs:
            recs = doc.get("recommendations") or {}
            hs = recs.get("health_score")
            if hs is None:
                # Compute from page_matrix basic signals if not stored
                pm = doc.get("page_matrix") or {}
                hs = pm.get("health_score")  # some runners store it here

            url = doc.get("url", "")
            if hs is not None:
                health_scores.append(hs)
                rec_list = recs.get("recommendations") or []
                critical_count = sum(1 for r in rec_list if r.get("severity") == "critical")
                if critical_count > 0 or hs < 40:
                    critical_pages.append({
                        "url": url[:100],
                        "health_score": hs,
                        "critical_issues": critical_count,
                        "top_issue": (rec_list[0].get("title") if rec_list else None),
                    })
                if hs < 60:
                    low_health_pages.append({"url": url[:100], "health_score": hs})

        if health_scores:
            context["avg_health_score"] = round(sum(health_scores) / len(health_scores), 1)
            context["min_health_score"] = min(health_scores)
            context["max_health_score"] = max(health_scores)
            context["pages_below_60"] = sum(1 for s in health_scores if s < 60)
            context["pages_below_40"] = sum(1 for s in health_scores if s < 40)

        # Top 5 worst pages by health score
        critical_pages.sort(key=lambda x: x.get("health_score", 100))
        context["worst_pages"] = critical_pages[:5]

        # ── Aggregated recommendations across site ─────────────────────────
        all_recommendations: List[Dict] = []
        rec_summary: Dict[str, int] = {"total": 0, "critical": 0, "warning": 0, "info": 0}
        category_counts: Dict[str, int] = {}

        for doc in field_docs:
            recs_doc = doc.get("recommendations") or {}
            rec_list = recs_doc.get("recommendations") or []
            for r in rec_list:
                sev = r.get("severity", "info")
                rec_summary["total"] += 1
                rec_summary[sev] = rec_summary.get(sev, 0) + 1
                cat = r.get("category", "Other")
                category_counts[cat] = category_counts.get(cat, 0) + 1
                # Keep top critical recommendations (deduped by title)
                if sev == "critical" and len(all_recommendations) < 10:
                    all_recommendations.append({
                        "url": doc.get("url", "")[:80],
                        "title": r.get("title"),
                        "category": cat,
                        "fix": (r.get("fix") or "")[:150],
                    })

        context["site_recommendations_summary"] = rec_summary
        context["issues_by_category"] = dict(
            sorted(category_counts.items(), key=lambda x: x[1], reverse=True)
        )
        context["top_critical_issues"] = all_recommendations[:8]

        # ── Keyword metrics — top opportunities ───────────────────────────
        keyword_pages = [
            d for d in field_docs
            if d.get("main_keyword") and d.get("volume_global") is not None
        ]
        keyword_pages.sort(key=lambda x: (x.get("volume_global") or 0), reverse=True)
        context["top_keyword_pages"] = [
            {
                "url": d.get("url", "")[:80],
                "keyword": d.get("main_keyword"),
                "volume_global": d.get("volume_global"),
                "kd_us": d.get("kd_us"),
                "cpc_usd": d.get("cpc_usd"),
                "current_rank": (d.get("performance_metrics") or {}).get("currentRanking"),
            }
            for d in keyword_pages[:6]
        ]

        # ── Content gaps — pages needing more words ───────────────────────
        content_gap_pages = []
        for d in field_docs:
            cm = d.get("content_matrix") or {}
            gap = cm.get("needToAddWordCount")
            if gap and gap > 200:
                content_gap_pages.append({
                    "url": d.get("url", "")[:80],
                    "current_words": cm.get("currentWordCount"),
                    "serp_target": cm.get("serpIntentWordCount"),
                    "words_to_add": gap,
                })
        content_gap_pages.sort(key=lambda x: x.get("words_to_add", 0), reverse=True)
        context["content_gap_pages"] = content_gap_pages[:5]

        # ── Performance — ranking opportunities ───────────────────────────
        ranking_pages = []
        for d in field_docs:
            pm = d.get("performance_metrics") or {}
            rank = pm.get("currentRanking")
            if rank and 4 <= rank <= 20:  # close to page 1 or first positions
                ranking_pages.append({
                    "url": d.get("url", "")[:80],
                    "keyword": d.get("main_keyword"),
                    "current_rank": rank,
                    "first_page_keywords": pm.get("firstPageKeywords"),
                    "overall_keywords": pm.get("overallKeywords"),
                })
        ranking_pages.sort(key=lambda x: x.get("current_rank", 99))
        context["ranking_opportunities"] = ranking_pages[:5]

        # ── Backlink summary ──────────────────────────────────────────────
        pages_needing_links = []
        for d in field_docs:
            bm = d.get("backlink_metrics") or {}
            need = bm.get("need_to_acquire_ref_domains")
            if need and need > 0:
                pages_needing_links.append({
                    "url": d.get("url", "")[:80],
                    "current_ref_domains": bm.get("current_ref_domains"),
                    "need_to_acquire": need,
                    "pr_score": bm.get("pr_score"),
                })
        pages_needing_links.sort(key=lambda x: x.get("need_to_acquire", 0), reverse=True)
        context["backlink_gaps"] = pages_needing_links[:5]

    except Exception as e:
        logger.error(f"Failed to load Module A context: {e}")
        return {"error": f"Failed to load Module A data: {e}"}

    return context


def _load_pages_fallback(context: Dict[str, Any], job_id: str) -> None:
    """Loads basic page data when fields collection is not yet populated."""
    try:
        pages = list(
            mongo_manager.pages.find(
                {"jobId": job_id},
                {"_id": 0, "url": 1, "status_code": 1, "indexable": 1, "word_count": 1, "title": 1},
                limit=10,
            )
        )
        context["sample_pages"] = [
            {
                "url": p.get("url", "")[:100],
                "status_code": p.get("status_code"),
                "indexable": p.get("indexable"),
                "word_count": p.get("word_count"),
            }
            for p in pages
        ]
    except Exception:
        pass


def _build_context_summary(context: Dict[str, Any]) -> str:
    """Converts the context dict into a clean text block for Claude."""
    if context.get("error"):
        return f"ERROR: {context['error']}"

    lines = [
        "=== Module A SEO Crawl & Content Audit ===",
        f"Job ID: {context.get('job_id', 'unknown')}",
        f"Total pages crawled: {context.get('total_pages_crawled', 0)}",
        "",
    ]

    # Status breakdown
    status = context.get("status_breakdown") or {}
    if status:
        lines.append("=== HTTP Status Code Breakdown ===")
        for code, count in sorted(status.items()):
            lines.append(f"  {code}: {count} pages")
        lines.append("")

    # Indexability
    lines += [
        "=== Indexability ===",
        f"Indexable: {context.get('indexable_pages')}  |  Non-indexable: {context.get('non_indexable_pages')}",
        "",
    ]

    # Health scores
    if context.get("avg_health_score") is not None:
        lines += [
            "=== Site Health Scores ===",
            f"Average health score: {context.get('avg_health_score')} / 100",
            f"Lowest: {context.get('min_health_score')}  |  Highest: {context.get('max_health_score')}",
            f"Pages below 60 (needs improvement): {context.get('pages_below_60')}",
            f"Pages below 40 (critical): {context.get('pages_below_40')}",
            "",
        ]

    # Recommendations summary
    rec_sum = context.get("site_recommendations_summary") or {}
    if rec_sum.get("total"):
        lines += [
            "=== Site-Wide Issues Summary ===",
            f"Total issues: {rec_sum.get('total')}  "
            f"(Critical: {rec_sum.get('critical', 0)}, Warning: {rec_sum.get('warning', 0)}, Info: {rec_sum.get('info', 0)})",
        ]
        by_cat = context.get("issues_by_category") or {}
        if by_cat:
            lines.append("Issues by category:")
            for cat, cnt in list(by_cat.items())[:8]:
                lines.append(f"  {cat}: {cnt}")
        lines.append("")

    # Worst pages
    worst = context.get("worst_pages") or []
    if worst:
        lines.append("=== Worst Pages by Health Score ===")
        for p in worst:
            lines.append(
                f"  {p.get('url')}  health={p.get('health_score')}  "
                f"critical_issues={p.get('critical_issues')}  "
                f"top_issue={p.get('top_issue')}"
            )
        lines.append("")

    # Top critical issues
    crit = context.get("top_critical_issues") or []
    if crit:
        lines.append("=== Top Critical Issues Across Site ===")
        for i, r in enumerate(crit, 1):
            lines.append(
                f"  {i}. [{r.get('category')}] {r.get('title')}  ({r.get('url')})"
                f"\n     Fix: {r.get('fix')}"
            )
        lines.append("")

    # Keyword opportunities
    kw = context.get("top_keyword_pages") or []
    if kw:
        lines.append("=== Top Keyword Opportunities (by search volume) ===")
        for p in kw:
            rank_str = f"  rank={p.get('current_rank')}" if p.get("current_rank") else ""
            lines.append(
                f"  {p.get('url')}\n"
                f"    keyword=\"{p.get('keyword')}\"  vol_global={p.get('volume_global')}  "
                f"kd={p.get('kd_us')}  cpc=${p.get('cpc_usd')}{rank_str}"
            )
        lines.append("")

    # Content gaps
    gaps = context.get("content_gap_pages") or []
    if gaps:
        lines.append("=== Content Word-Count Gaps (add words to compete on SERP) ===")
        for p in gaps:
            lines.append(
                f"  {p.get('url')}  current={p.get('current_words')} words  "
                f"serp_target={p.get('serp_target')}  need_to_add={p.get('words_to_add')}"
            )
        lines.append("")

    # Ranking opportunities
    ranks = context.get("ranking_opportunities") or []
    if ranks:
        lines.append("=== Ranking Opportunities (positions 4–20, close to page 1) ===")
        for p in ranks:
            lines.append(
                f"  {p.get('url')}  keyword=\"{p.get('keyword')}\"  "
                f"rank={p.get('current_rank')}  p1_keywords={p.get('first_page_keywords')}"
            )
        lines.append("")

    # Backlink gaps
    bl = context.get("backlink_gaps") or []
    if bl:
        lines.append("=== Backlink Gaps (pages needing more referring domains) ===")
        for p in bl:
            lines.append(
                f"  {p.get('url')}  current_ref_domains={p.get('current_ref_domains')}  "
                f"need_to_acquire={p.get('need_to_acquire')}  pr_score={p.get('pr_score')}"
            )
        lines.append("")

    # Fallback sample pages
    sample = context.get("sample_pages") or []
    if sample:
        lines.append("=== Sample Pages (metrics not yet computed) ===")
        for p in sample:
            lines.append(
                f"  {p.get('url')}  status={p.get('status_code')}  "
                f"indexable={p.get('indexable')}  words={p.get('word_count')}"
            )
        lines.append("")

    if context.get("note"):
        lines.append(f"Note: {context['note']}")
        lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ASK AI FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

async def ask_module_a_ai(
    project_id: str,
    question: str,
    job_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Main entry point for Module A Ask AI.

    Args:
        project_id: The project to answer questions about.
        question: The user's natural language question.
        job_id: Optional specific crawl job (defaults to project_id).
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
                "I'm focused on helping you understand and improve your Module A "
                "SEO crawl and content audit results — things like site health scores, "
                "critical page issues, keyword opportunities, content word-count gaps, "
                "backlink metrics, and page-level recommendations. "
                "I can't help with content creation or other topics outside this scope. "
                "Try asking: 'Which pages have critical issues?' or 'What should I fix first?'"
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
    system_instruction = f"""You are a senior SEO and technical audit analyst for Module A.
You write like an experienced consultant: direct, precise, professional.
No emojis. Avoid cheesy openings ("Hi there!", "Great question!").

The user's message includes a PROJECT DATA block from their latest stored Module A crawl
and content audit. Recommendations are ordered by SEO impact (critical → warning → info).

=== PRODUCT GLOSSARY (use when explaining terms) ===
{GLOSSARY}

=== HOW TO RESPOND ===
1) ANSWER ONLY WHAT THEY ASKED. Do not paste a full site audit or every metric
   unless they explicitly ask for an overview, summary, or "walk me through everything".
2) NARROW QUESTIONS GET NARROW ANSWERS. If they ask about keyword difficulty, focus on KD.
   Do not also recite backlink gaps and content word counts unless they support the answer.
3) USE DATA AS EVIDENCE, NOT A DUMP. Cite specific numbers from PROJECT DATA only when
   they support your answer. Omit unrelated metrics entirely.
4) DEFINITIONS: use the glossary; tie in the user's actual numbers when helpful.
5) RECOMMENDATIONS: when they want actions, anchor to Critical issues first (priority 1–2),
   then Warning, then Info. Be specific about which URL and what to fix.
6) TONE: calm, expert, concise. Short paragraphs. Bullets only when comparing items or
   listing requested actions. One tight paragraph is fine when that suffices.
7) NEVER invent facts. If something is missing from PROJECT DATA, say so plainly.
8) OUTPUT FORMAT (Markdown for in-app chat UI): Use **bold** labels, ### short headings,
   numbered lists for ranked priorities, bullet lists for parallel points.
   Put metric names in backticks (e.g. `health_score`, `kd_us`, `currentRanking`).
   Synthesize numbers into sentences; avoid raw key:value dumps.

If the question is vague ("thoughts?", "what do you think?"), ask one clarifying line OR
offer two or three specific angles they could explore — do not dump all sections."""

    # Step 4 — Build messages
    messages: List[Dict[str, str]] = []

    if conversation_history:
        messages.extend(conversation_history[-4:])

    emphasis = {
        "explain": "They may mainly want definitions tied to their site data.",
        "recommend": "They may mainly want actionable next steps — critical issues first.",
        "interpret": "They may mainly want interpretation of their crawl and audit metrics.",
    }.get(question_type, "")

    user_message = f"""PROJECT DATA:
{context_summary}

Routing hint (optional): {emphasis or "none — infer from the question only"}

The user's message to answer (respond to this specifically; no unsolicited full-site recap):
{question}"""

    messages.append({"role": "user", "content": user_message})

    # Step 5 — Call Claude
    try:
        resp = await execute_task(
            task_name="a_ask_ai",
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
        logger.error(f"Module A Ask AI call failed: {e}")
        answer = (
            "I couldn't generate an answer right now. "
            "Please try again in a moment."
        )

    # Step 6 — Sources
    sources: List[str] = []
    if context.get("total_pages_crawled"):
        sources.append(f"Pages crawled: {context['total_pages_crawled']}")
    if context.get("avg_health_score") is not None:
        sources.append(f"Avg health score: {context['avg_health_score']}")
    rec_sum = context.get("site_recommendations_summary") or {}
    if rec_sum.get("critical"):
        sources.append(f"Critical issues: {rec_sum['critical']}")
    if context.get("content_gap_pages"):
        sources.append(f"{len(context['content_gap_pages'])} content gap pages")

    # Step 7 — Log (non-critical)
    try:
        mongo_manager.db.a_ask_ai_log.insert_one({
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
            "total_pages": context.get("total_pages_crawled"),
            "avg_health_score": context.get("avg_health_score"),
            "critical_issues": rec_sum.get("critical"),
            "pages_below_60": context.get("pages_below_60"),
            "indexable_pages": context.get("indexable_pages"),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUGGESTED QUESTIONS
# ─────────────────────────────────────────────────────────────────────────────

def get_suggested_questions(project_id: str) -> List[str]:
    """
    Returns data-driven suggested questions from the latest Module A crawl,
    with a generic fallback so chips are always useful.
    """
    fallback = [
        "Summarize my site SEO health in plain language.",
        "Which pages have the most critical issues?",
        "What are my best keyword opportunities?",
        "What should I prioritize to improve my rankings?",
    ]

    try:
        mongo_manager.connect()
        effective_job_id = project_id

        total = mongo_manager.pages.count_documents({"jobId": effective_job_id})
        if total == 0:
            return fallback

        dynamic: List[str] = []

        # Status code chip
        broken = mongo_manager.pages.count_documents(
            {"jobId": effective_job_id, "status_code": {"$in": [404, 410, 500, 503]}}
        )
        if broken:
            dynamic.append(f"I have {broken} broken or error pages — which ones are most important to fix?")

        # Non-indexable chip
        non_idx = mongo_manager.pages.count_documents(
            {"jobId": effective_job_id, "indexable": False}
        )
        if non_idx:
            dynamic.append(f"{non_idx} pages are not indexable — which should I fix and which are intentional?")

        # Health score chips from fields
        field_sample = list(
            mongo_manager.fields.find(
                {"jobId": effective_job_id},
                {"_id": 0, "url": 1, "recommendations": 1, "main_keyword": 1,
                 "volume_global": 1, "kd_us": 1, "content_matrix": 1, "performance_metrics": 1},
                limit=100,
            )
        )

        low_health = [
            d for d in field_sample
            if (d.get("recommendations") or {}).get("health_score", 100) < 50
        ]
        if low_health:
            dynamic.append(
                f"{len(low_health)} pages have a health score below 50 — what are the common issues?"
            )

        # Worst single page
        worst = min(
            field_sample,
            key=lambda d: (d.get("recommendations") or {}).get("health_score", 100),
            default=None,
        )
        if worst:
            hs = (worst.get("recommendations") or {}).get("health_score")
            if hs is not None and hs < 60:
                url_short = worst.get("url", "")[:60]
                dynamic.append(f'My page "{url_short}…" has a health score of {hs} — what\'s wrong and how do I fix it?')

        # Keyword opportunity
        high_vol = sorted(
            [d for d in field_sample if d.get("volume_global") and d.get("kd_us") and d.get("kd_us") < 40],
            key=lambda d: d.get("volume_global", 0),
            reverse=True,
        )
        if high_vol:
            kw = high_vol[0].get("main_keyword", "")
            vol = high_vol[0].get("volume_global")
            dynamic.append(f'My keyword "{kw}" has {vol} monthly searches — how do I improve that page\'s ranking?')

        # Content gap chip
        big_gaps = [
            d for d in field_sample
            if (d.get("content_matrix") or {}).get("needToAddWordCount", 0) > 300
        ]
        if big_gaps:
            dynamic.append(
                f"{len(big_gaps)} pages need significant content additions to match SERP competitors — which should I tackle first?"
            )

        # Ranking opportunity chip
        near_p1 = [
            d for d in field_sample
            if 4 <= ((d.get("performance_metrics") or {}).get("currentRanking") or 99) <= 15
        ]
        if near_p1:
            p = near_p1[0]
            rank = (p.get("performance_metrics") or {}).get("currentRanking")
            kw = p.get("main_keyword", "")
            dynamic.append(f'I rank #{rank} for "{kw}" — what do I need to reach page 1?')

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