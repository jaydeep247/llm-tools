import json
import logging
from typing import Dict, Any

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.ai_visibility_report")

SYSTEM_PROMPT = """You are an AI Visibility and Technical SEO analyst.

You receive structured output from an AEO (Answer Engine Optimization) analysis of a webpage.

Your task is to analyze this data and generate a clear, actionable AI Visibility report.

The goal is to help the user understand:
- What their website currently looks like to AI systems and search engines
- What problems or gaps exist
- What they should change, why those changes matter, and how to fix them practically

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation outside the JSON):

{
  "summary": "2-4 sentence overview explaining how well the page is optimized for AI visibility, whether it is easily understood by LLMs, and whether it is indexed and structured properly.",
  "issues": [
    {
      "title": "Issue title",
      "severity": "High | Medium | Low",
      "field": "The sub-module or field that surfaced this issue",
      "explanation": "Short, plain-language explanation of the problem and its impact."
    }
  ],
  "recommendations": [
    {
      "issue": "What the problem is",
      "why_it_matters": "How this affects SEO, AI understanding, discoverability, ranking, and AI summaries",
      "how_to_fix": "Clear, actionable steps to resolve the issue",
      "example_fix": "An optional concrete code or content example — null if not applicable"
    }
  ],
  "positive_signals": [
    "String describing something the page is doing well"
  ],
  "ai_readability": "2-3 sentence analysis of heading structure, semantic clarity, content sections, metadata, and structured data — explaining how easy the page is for AI models to parse and summarize.",
  "priority_fixes": [
    "Top action #1 (most impactful, most urgent)",
    "Top action #2",
    "Top action #3"
  ],
  "estimated_impact": "2-3 sentences estimating how implementing these fixes could improve AI search visibility, SEO discoverability, structured understanding, and likelihood of appearing in AI-generated answers."
}

Rules:
- Keep language clear, educational, non-technical where possible.
- Be specific — reference actual scores, bots, entity names, or gaps from the data.
- Severity must be exactly "High", "Medium", or "Low".
- Return exactly 3 priority_fixes.
- Return between 1 and 8 issues (only real issues, not invented ones).
- Return at least 2 positive_signals (if the data has any good signals).
- Do NOT wrap the JSON in markdown code fences.
"""


