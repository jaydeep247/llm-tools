"""
Module E — Recommendations Engine
==================================
Generates prioritized, actionable improvement recommendations for three
Brand Intelligence sub-sections:

  1. Tracked Prompts  — based on ranking_analysis.ranking_position_per_prompt
  2. Citations Tracker — based on citation data inside ranking_analysis
  3. Share of Voice   — based on ai_share_of_voice + competitor_mentions

Recommendation structure mirrors module_A's engine:
  {
    priority        : int         (1 = most urgent)
    category        : str         ("Tracked Prompts" | "Citations Tracker" | "Share of Voice")
    severity        : str         ("critical" | "warning" | "info")
    title           : str
    issue           : str         (current problem description)
    fix             : str         (concrete step to take)
    impact          : str         (expected outcome once fixed)
    fields_affected : List[str]   (mongo field paths this maps to)
  }
"""

from typing import Any, Dict, List, Optional

# ─── Severity weights (used for health score) ───────────────────────────────
SEVERITY_CRITICAL = "critical"
SEVERITY_WARNING  = "warning"
SEVERITY_INFO     = "info"

SEVERITY_WEIGHT: Dict[str, int] = {
    SEVERITY_CRITICAL: 20,
    SEVERITY_WARNING:  8,
    SEVERITY_INFO:     3,
}


def _rec(
    priority: int,
    category: str,
    severity: str,
    title: str,
    issue: str,
    fix: str,
    impact: str,
    fields: List[str],
) -> Dict[str, Any]:
    """Build a single recommendation dict."""
    return {
        "priority": priority,
        "category": category,
        "severity": severity,
        "title": title,
        "issue": issue,
        "fix": fix,
        "impact": impact,
        "fields_affected": fields,
    }


def _health_score(recommendations: List[Dict[str, Any]]) -> int:
    """Return 0-100 health score. Starts at 100 and deducts per severity."""
    deduction = sum(SEVERITY_WEIGHT[r["severity"]] for r in recommendations)
    return max(0, 100 - deduction)


# ═══════════════════════════════════════════════════════════════════════════
# 1. TRACKED PROMPTS RECOMMENDATIONS
# ═══════════════════════════════════════════════════════════════════════════

def generate_tracked_prompts_recommendations(
    ranking_analysis: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Analyse ranking_analysis and generate improvement recommendations
    for the Tracked Prompts section.

    Inputs used:
      - ranking_position_per_prompt  (list of per-prompt-model rows)
      - generated_prompts            (list of prompt strings)
      - content_quality.overall_score
      - entity_coverage.score / missing_entities
    """
    recs: List[Dict[str, Any]] = []

    if not ranking_analysis:
        return None

    rows: List[Dict[str, Any]] = ranking_analysis.get("ranking_position_per_prompt", [])
    prompts: List[str] = ranking_analysis.get("generated_prompts", [])
    content_quality_score: float = ranking_analysis.get("content_quality", {}).get("overall_score", 0.0)
    entity_score: float = ranking_analysis.get("entity_coverage", {}).get("score", 0.0)
    missing_entities: List[str] = ranking_analysis.get("entity_coverage", {}).get("missing_entities", [])

    # Guard: analysis hasn't produced real data yet
    if not rows and not prompts:
        return None

    total_rows   = len(rows)
    cited_rows   = [r for r in rows if r.get("citation_matched")]
    mentioned_rows = [r for r in rows if r.get("brand_text_mentioned") and not r.get("citation_matched")]
    not_mentioned = [r for r in rows if not r.get("citation_matched") and not r.get("brand_text_mentioned")]

    citation_rate = (len(cited_rows) / total_rows * 100) if total_rows > 0 else 0.0

    # ── Rule 1: No prompts at all ────────────────────────────────────────────
    if not prompts:
        recs.append(_rec(
            1, "Tracked Prompts", SEVERITY_CRITICAL,
            "No tracked prompts configured",
            "No prompts have been generated or tracked for this brand. AI ranking cannot be measured.",
            "Run a full Module E Ranking Analysis so the system auto-generates relevant "
            "prompts from your website content, or provide custom prompts via the API.",
            "Enables AI ranking visibility and citation tracking across models.",
            ["ranking_analysis.generated_prompts"],
        ))
        return {"recommendations": recs, "health_score": _health_score(recs), "summary": "Tracked prompts need to be configured."}

    # ── Rule 2: Zero citations across all prompts ────────────────────────────
    if total_rows > 0 and len(cited_rows) == 0:
        recs.append(_rec(
            1, "Tracked Prompts", SEVERITY_CRITICAL,
            "Brand not cited in any tracked prompt",
            f"Out of {total_rows} prompt-model combinations, the brand URL was never cited by "
            "any AI model. This means the brand has zero AI citation presence.",
            "Create dedicated landing pages that directly answer each tracked prompt. Use "
            "schema markup (FAQ, HowTo, Article) to help AI models identify your content as "
            "authoritative. Submit your sitemap to Google to improve indexing freshness.",
            "Brand starts appearing as a cited source in AI-generated responses.",
            ["ranking_analysis.ranking_position_per_prompt"],
        ))

    # ── Rule 3: Low citation rate (< 25%) ────────────────────────────────────
    elif citation_rate < 25 and total_rows >= 4:
        recs.append(_rec(
            1, "Tracked Prompts", SEVERITY_WARNING,
            f"Low citation rate ({citation_rate:.0f}% of prompts)",
            f"Only {len(cited_rows)} of {total_rows} prompt-model combinations cite the brand URL. "
            "Most tracked prompts are not resulting in brand citations.",
            "Audit the content pages that match each underperforming prompt. Ensure each page "
            "has a clear, concise answer to the prompt's question in the first 200 words. Add "
            "structured data and internal links from high-authority pages.",
            "Citation rate improves as AI models find your pages more relevant to tracked queries.",
            ["ranking_analysis.ranking_position_per_prompt", "ranking_analysis.percentile_by_prompt"],
        ))

    # ── Rule 4: Mentions but no link citations ───────────────────────────────
    if len(mentioned_rows) > len(cited_rows) and len(mentioned_rows) > 0:
        recs.append(_rec(
            2, "Tracked Prompts", SEVERITY_WARNING,
            "Brand mentioned in text but URL not cited",
            f"{len(mentioned_rows)} prompt-model rows mention the brand by name but do not "
            "include a URL citation. AI models know the brand but aren't linking to it.",
            "Increase your domain authority by building backlinks from industry publications, "
            "directories, and press releases. Ensure your brand name is consistent across all "
            "web mentions so AI models can reliably associate it with your domain.",
            "AI responses upgrade from text mentions to linked citations, driving organic referral traffic.",
            ["ranking_analysis.ranking_position_per_prompt"],
        ))

    # ── Rule 5: Not mentioned at all in some prompts ─────────────────────────
    if len(not_mentioned) > 0 and total_rows > 0:
        fraction = len(not_mentioned) / total_rows
        if fraction >= 0.5:
            severity = SEVERITY_WARNING
            pri = 2
        else:
            severity = SEVERITY_INFO
            pri = 3
        recs.append(_rec(
            pri, "Tracked Prompts", severity,
            f"Brand absent from {len(not_mentioned)} prompt-model combinations",
            f"The brand is completely absent (no text mention, no citation) in "
            f"{len(not_mentioned)} of {total_rows} prompt-model combinations.",
            "Create targeted blog posts, comparison pages, and use-case guides that naturally "
            "include the brand name in the context of each unanswered prompt topic.",
            "Brand starts appearing in AI model responses for a broader set of industry queries.",
            ["ranking_analysis.ranking_position_per_prompt"],
        ))

    # ── Rule 6: Low average content quality ─────────────────────────────────
    if content_quality_score < 50 and total_rows > 0:
        recs.append(_rec(
            2, "Tracked Prompts", SEVERITY_WARNING,
            f"Low content quality score ({content_quality_score:.0f}/100)",
            "AI models are citing the brand but the surrounding context is short or lacks depth. "
            "This reduces the authority signal that AI uses to rank citations higher.",
            "Expand cited pages with longer, structured content (minimum 800 words). Include "
            "statistics, examples, and FAQ sections so AI models have richer context to quote.",
            "Improves content quality score and citation position within AI responses.",
            ["ranking_analysis.content_quality"],
        ))
    elif content_quality_score < 70 and total_rows > 0:
        recs.append(_rec(
            3, "Tracked Prompts", SEVERITY_INFO,
            f"Content quality can be improved ({content_quality_score:.0f}/100)",
            "Cited content scores moderately on quality. There is room to make citations more "
            "detailed and authoritative.",
            "Enrich existing pages with multimedia, author bio, publish date, and citations to "
            "authoritative external sources. These signals help AI models treat your content as "
            "more reliable.",
            "Higher quality mentions in AI responses improve brand authority and CTR.",
            ["ranking_analysis.content_quality"],
        ))

    # ── Rule 7: Missing entities in content ─────────────────────────────────
    if entity_score < 60 and missing_entities:
        top_missing = missing_entities[:5]
        recs.append(_rec(
            2, "Tracked Prompts", SEVERITY_WARNING,
            f"Entity coverage gap ({entity_score:.0f}% — {len(missing_entities)} missing entities)",
            f"Your content does not mention key entities that AI models expect: "
            f"{', '.join(top_missing)}{'...' if len(missing_entities) > 5 else ''}.",
            "Add sections to your website that explicitly mention these missing entities. "
            "Link them to your core service pages. Consider adding a comprehensive "
            "'About' or 'Technology' page that covers all entity topics.",
            "Increases entity coverage score, making AI citations more contextually accurate.",
            ["ranking_analysis.entity_coverage"],
        ))
    elif entity_score < 80 and missing_entities:
        recs.append(_rec(
            3, "Tracked Prompts", SEVERITY_INFO,
            f"Minor entity coverage gaps ({entity_score:.0f}%)",
            f"{len(missing_entities)} expected entities are missing from AI-cited content.",
            "Weave missing entity mentions naturally into existing blog posts and product pages.",
            "Raises entity match rate for more accurate and comprehensive AI citations.",
            ["ranking_analysis.entity_coverage"],
        ))

    # ── Rule 8: Fewer than 3 prompts tracked ────────────────────────────────
    if len(prompts) < 3:
        recs.append(_rec(
            3, "Tracked Prompts", SEVERITY_INFO,
            "Expand tracked prompt coverage",
            f"Only {len(prompts)} prompt(s) are being tracked. A limited prompt set may miss "
            "important query patterns where your brand could rank.",
            "Add at least 5-10 diverse prompts covering different user intents: "
            "informational, comparative ('X vs Y'), transactional, and branded queries.",
            "Broader prompt coverage reveals more ranking opportunities and gaps.",
            ["ranking_analysis.generated_prompts"],
        ))

    recs.sort(key=lambda r: (r["priority"], SEVERITY_WEIGHT[r["severity"]] * -1))

    # Build summary
    if not recs:
        summary = "Tracked prompts are performing well. Maintain content freshness to sustain rankings."
    elif any(r["severity"] == SEVERITY_CRITICAL for r in recs):
        summary = "Critical issues detected. Brand has little or no AI citation presence."
    elif citation_rate >= 50:
        summary = f"Brand is cited in {citation_rate:.0f}% of prompts. Focus on improving citation depth and quality."
    else:
        summary = f"Brand citation rate is {citation_rate:.0f}%. Improve content targeting to raise visibility."

    return {
        "recommendations": recs,
        "health_score": _health_score(recs),
        "summary": summary,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 2. SHARE OF VOICE RECOMMENDATIONS
# ═══════════════════════════════════════════════════════════════════════════

def generate_sov_recommendations(
    ai_sov: Optional[Dict[str, Any]],
    competitor_mentions: Optional[Dict[str, Any]],
    sov_history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Generate improvement recommendations for the Share of Voice section.

    Inputs used:
      - ai_sov.overall_sov             (float %)
      - ai_sov.visibility_tier         (str)
      - ai_sov.brand_known_by_models   (List[str])
      - ai_sov.by_model                (dict per model)
      - competitor_mentions.overall_sov (float %)
      - competitor_mentions.data        (list with competitor SOV breakdown)
      - sov_history                     (list of snapshots for trend detection)
    """
    recs: List[Dict[str, Any]] = []

    if not ai_sov and not competitor_mentions:
        return {"recommendations": [], "health_score": 100, "summary": "No Share of Voice data available yet."}

    ai_sov = ai_sov or {}
    competitor_mentions = competitor_mentions or {}
    sov_history = sov_history or []

    overall_sov: float = ai_sov.get("overall_sov", 0.0)
    visibility_tier: str = ai_sov.get("visibility_tier", "Not yet AI-indexed")
    brand_known_models: List[str] = ai_sov.get("brand_known_by_models", [])
    by_model: Dict[str, Any] = ai_sov.get("by_model", {})
    web_sov: float = competitor_mentions.get("overall_sov", 0.0)
    competitor_data: List[Dict] = competitor_mentions.get("data", [])

    # ── Rule 1: Brand not indexed by any AI ──────────────────────────────────
    if visibility_tier == "Not yet AI-indexed" or (overall_sov == 0 and not brand_known_models):
        recs.append(_rec(
            1, "Share of Voice", SEVERITY_CRITICAL,
            "Brand is not AI-indexed (0% SOV, unknown to all models)",
            "No AI model (OpenAI, Gemini, Claude) returned the brand name when asked generic "
            "industry questions. The brand has no AI Share of Voice and is effectively "
            "invisible to AI-driven discovery.",
            "1) Publish comprehensive, AEO-optimized (Answer Engine Optimization) content that "
            "directly answers common industry questions. 2) Get mentioned in industry "
            "roundups and 'best-of' lists. 3) Create or claim your brand on Wikidata, "
            "Crunchbase, and G2. 4) Use Organization and BreadcrumbList schema on every page.",
            "Brand begins to appear in AI-generated industry responses, establishing baseline SOV.",
            ["ai_share_of_voice.overall_sov", "ai_share_of_voice.visibility_tier"],
        ))

    # ── Rule 2: Brand known but SOV is 0 ─────────────────────────────────────
    elif overall_sov == 0 and brand_known_models:
        model_list = ", ".join(brand_known_models)
        recs.append(_rec(
            1, "Share of Voice", SEVERITY_WARNING,
            "Brand is known to AI but not included in industry comparisons (SOV = 0%)",
            f"AI models ({model_list}) are aware of the brand when directly asked, but do not "
            "mention it voluntarily in industry/competitive queries. The brand lacks "
            "enough context for AI models to recommend it unprompted.",
            "Build topical authority: create comparison pages ('Brand vs Competitor'), "
            "publish thought leadership content, and earn mentions in third-party industry "
            "publications. Make your brand name appear in the same context as competitors.",
            "Brand starts appearing in organic AI industry responses alongside competitors.",
            ["ai_share_of_voice.overall_sov", "ai_share_of_voice.brand_known_by_models"],
        ))

    # ── Rule 3: Emerging (<5% SOV) ────────────────────────────────────────────
    elif overall_sov < 5 and overall_sov > 0:
        recs.append(_rec(
            1, "Share of Voice", SEVERITY_WARNING,
            f"Very low AI Share of Voice ({overall_sov:.1f}% — Emerging)",
            "The brand has minimal AI SOV. AI models rarely mention it in industry "
            "conversations, limiting AI-driven discovery and brand reach.",
            "Focus on: 1) Publishing 2-4 in-depth articles per month answering the exact "
            "questions used in AI SOV tracking. 2) Build co-citations — get mentioned "
            "alongside known competitors in industry articles. 3) Increase branded "
            "search volume through campaigns and community engagement.",
            "SOV increases as the brand earns more AI mentions, moving toward 'Recognized' tier.",
            ["ai_share_of_voice.overall_sov"],
        ))

    # ── Rule 4: Recognized (5-20% SOV) ───────────────────────────────────────
    elif 5 <= overall_sov < 20:
        recs.append(_rec(
            3, "Share of Voice", SEVERITY_INFO,
            f"AI Share of Voice is growing ({overall_sov:.1f}% — Recognized)",
            "The brand has a foothold in AI conversations but is not dominant in its space.",
            "Maintain content publishing cadence. Deepen coverage of topics where "
            "competitors have higher SOV. Pursue PR placements and podcast appearances "
            "to increase brand mention frequency across the web.",
            "Gradually increases SOV toward 'Established' tier (20%+).",
            ["ai_share_of_voice.overall_sov"],
        ))

    # ── Rule 5: Coverage gap — fewer than all models know the brand ──────────
    total_models = len(by_model) if by_model else 3
    if brand_known_models and len(brand_known_models) < total_models and total_models > 1:
        unknown_count = total_models - len(brand_known_models)
        recs.append(_rec(
            2, "Share of Voice", SEVERITY_WARNING,
            f"Brand unknown to {unknown_count} AI model(s)",
            f"Only {len(brand_known_models)} of {total_models} AI models recognize the brand "
            "when directly queried. This creates a cross-platform visibility gap.",
            "Ensure brand information is consistent across all major data sources: "
            "Google Knowledge Panel, Bing Places, Apple Maps, Wikidata, LinkedIn, "
            "Crunchbase, and industry-specific directories.",
            "Brand becomes recognized by all AI models, ensuring uniform AI visibility.",
            ["ai_share_of_voice.brand_known_by_models"],
        ))

    # ── Rule 6: Model-level SOV imbalance ────────────────────────────────────
    if by_model:
        model_sovs = {m: d.get("sov", 0) for m, d in by_model.items() if isinstance(d, dict)}
        if model_sovs:
            max_sov_model = max(model_sovs, key=lambda m: model_sovs[m])
            min_sov_model = min(model_sovs, key=lambda m: model_sovs[m])
            max_sov_val = model_sovs[max_sov_model]
            min_sov_val = model_sovs[min_sov_model]

            if max_sov_val > 0 and min_sov_val == 0 and len(model_sovs) > 1:
                recs.append(_rec(
                    2, "Share of Voice", SEVERITY_WARNING,
                    f"Zero SOV on {min_sov_model} while strong on {max_sov_model}",
                    f"The brand has {max_sov_val:.1f}% SOV on {max_sov_model} but 0% on "
                    f"{min_sov_model}. Relying on a single AI model creates platform risk.",
                    f"Investigate what content signals {max_sov_model} uses vs {min_sov_model}. "
                    "Typically this means submitting content to Bing/Microsoft (Copilot) or "
                    "ensuring Anthropic-compatible content signals for Claude.",
                    "Balanced multi-model SOV reduces risk and expands total AI-driven reach.",
                    [f"ai_share_of_voice.by_model.{min_sov_model}"],
                ))

    # ── Rule 7: Competitor dominance ─────────────────────────────────────────
    if competitor_data and len(competitor_data) > 1:
        # data[0] is always the brand; the rest are competitors
        brand_row = competitor_data[0]
        brand_web_mentions = brand_row.get("mentions", 0)
        top_competitor = max(competitor_data[1:], key=lambda c: c.get("mentions", 0), default=None)
        if top_competitor:
            top_comp_mentions = top_competitor.get("mentions", 0)
            top_comp_name = top_competitor.get("name", "a competitor")
            if brand_web_mentions > 0 and top_comp_mentions > brand_web_mentions * 3:
                recs.append(_rec(
                    1, "Share of Voice", SEVERITY_WARNING,
                    f"Competitor dominates web mentions ({top_comp_name})",
                    f"'{top_comp_name}' has {top_comp_mentions:,} web mentions compared to "
                    f"{brand_web_mentions:,} for your brand — over 3× more. This imbalance "
                    "directly impacts AI SOV since AI models learn from web mention frequency.",
                    "Study the competitor's content strategy: what topics do they cover, which "
                    "publications mention them, and what makes their brand appear in industry "
                    "roundups. Replicate their strategy with your unique brand angle. "
                    "Prioritize content that targets the same keywords they rank for.",
                    "Reduces competitor SOV gap, increasing your brand's relative AI visibility.",
                    ["competitor_mentions.data"],
                ))
            elif brand_web_mentions > 0 and top_comp_mentions > brand_web_mentions * 1.5:
                recs.append(_rec(
                    3, "Share of Voice", SEVERITY_INFO,
                    f"Competitor has more web mentions than brand ({top_comp_name})",
                    f"'{top_comp_name}' leads web mention volume. Closing this gap will "
                    "improve relative AI SOV.",
                    "Increase PR activity, publish comparison content, and improve social media "
                    "presence to grow brand mention frequency.",
                    "Gradually increases brand's web mention share relative to competitors.",
                    ["competitor_mentions.data"],
                ))

    # ── Rule 8: Declining SOV trend ───────────────────────────────────────────
    if len(sov_history) >= 3:
        recent = [s.get("overall_sov", 0) for s in sov_history[-3:]]
        if all(recent[i] >= recent[i + 1] for i in range(len(recent) - 1)) and recent[0] > 0:
            recs.append(_rec(
                2, "Share of Voice", SEVERITY_WARNING,
                "AI Share of Voice is declining over recent runs",
                f"SOV has been declining across the last 3 snapshots "
                f"({recent[0]:.1f}% → {recent[1]:.1f}% → {recent[2]:.1f}%). "
                "This could signal that competitors are gaining ground or that content is becoming stale.",
                "Refresh existing content with updated statistics and examples. Increase "
                "publishing frequency for the next 60 days. Investigate if a competitor "
                "recently published high-Authority content that is displacing your brand.",
                "Reverses the SOV decline and returns brand to a growth trajectory.",
                ["ai_sov_history"],
            ))

    # ── Rule 9: Web sentiment is negative ────────────────────────────────────
    if competitor_data:
        brand_sentiment = competitor_data[0].get("sentiment", "Neutral") if competitor_data else "Neutral"
        if brand_sentiment == "Negative":
            recs.append(_rec(
                1, "Share of Voice", SEVERITY_WARNING,
                "Brand web sentiment is Negative",
                "Web mentions of your brand trend negative, which directly influences how "
                "AI models perceive and portray the brand in generated responses.",
                "Address the sources of negative sentiment: respond to negative reviews, "
                "resolve publicized issues, and publish positive case studies and testimonials. "
                "Monitor brand mentions with tools like Google Alerts.",
                "Improving web sentiment leads to more positive AI-generated brand descriptions.",
                ["competitor_mentions.data"],
            ))

    recs.sort(key=lambda r: (r["priority"], SEVERITY_WEIGHT[r["severity"]] * -1))

    # Summary
    if not recs:
        summary = f"Share of Voice is strong at {overall_sov:.1f}% ({visibility_tier}). Keep publishing to maintain."
    elif visibility_tier == "Not yet AI-indexed":
        summary = "Brand is not yet AI-indexed. Immediate content and AEO action required."
    elif overall_sov == 0:
        summary = "Brand known to AI but not mentioned in industry queries. Build topical authority."
    elif overall_sov < 5:
        summary = f"Emerging AI presence at {overall_sov:.1f}% SOV. Consistent content needed to grow."
    else:
        summary = f"SOV at {overall_sov:.1f}% ({visibility_tier}). Focus on closing cross-model gaps."

    return {
        "recommendations": recs,
        "health_score": _health_score(recs),
        "summary": summary,
    }