def _build_aeo_summary(aeo_result: Dict[str, Any]) -> str:
    """Compact but information-rich text summary of the AEO result for the LLM prompt."""
    modules = aeo_result.get("modules", {})
    url = aeo_result.get("url", "unknown")
    overall = aeo_result.get("overall_score", 0)

    ai_p = modules.get("ai_presence", {})
    ans = modules.get("answerability", {})
    kb = modules.get("knowledge_base", {})
    sim = modules.get("llm_simulator", {})
    actionable = modules.get("actionable_insights", {})

    robots = ai_p.get("robots_checks", {})
    content_checks = ai_p.get("content_checks", {})
    ai_understanding = ai_p.get("ai_understanding", {})
    consensus = ai_p.get("multi_model_consensus", {})

    entity_cov = kb.get("entity_coverage", {})
    cross_model = sim.get("cross_model_metrics", {})

    lines = [
        f"URL: {url}",
        f"Overall AEO Score: {overall}/100",
        "",
        "=== AI PRESENCE ===",
        f"Score: {ai_p.get('score', 0)}",
        f"Robots — GPTBot allowed: {robots.get('robots_gptbot', 'unknown')}, "
        f"Google-Extended allowed: {robots.get('robots_google_extended', 'unknown')}, "
        f"ClaudeBot allowed: {robots.get('robots_claudebot', 'unknown')}, "
        f"Sitemap present: {robots.get('sitemap_present', 'unknown')}",
        f"Schema — Org schema: {content_checks.get('org_schema_present', False)}, "
        f"Logo: {content_checks.get('org_logo_present', False)}, "
        f"SameAs (wiki): {content_checks.get('sameas_wikidata_or_wikipedia', False)}, "
        f"SameAs profiles: {content_checks.get('sameas_major_profiles_count', 0)}, "
        f"OpenGraph: {content_checks.get('open_graph_present', False)}, "
        f"Twitter Card: {content_checks.get('twitter_card_present', False)}",
        f"AI Understanding consensus — score: {consensus.get('consistency_score', 0)}, "
        f"rating: {consensus.get('variation_rating', 'unknown')}",
    ]

    for provider, data in ai_understanding.items():
        if isinstance(data, dict) and "error" not in data:
            lines.append(
                f"  {provider}: clarity={data.get('score', 0)}, "
                f"level={data.get('understanding_level', 'unknown')}"
            )

    lines += [
        "",
        "=== ANSWERABILITY ===",
        f"Score: {ans.get('score', 0)}, Completeness: {ans.get('completeness_score', 0)}, "
        f"Depth: {ans.get('depth_score', 0)}, Breadth: {ans.get('breadth_score', 0)}, "
        f"Readability: {ans.get('readability_score', 0)}",
    ]
    metrics = ans.get("metrics", {})
    if metrics:
        lines.append(
            f"Questions: {metrics.get('question_count', 0)}, "
            f"Answers: {metrics.get('answer_count', 0)}, "
            f"Q&A Balance: {metrics.get('qa_balance', 0)}, "
            f"% Answered: {metrics.get('percent_questions_answered', 0)}"
        )
    ai_analysis = ans.get("ai_analysis", {})
    if ai_analysis:
        gaps = ai_analysis.get("missing_answers_gaps", [])[:3]
        aspects = ai_analysis.get("missing_aspects", [])[:3]
        if gaps:
            lines.append(f"Missing answer gaps (sample): {', '.join(str(g) for g in gaps)}")
        if aspects:
            lines.append(f"Missing aspects (sample): {', '.join(str(a) for a in aspects)}")

    lines += [
        "",
        "=== KNOWLEDGE BASE ===",
        f"Score: {kb.get('score', 0)}, Fact Density: {kb.get('fact_density', 0)}",
        f"Entity Coverage Score: {entity_cov.get('coverage_score', 0)}, "
        f"Gap %: {entity_cov.get('gap_percentage', 0)}",
        f"Found entities: {len(entity_cov.get('found_entities', []))}, "
        f"Missing entities: {len(entity_cov.get('missing_entities', []))}, "
        f"Critical missing: {entity_cov.get('critical_entities_count', 0)}",
    ]
    missing = entity_cov.get("missing_entities", [])[:5]
    if missing:
        lines.append(f"Top missing entities: {', '.join(str(e) for e in missing)}")

    lines += [
        "",
        "=== LLM SIMULATOR ===",
        f"Query: {sim.get('query', 'N/A')}",
        f"Cross-model consistency: {cross_model.get('consistency_score', 0)}",
    ]
    var_analysis = cross_model.get("variation_analysis", {})
    if var_analysis:
        outcome = var_analysis.get("outcome_level", {})
        lines.append(
            f"Outcome agreement: {outcome.get('agreement', 'unknown')} "
            f"(score {outcome.get('score', 0)})"
        )
    coverage_gaps = cross_model.get("coverage_gaps", [])[:3]
    if coverage_gaps:
        gap_strs = []
        for g in coverage_gaps:
            if isinstance(g, dict):
                gap_strs.append(g.get("description", str(g)))
            else:
                gap_strs.append(str(g))
        lines.append(f"Coverage gaps (sample): {'; '.join(gap_strs)}")

    model_scores = cross_model.get("model_scores", {})
    for provider, scores in model_scores.items():
        if isinstance(scores, dict):
            lines.append(
                f"  {provider}: agreement={scores.get('agreement', 0)}, "
                f"depth={scores.get('depth', 0)}, overall={scores.get('overall', 0)}"
            )

    lines += [
        "",
        "=== ACTIONABLE INSIGHTS ===",
        f"Current Score: {actionable.get('currentScore', 0)}, "
        f"Predicted Score: {actionable.get('predictedScore', 0)}, "
        f"Improvement: +{actionable.get('improvement', 0)}",
        f"Actions — High: {actionable.get('priorityBreakdown', {}).get('high', 0)}, "
        f"Medium: {actionable.get('priorityBreakdown', {}).get('medium', 0)}, "
        f"Low: {actionable.get('priorityBreakdown', {}).get('low', 0)}",
    ]
    actions = actionable.get("actions", [])[:5]
    for a in actions:
        if isinstance(a, dict):
            lines.append(
                f"  [{a.get('priority', '?')}] {a.get('type', '')}: {a.get('description', '')[:120]}"
            )

    return "\n".join(lines)


class AIVisibilityReportModule:
    """
    Generates a structured AI Visibility Report from a completed AEO analysis result.
    Uses OpenAI (gpt-4o-mini) to transform raw module data into an
    educational, actionable consultant-style report.
    """

    async def generate_report(self, aeo_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Takes a full AEO result dict and returns the structured visibility report.
        """
        try:
            aeo_summary = _build_aeo_summary(aeo_result)

            response = await execute_task(
                task_name="aeo_visibility_report",
                input_data={
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": (
                                "Here is the AEO analysis data for the webpage:\n\n"
                                f"{aeo_summary}\n\n"
                                "Generate the AI Visibility Report JSON now."
                            ),
                        },
                    ]
                },
                provider="openai",
                options={
                    "model": "gpt-4o-mini",
                    "temperature": 0.4,
                    "max_tokens": 3000,
                    "response_format": {"type": "json_object"},
                    "skip_cache": False,
                },
            )

            if not response.success or not response.data:
                logger.error(f"[AI_VISIBILITY_REPORT] LLM call failed: {response.error}")
                return {"error": response.error or "Report generation failed"}

            raw = response.data
            if isinstance(raw, str):
                report = json.loads(raw)
            else:
                report = raw

            # Validate required keys are present
            required_keys = [
                "summary", "issues", "recommendations",
                "positive_signals", "ai_readability",
                "priority_fixes", "estimated_impact",
            ]
            for key in required_keys:
                if key not in report:
                    report[key] = [] if key in ("issues", "recommendations", "positive_signals", "priority_fixes") else ""

            logger.info("[AI_VISIBILITY_REPORT] ✅ Report generated successfully")
            return report

        except json.JSONDecodeError as e:
            logger.error(f"[AI_VISIBILITY_REPORT] JSON parse error: {e}")
            return {"error": f"Failed to parse report JSON: {str(e)}"}
        except Exception as e:
            logger.error(f"[AI_VISIBILITY_REPORT] Unexpected error: {e}", exc_info=True)
            return {"error": f"Report generation failed: {str(e)}"}
