import logging
import asyncio
import re
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_f_competitor_ai_intelligence")


@dataclass(frozen=True)
class EntityTerms:
    name: str
    terms: List[str]


def _extract_domain(url: str) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip().lower())
        netloc = parsed.netloc or ""
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc
    except Exception:
        v = url.strip().lower()
        v = re.sub(r"^https?://", "", v)
        v = re.sub(r"^www\.", "", v)
        return v.split("/")[0]


def _normalize_term(term: str) -> str:
    t = (term or "").strip().lower()
    t = re.sub(r"^https?://", "", t)
    t = re.sub(r"^www\.", "", t)
    t = re.sub(r"\s+", " ", t)
    t = t.strip().strip("/")
    return t


def _make_entity_terms(name: str, extra_terms: Optional[List[str]] = None) -> EntityTerms:
    base = _normalize_term(name)
    terms: List[str] = []

    def add_term(t: str):
        if t and len(t) > 1 and t not in terms:
            terms.append(t)

    # Common corporate suffixes to strip
    suffixes = [
        " inc", " corp", " llc", " ltd", " gmbh", " plc", " sa", " nv", " co",
        " company", " corporation", " incorporated", " limited", " group", " holdings"
    ]
    suffixes.sort(key=len, reverse=True)

    def process_term(t: str):
        if not t:
            return
        add_term(t)
        
        # Handle domain roots (e.g. example.com -> example)
        root = t.split(".")[0]
        if root and root != t:
            add_term(root)
        
        # Handle corporate suffixes
        cleaned = t
        for suffix in suffixes:
            pattern = rf"{re.escape(suffix)}\.?$"
            if re.search(pattern, cleaned):
                cleaned = re.sub(pattern, "", cleaned).strip()
                break
        
        if cleaned and cleaned != t:
            add_term(cleaned)
            
        # If the cleaned name has spaces, add the first word if it's distinctive
        parts = cleaned.split()
        if len(parts) > 1:
            first = parts[0]
            # Skip common generic starting words
            if len(first) > 3 and first not in ["the", "global", "national", "international", "american", "united", "general"]:
                add_term(first)

    if base:
        process_term(base)

    if extra_terms:
        for t in extra_terms:
            nt = _normalize_term(t)
            if nt:
                process_term(nt)
                
    return EntityTerms(name=base or name, terms=terms)


def _compile_patterns(terms: List[str]) -> List[re.Pattern]:
    patterns: List[re.Pattern] = []
    for term in terms:
        if not term:
            continue
        escaped = re.escape(term)
        patterns.append(re.compile(rf"(?<!\w){escaped}(?!\w)", flags=re.IGNORECASE))
    return patterns


def _find_unique_spans(text: str, patterns: List[re.Pattern]) -> List[Tuple[int, int]]:
    spans: List[Tuple[int, int]] = []
    for pattern in patterns:
        for m in pattern.finditer(text):
            start, end = m.span()
            if any(not (end <= s or start >= e) for s, e in spans):
                continue
            spans.append((start, end))
    spans.sort(key=lambda x: x[0])
    return spans


def _safe_parse_json(text: Any) -> Optional[Dict[str, Any]]:
    if text is None:
        return None
    if isinstance(text, dict):
        return text
    raw = str(text).strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(raw[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
        return None


class CompetitorAIIntelligence:
    def __init__(self, models: Optional[List[str]] = None):
        self.models = models or ["openai", "gemini", "claude"]

    def compute_emerging_trends(
        self,
        current_compare: Dict[str, Any],
        current_wins: Dict[str, Any],
        prev_doc: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        def to_map(compare_block: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
            m: Dict[str, Dict[str, Any]] = {}
            if not isinstance(compare_block, dict):
                return m
            b = compare_block.get("brand") or None
            if b:
                name = str(b.get("name") or "").strip() or "Brand"
                m[name] = b
            for row in compare_block.get("competitors") or []:
                nm = str(row.get("name") or "").strip()
                if nm:
                    m[nm] = row
            return m

        prev_compare = (prev_doc or {}).get("compare_visibility_against_competitors") or {}
        prev_wins = (prev_doc or {}).get("competitor_wins") or {}
        prev_details = prev_wins.get("detailed_results") or []
        prev_wins_map = {str(r.get("prompt") or "").strip(): r for r in prev_details if r.get("prompt")}

        cur_map = to_map(current_compare or {})
        prev_map = to_map(prev_compare or {})
        names = set(list(cur_map.keys()) + list(prev_map.keys()))

        competitor_changes: List[Dict[str, Any]] = []
        deltas: List[float] = []

        for name in names:
            cur = cur_map.get(name)
            prev = prev_map.get(name)
            cur_vis = float(cur.get("visibility_score") or 0.0) if cur else None
            prev_vis = float(prev.get("visibility_score") or 0.0) if prev else None
            cur_share = float(cur.get("market_share_percent") or 0.0) if cur else None
            prev_share = float(prev.get("market_share_percent") or 0.0) if prev else None

            if prev is None and cur is not None:
                status = "new"
                dv = cur_vis if cur_vis is not None else 0.0
                ds = cur_share if cur_share is not None else 0.0
            elif prev is not None and cur is None:
                status = "missing"
                dv = -(prev_vis or 0.0)
                ds = -(prev_share or 0.0)
            else:
                dv = (cur_vis or 0.0) - (prev_vis or 0.0)
                ds = (cur_share or 0.0) - (prev_share or 0.0)
                status = "rising" if dv > 0.5 else ("falling" if dv < -0.5 else "stable")

            deltas.append(abs(dv))
            competitor_changes.append({
                "name": name,
                "delta_visibility": round(dv, 1),
                "delta_market_share": round(ds, 1),
                "status": status
            })

        competitor_changes.sort(key=lambda x: abs(x.get("delta_visibility", 0)), reverse=True)

        prompt_swings: List[Dict[str, Any]] = []
        cur_details = (current_wins or {}).get("detailed_results") or []
        for r in cur_details:
            p = str(r.get("prompt") or "").strip()
            if not p:
                continue
            pr = prev_wins_map.get(p)
            if not pr:
                continue
            before = pr.get("winner")
            after = r.get("winner")
            if before and after and before != after:
                prompt_swings.append({"prompt": p, "from": before, "to": after})

        model_targeting: Dict[str, List[str]] = {}
        comp_list = (current_compare or {}).get("competitors") or []
        for row in comp_list:
            name = str(row.get("name") or "").strip()
            per_model = row.get("per_model") or {}
            for mdl, stats in per_model.items():
                mentions = int((stats or {}).get("mentions") or 0)
                if mentions > 0:
                    model_targeting.setdefault(mdl, []).append(name)
        for mdl in list(model_targeting.keys()):
            uniq = []
            seen = set()
            for n in model_targeting[mdl]:
                if n not in seen:
                    seen.add(n)
                    uniq.append(n)
            model_targeting[mdl] = uniq[:8]

        trends_detected = sum(1 for c in competitor_changes if c["status"] != "stable") + len(prompt_swings)
        avg_visibility_delta = round(sum(deltas) / len(deltas), 1) if deltas else 0.0
        new_prompts = len([r for r in cur_details if str(r.get("prompt") or "").strip() and str(r.get("prompt") or "").strip() not in prev_wins_map])
        max_up = 0.0
        for c in competitor_changes:
            if c["delta_visibility"] > max_up:
                max_up = c["delta_visibility"]
        threat_level = "low"
        if max_up >= 10 or any(sw.get("to") == "competitor" for sw in prompt_swings):
            threat_level = "high"
        elif max_up >= 5:
            threat_level = "medium"

        return {
            "competitor_changes": competitor_changes[:10],
            "prompt_swings": prompt_swings[:10],
            "model_targeting": model_targeting,
            "summary": {
                "trends_detected": trends_detected,
                "avg_visibility_delta": avg_visibility_delta,
                "new_prompts": new_prompts,
                "threat_level": threat_level,
            }
        }

    async def generate_metric_recommendations(
        self,
        visibility_data: Dict[str, Any],
        win_rate_data: Dict[str, Any],
        gap_data: List[Dict[str, Any]],
        source_data: Dict[str, Any],
    ) -> Dict[str, Dict[str, str]]:
        """
        Generates specific, actionable recommendations for each key metric based on the analysis data.
        Returns a dictionary mapping metric keys to recommendation strings.
        """
        
        # Extract key metrics for the prompt
        brand = visibility_data.get("brand") or {}
        competitors = visibility_data.get("competitors") or []

        brand_vis = brand.get("visibility_score", 0)
        brand_share = brand.get("market_share_percent", 0)
        brand_mentions_total = brand.get("mentions_total", 0)
        brand_mentioned_models = brand.get("mentioned_in_models", 0)
        brand_avg_rank = brand.get("avg_rank", None)
        
        summary = win_rate_data.get("summary") or {}
        total_prompts = summary.get("total_prompts", 0)
        brand_wins = summary.get("brand_wins", 0)
        competitor_wins = summary.get("competitor_wins", 0)
        brand_win_rate = summary.get("brand_win_rate", 0)
        comp_win_rate = summary.get("competitor_win_rate", 0)
        
        avg_gap_score = 0
        if gap_data:
            avg_gap_score = sum(g.get("gapScore", 0) for g in gap_data) / len(gap_data)
            
        source_list = source_data.get("competitor_source_analysis") or []
        avg_influence = 0
        if source_list:
            avg_influence = sum(s.get("source_domain_influence_score", 0) for s in source_list) / len(source_list)

        top_comp = None
        if competitors and isinstance(competitors, list):
            top_comp = max(competitors, key=lambda c: (c or {}).get("visibility_score", 0))
        top_comp_name = (top_comp or {}).get("name", "") or ""
        top_comp_vis = (top_comp or {}).get("visibility_score", 0) if top_comp else 0
        top_comp_share = (top_comp or {}).get("market_share_percent", 0) if top_comp else 0
        top_comp_avg_rank = (top_comp or {}).get("avg_rank", None) if top_comp else None

        prompt = (
            "You are an expert SEO and AI visibility strategist. based on the following metrics for a brand:\n\n"
            f"- AI Visibility Score: {brand_vis}/100\n"
            f"- Market Share: {brand_share}%\n"
            f"- Mentions total: {brand_mentions_total} across {brand_mentioned_models} models\n"
            f"- Avg rank (when mentioned): {brand_avg_rank}\n"
            f"- Brand wins: {brand_wins}/{total_prompts} ({brand_win_rate}%)\n"
            f"- Competitor wins: {competitor_wins}/{total_prompts} ({comp_win_rate}%)\n"
            f"- Content Gap Score (avg): {avg_gap_score}/100 (higher = bigger gap)\n"
            f"- Competitor Source Influence (avg): {avg_influence}/100\n"
            f"- Top competitor: {top_comp_name} (visibility {top_comp_vis}/100, share {top_comp_share}%, avg rank {top_comp_avg_rank})\n\n"
            "For EACH metric below, write TWO parts:\n"
            "1) why: one short sentence explaining WHY the number is where it is using the data above.\n"
            "2) fix: 3-5 concrete actions to improve it (comma-separated or short bullets).\n\n"
            "Metrics to return:\n"
            "- visibility_score\n"
            "- market_share\n"
            "- brand_win_rate\n"
            "- competitor_win_rate\n"
            "- content_gap_score\n"
            "- source_influence\n"
            "- rank_delta (explain what Rank Δ vs Brand means and how to reduce it)\n\n"
            "Return ONLY valid JSON in this exact structure:\n"
            "{\n"
            '  "visibility_score": {"why": "...", "fix": "..."},\n'
            '  "market_share": {"why": "...", "fix": "..."},\n'
            '  "brand_win_rate": {"why": "...", "fix": "..."},\n'
            '  "competitor_win_rate": {"why": "...", "fix": "..."},\n'
            '  "content_gap_score": {"why": "...", "fix": "..."},\n'
            '  "source_influence": {"why": "...", "fix": "..."},\n'
            '  "rank_delta": {"why": "...", "fix": "..."}\n'
            "}\n"
        )

        task_name = "module_f_metric_recommendations"

        try:
            resp_data: Dict[str, Any] = {}
            for provider in self.models:
                resp = await execute_task(
                    task_name=task_name,
                    input_data={"messages": [{"role": "user", "content": prompt}]},
                    provider=provider,
                    options={
                        "temperature": 0.3,
                        "response_format": {"type": "json_object"},
                        "skip_cache": True,
                    },
                )

                if not resp.success:
                    logger.error(f"Metric recommendations failed ({provider}): {resp.error}")
                    continue

                parsed = _safe_parse_json(resp.data) or {}
                if parsed:
                    resp_data = parsed
                    break

            def normalize(value: Any) -> Optional[Dict[str, str]]:
                if value is None:
                    return None
                if isinstance(value, str):
                    v = value.strip()
                    return {"why": "", "fix": v} if v else None
                if isinstance(value, dict):
                    why = str(value.get("why", "") or "").strip()
                    fix = str(value.get("fix", "") or "").strip()
                    if not why and not fix:
                        return None
                    return {"why": why, "fix": fix}
                return None

            recs: Dict[str, Dict[str, str]] = {}

            for k in [
                "visibility_score",
                "market_share",
                "brand_win_rate",
                "competitor_win_rate",
                "content_gap_score",
                "source_influence",
                "rank_delta",
            ]:
                n = normalize(resp_data.get(k))
                if n:
                    recs[k] = n

            if "visibility_score" not in recs:
                recs["visibility_score"] = {
                    "why": f"Visibility is {brand_vis}/100 vs {top_comp_name or 'top competitor'} at {top_comp_vis}/100; mentions are limited.",
                    "fix": "Publish prompt-target landing pages, add comparison/alternatives sections, implement Organization/Product schema, strengthen entity consistency across site, earn citations from authoritative industry sites.",
                }
            if "market_share" not in recs:
                recs["market_share"] = {
                    "why": f"Market share is {brand_share}%; higher share usually comes from more frequent mentions and citations.",
                    "fix": "Increase coverage on high-volume prompts, expand 'best for' use cases, build cite-worthy assets (data, studies), improve internal linking to money pages, pursue PR for top-tier citations.",
                }
            if "brand_win_rate" not in recs:
                recs["brand_win_rate"] = {
                    "why": f"Brand wins {brand_wins}/{total_prompts} prompts ({brand_win_rate}%), meaning competitors win more often.",
                    "fix": "Prioritize top losing prompts, improve answer-first intros, add clear product fit and proof, align content to model intent, refresh pages with new examples and FAQs.",
                }
            if "competitor_win_rate" not in recs:
                recs["competitor_win_rate"] = {
                    "why": f"Competitors win {competitor_wins}/{total_prompts} prompts ({comp_win_rate}%), indicating stronger coverage or citations.",
                    "fix": "Map winners by prompt, replicate missing page types, match competitor entities/features, earn citations from the same domains, create prompt-specific pages with structured sections.",
                }
            if "content_gap_score" not in recs:
                recs["content_gap_score"] = {
                    "why": f"Avg content gap score is {round(avg_gap_score, 1)}/100; higher means missing coverage/entities for key prompts.",
                    "fix": "Create pages for uncovered prompts, add missing entities/features, use tables/lists for extraction, add FAQs for long-tail prompts, link related pages into a topic cluster.",
                }
            if "source_influence" not in recs:
                recs["source_influence"] = {
                    "why": f"Avg source influence is {round(avg_influence, 1)}/100; weaker citations reduce model trust signals.",
                    "fix": "Publish original research, secure citations from high-authority domains, build partner pages and integrations, get listed in trusted directories, improve E-E-A-T signals (authors, references).",
                }
            if "rank_delta" not in recs:
                recs["rank_delta"] = {
                    "why": "Rank Δ vs Brand shows how many positions a competitor is ahead/behind your brand on average; negative means they outrank you.",
                    "fix": "Improve answer relevance for top prompts, add comparison and alternatives content, strengthen entity/schema signals, improve topical coverage depth, increase authoritative citations to your pages.",
                }

            return recs

        except Exception as e:
            logger.exception(f"Error in generate_metric_recommendations: {e}")
            return {
                "visibility_score": {
                    "why": "Visibility is low because you are mentioned less often and rank lower than top competitors.",
                    "fix": "Publish prompt-target pages, add comparisons/alternatives, implement schema, strengthen entity consistency, earn authoritative citations.",
                },
                "market_share": {
                    "why": "Market share is low because competitors receive more mentions across models and prompts.",
                    "fix": "Expand prompt coverage, create use-case pages, build cite-worthy assets, improve internal linking, pursue PR citations.",
                },
                "brand_win_rate": {
                    "why": "Win rate is low because competitors are chosen more frequently as the best answer for key prompts.",
                    "fix": "Target losing prompts, improve answer-first content, add proof and differentiation, align to intent, refresh content regularly.",
                },
                "competitor_win_rate": {
                    "why": "Competitors win more prompts due to stronger topical coverage and trust signals.",
                    "fix": "Analyze winners by prompt, match required entities, create missing page types, earn similar citations, publish structured prompt pages.",
                },
                "content_gap_score": {
                    "why": "Gap score is high because key entities, features, or prompt pages are missing or thin.",
                    "fix": "Create missing prompt pages, add entities/features, use tables/lists/FAQs, build topic clusters, improve internal links.",
                },
                "source_influence": {
                    "why": "Source influence is low because authoritative domains cite competitors more than you.",
                    "fix": "Publish original research, earn high-authority citations, list in trusted directories, build partnerships, improve E-E-A-T signals.",
                },
                "rank_delta": {
                    "why": "Rank Δ vs Brand indicates competitors appear higher than you in AI outputs for many prompts.",
                    "fix": "Improve prompt relevance, add comparisons/alternatives, strengthen schema/entity signals, increase topical depth, earn authoritative citations.",
                },
            }

    async def analyze_competitor_sources(
        self,
        competitors: List[str],
        topic: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyzes the authority and influence of domains cited by or associated with competitors.
        Returns source domain influence scores.
        """
        if not competitors:
            return {}

        if not topic:
            topic = "their industry"

        # Limit to top 5 competitors to save tokens
        top_competitors = competitors[:5]
        
        prompt = (
            f"For the following companies in {topic}: {', '.join(top_competitors)}.\n"
            "For EACH company, list up to 12 external citation sources (URLs or domains) that are likely to cite them "
            "or influence their perceived authority. Prefer well-known publications, research sites, standards bodies, "
            "and reputable directories.\n"
            "For each source, estimate a Domain Authority (DA) score from 0-100 based on its reputation.\n\n"
            "Return ONLY valid JSON in this format:\n"
            "{\n"
            '  "competitor_sources": {\n'
            '    "Competitor Name": [\n'
            '      {"domain": "example.com", "url": "https://example.com/some-page", "authority_score": 85, "citation_type": "industry_report"}\n'
            "    ]\n"
            "  }\n"
            "}"
        )

        task_name = "module_f_source_influence"
        
        try:
            sources_map: Dict[str, Any] = {}
            for provider in self.models:
                resp = await execute_task(
                    task_name=task_name,
                    input_data={"messages": [{"role": "user", "content": prompt}]},
                    provider=provider,
                    options={
                        "temperature": 0.2,
                        "response_format": {"type": "json_object"},
                        "skip_cache": True,
                    },
                )

                if not resp.success:
                    logger.error(f"Source influence analysis failed ({provider}): {resp.error}")
                    continue

                data = _safe_parse_json(resp.data) or {}
                candidate = data.get("competitor_sources") or data.get("competitorSources") or {}
                if isinstance(candidate, dict) and candidate:
                    sources_map = candidate
                    break
                if (
                    isinstance(data, dict)
                    and data
                    and all(isinstance(k, str) for k in data.keys())
                    and all(isinstance(v, list) for v in data.values())
                ):
                    sources_map = data
                    break

            if not sources_map:
                return {}
            
            # Post-process to calculate aggregate metrics
            results = []

            for comp, sources in sources_map.items():
                if not sources:
                    continue
                
                # Normalize competitor name
                norm_comp = _normalize_term(comp)
                
                domains: List[str] = []
                authority_by_domain: Dict[str, float] = {}
                for s in sources:
                    if not isinstance(s, dict):
                        continue
                    raw_domain = str(s.get("domain") or "").strip().lower()
                    raw_url = str(s.get("url") or "").strip()
                    candidate = raw_url or raw_domain
                    d = _extract_domain(candidate) if candidate else ""
                    if not d and candidate:
                        d = _normalize_term(candidate).split("/")[0]
                    if not d:
                        continue
                    try:
                        da = float(s.get("authority_score", 0) or 0)
                    except Exception:
                        da = 0.0
                    domains.append(d)
                    if d not in authority_by_domain:
                        authority_by_domain[d] = da
                    else:
                        authority_by_domain[d] = max(authority_by_domain[d], da)

                citation_count = len(domains)
                freq: Dict[str, int] = {}
                for d in domains:
                    freq[d] = freq.get(d, 0) + 1
                unique_domains = set(freq.keys())

                unique_domain_count = len(unique_domains)
                avg_auth = round((sum(authority_by_domain.values()) / unique_domain_count), 1) if unique_domain_count else 0.0

                total_influence = 0.0
                for d, f in freq.items():
                    total_influence += float(authority_by_domain.get(d, 0.0)) * float(f)
                influence_score = round((total_influence / citation_count), 1) if citation_count else 0.0

                source_diversity_ratio = round((unique_domain_count / citation_count), 3) if citation_count else 0.0
                types = [str((s or {}).get("citation_type") or "").strip().lower() for s in sources if isinstance(s, dict)]
                types = [t for t in types if t]
                unique_types = set(types)

                results.append({
                    "competitor": comp,
                    "source_domain_influence_score": round(influence_score, 1),
                    "average_domain_authority": avg_auth,
                    "credibility_score": avg_auth,
                    "citation_count": citation_count,
                    "source_diversity": source_diversity_ratio,
                    "unique_domains": unique_domain_count,
                    "citation_frequency": [{"domain": d, "count": int(freq[d])} for d in sorted(freq.keys(), key=lambda k: (-freq[k], k))[:20]],
                    "type_diversity": len(unique_types),
                    "top_citations": sources
                })

            # Sort by influence score
            results.sort(key=lambda x: x["source_domain_influence_score"], reverse=True)
            
            return {
                "competitor_source_analysis": results
            }

        except Exception as e:
            logger.exception(f"Error in analyze_competitor_sources: {e}")
            return {}

    async def compare_visibility_against_competitors(
        self,
        url: str,
        competitors: List[str],
        brand_name: Optional[str] = None,
        topic: Optional[str] = None,
    ) -> Dict[str, Any]:
        brand_domain = _extract_domain(url)
        brand_terms_extra = [brand_name] if brand_name else []

        entities: List[EntityTerms] = [
            _make_entity_terms(brand_domain, extra_terms=brand_terms_extra),
            *[_make_entity_terms(c) for c in competitors],
        ]

        normalized_entities = []
        seen = set()
        for e in entities:
            key = _normalize_term(e.name)
            if not key or key in seen:
                continue
            seen.add(key)
            normalized_entities.append(e)
        entities = normalized_entities

        if not topic:
            topic = "the market"

        def _build_batch_prompt(topic_label: str, examples: Optional[List[str]] = None) -> str:
            company_list: List[str] = []
            if brand_name and isinstance(brand_name, str) and brand_name.strip():
                company_list.append(brand_name.strip())
            if brand_domain:
                company_list.append(brand_domain)
            company_list.extend([c for c in competitors[:8] if c])

            seen_local = set()
            company_list_unique: List[str] = []
            for c in company_list:
                k = _normalize_term(c)
                if not k or k in seen_local:
                    continue
                seen_local.add(k)
                company_list_unique.append(c)

            examples_clause = ""
            examples_clean = [e for e in (examples or []) if e]
            if examples_clean:
                examples_clause = f" (Examples: {', '.join(examples_clean)})"

            companies_line = ", ".join(company_list_unique) if company_list_unique else ""

            return (
                f"You are analyzing {topic_label}{examples_clause}.\n\n"
                "Company list (you MUST mention every company at least once in your answer):\n"
                f"{companies_line}\n\n"
                "Tasks:\n"
                f"1) Rank the companies above for {topic_label} from best to worst. Use a numbered list.\n"
                "2) For each company, give a 1-line reason focused on strengths/fit for the topic.\n"
                "3) End with a short 'Honorable mentions' line that repeats any company not in your top 5.\n"
            )

        topic_used = topic
        batch_prompt = _build_batch_prompt(topic_used)

        async def query_model(model: str) -> Tuple[str, Optional[str], Optional[str]]:
            task_name = f"module_e_ai_sov_{model}"
            resp = await execute_task(
                task_name=task_name,
                input_data={"messages": [{"role": "user", "content": batch_prompt}]},
                provider=model,
                options={
                    "temperature": 0.4,
                    "skip_cache": True,
                },
            )
            if not resp.success:
                return model, None, resp.error or "Model call failed"
            return model, str(resp.data), None

        entity_patterns = {e.name: _compile_patterns(e.terms) for e in entities}

        async def _run_models(prompt_text: str) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str]]:
            async def _query_model_with_prompt(model: str) -> Tuple[str, Optional[str], Optional[str]]:
                task_name = f"module_e_ai_sov_{model}"
                resp = await execute_task(
                    task_name=task_name,
                    input_data={"messages": [{"role": "user", "content": prompt_text}]},
                    provider=model,
                    options={
                        "temperature": 0.4,
                        "skip_cache": True,
                    },
                )
                if not resp.success:
                    return model, None, resp.error or "Model call failed"
                return model, str(resp.data), None

            outputs_local = await asyncio.gather(
                *[_query_model_with_prompt(m) for m in self.models],
                return_exceptions=True,
            )

            per_model_local: Dict[str, Dict[str, Any]] = {}
            model_errors_local: Dict[str, str] = {}

            for out in outputs_local:
                if isinstance(out, Exception):
                    continue
                model, text_raw, err = out
                if err or not text_raw:
                    model_errors_local[model] = err or "Empty response"
                    continue
                text = text_raw.lower()

                mentioned: List[Tuple[str, int]] = []
                entity_stats: Dict[str, Dict[str, Any]] = {}

                for entity_name, patterns in entity_patterns.items():
                    spans = _find_unique_spans(text, patterns)
                    count = len(spans)
                    first_pos = spans[0][0] if spans else None
                    entity_stats[entity_name] = {
                        "mentions": count,
                        "first_position": first_pos,
                        "rank": None,
                        "rank_percentile": 0.0,
                    }
                    if first_pos is not None:
                        mentioned.append((entity_name, first_pos))

                mentioned.sort(key=lambda x: x[1])
                mentioned_entities_count = len(mentioned)
                for idx, (entity_name, _) in enumerate(mentioned):
                    rank = idx + 1
                    rank_percentile = (
                        100.0
                        if mentioned_entities_count <= 1
                        else (1 - (rank - 1) / mentioned_entities_count) * 100.0
                    )
                    entity_stats[entity_name]["rank"] = rank
                    entity_stats[entity_name]["rank_percentile"] = round(rank_percentile, 1)

                per_model_local[model] = {
                    "entities": entity_stats,
                    "mentioned_entities": mentioned_entities_count,
                }

            return per_model_local, model_errors_local

        def _has_any_mentions(per_model_data: Dict[str, Dict[str, Any]]) -> bool:
            for model_data in per_model_data.values():
                entities_data = model_data.get("entities") or {}
                for s in entities_data.values():
                    if int(s.get("mentions") or 0) > 0:
                        return True
            return False

        per_model, model_errors = await _run_models(batch_prompt)

        if per_model and not _has_any_mentions(per_model):
            inferred_topic = None
            try:
                topic_hint_prompt = (
                    "Given these websites/brands, infer a short market/topic label (2-6 words). "
                    "Return only the label.\n\n"
                    f"{', '.join([brand_domain] + competitors[:8])}"
                )
                resp_topic = await execute_task(
                    task_name="module_e_industry_inference",
                    input_data={"messages": [{"role": "user", "content": topic_hint_prompt}]},
                    provider=self.models[0],
                    options={"temperature": 0.2, "max_tokens": 30, "skip_cache": True},
                )
                if resp_topic.success and resp_topic.data:
                    inferred_topic = str(resp_topic.data).splitlines()[0].strip()
                    inferred_topic = re.sub(r"^(topic|industry|niche)\s*[:\-]\s*", "", inferred_topic, flags=re.IGNORECASE)
                    inferred_topic = inferred_topic.strip().strip('"').strip("'").strip()
                    if inferred_topic:
                        topic_used = inferred_topic
                        batch_prompt = _build_batch_prompt(topic_used)
                        per_model, model_errors = await _run_models(batch_prompt)
            except Exception:
                inferred_topic = None

            if per_model and not _has_any_mentions(per_model):
                examples = []
                bbase = _normalize_term(brand_domain)
                if bbase:
                    broot = bbase.split(".")[0]
                    if broot and broot not in examples:
                        examples.append(broot)
                for c in competitors[:5]:
                    base = _normalize_term(c)
                    if not base:
                        continue
                    root = base.split(".")[0]
                    if root and root not in examples:
                        examples.append(root)
                if examples:
                    batch_prompt = _build_batch_prompt(topic_used, examples=examples[:3])
                    per_model, model_errors = await _run_models(batch_prompt)

        if not per_model:
            return {
                "error": "All AI model calls failed",
                "models": self.models,
                "model_errors": model_errors,
            }

        total_models = len(per_model)

        aggregate: Dict[str, Dict[str, Any]] = {}
        for e in entities:
            aggregate[e.name] = {
                "name": e.name,
                "visibility_score": 0.0,
                "rank_difference_vs_brand": None,
                "market_share_percent": 0.0,
                "mentions_total": 0,
                "mentioned_in_models": 0,
                "avg_rank": None,
                "avg_rank_percentile": 0.0,
                "per_model": {},
            }

        brand_key = _normalize_term(brand_domain)
        if brand_name:
            if brand_key in aggregate and isinstance(brand_name, str) and brand_name.strip():
                aggregate[brand_key]["name"] = brand_name.strip()

        total_mentions_all_entities = 0
        for model_name, model_data in per_model.items():
            model_entities = model_data.get("entities") or {}
            for entity_name, s in model_entities.items():
                mentions = int(s.get("mentions") or 0)
                total_mentions_all_entities += mentions
                aggregate[entity_name]["mentions_total"] += mentions
                if mentions > 0:
                    aggregate[entity_name]["mentioned_in_models"] += 1

                aggregate[entity_name]["per_model"][model_name] = {
                    "mentions": mentions,
                    "rank": s.get("rank"),
                    "rank_percentile": s.get("rank_percentile"),
                    "first_position": s.get("first_position"),
                }

        brand_model_key = None
        if brand_key in aggregate and aggregate[brand_key]["mentioned_in_models"] == 0:
            try:
                brand_label = None
                if brand_name and isinstance(brand_name, str) and brand_name.strip():
                    brand_label = brand_name.strip()
                elif brand_domain:
                    brand_label = brand_domain
                else:
                    brand_label = brand_key
                probe_prompt = (
                    f"In the context of {topic_used}, is '{brand_label}' a notable provider? "
                    "Return JSON with keys: present (true/false) and rank (1-10 or null). "
                    'Example: {"present": true, "rank": 7}'
                )
                present = False
                rank_val = None
                for probe_model in self.models:
                    resp_probe = await execute_task(
                        task_name=f"module_f_brand_probe_{probe_model}",
                        input_data={"messages": [{"role": "user", "content": probe_prompt}]},
                        provider=probe_model,
                        options={"temperature": 0.2, "skip_cache": True},
                    )
                    data = _safe_parse_json(resp_probe.data) if resp_probe and resp_probe.success else None
                    present = bool((data or {}).get("present"))
                    rank_val = data.get("rank") if isinstance(data, dict) else None
                    if present:
                        brand_model_key = probe_model
                        break

                if present:
                    aggregate[brand_key]["mentioned_in_models"] = 1
                    aggregate[brand_key]["mentions_total"] += 1
                    rp = 100.0
                    if isinstance(rank_val, (int, float)) and rank_val and rank_val > 0:
                        rp = round((1 - (min(float(rank_val), 10.0) - 1) / 10.0) * 100.0, 1)
                    aggregate[brand_key]["per_model"][probe_model] = {
                        "mentions": 1,
                        "rank": int(rank_val) if isinstance(rank_val, int) else 1,
                        "rank_percentile": rp,
                        "first_position": 0,
                    }
                    total_mentions_all_entities += 1
            except Exception:
                pass

        brand_agg = aggregate.get(brand_key) or aggregate.get(entities[0].name)
        brand_avg_rank = None
        if brand_agg:
            ranks = [
                v.get("rank")
                for v in brand_agg["per_model"].values()
                if isinstance(v.get("rank"), int)
            ]
            brand_avg_rank = round(sum(ranks) / len(ranks), 2) if ranks else None
        brand_avg_rank_fallback = brand_avg_rank if brand_avg_rank is not None else 11

        for entity_name, row in aggregate.items():
            mention_rate = (row["mentioned_in_models"] / total_models) * 100.0 if total_models else 0.0
            rank_percentiles = [
                v.get("rank_percentile")
                for v in row["per_model"].values()
                if isinstance(v.get("rank_percentile"), (int, float)) and v.get("rank") is not None
            ]
            avg_rank_percentile = round(sum(rank_percentiles) / len(rank_percentiles), 1) if rank_percentiles else 0.0
            row["avg_rank_percentile"] = avg_rank_percentile

            ranks = [
                v.get("rank")
                for v in row["per_model"].values()
                if isinstance(v.get("rank"), int)
            ]
            row["avg_rank"] = round(sum(ranks) / len(ranks), 2) if ranks else None
            row["visibility_score"] = round(max(0.0, min(100.0, mention_rate)), 1)

            if total_mentions_all_entities > 0:
                row["market_share_percent"] = round((row["mentions_total"] / total_mentions_all_entities) * 100.0, 1)
            else:
                row["market_share_percent"] = 0.0

            if row["avg_rank"] is not None and entity_name != brand_key:
                row["rank_difference_vs_brand"] = round(row["avg_rank"] - brand_avg_rank_fallback, 2)

        competitors_rows = [aggregate[_normalize_term(c)] for c in competitors if _normalize_term(c) in aggregate]
        competitors_rows.sort(key=lambda r: (-float(r.get("visibility_score") or 0.0), str(r.get("name") or "")))

        return {
            "brand": aggregate.get(brand_key) or aggregate.get(entities[0].name),
            "competitors": competitors_rows,
            "topic": topic_used,
            "models": list(per_model.keys()),
            "model_errors": model_errors,
        }

    def _analyze_mention_quality(self, text: str, span: Tuple[int, int]) -> Dict[str, Any]:
        """
        Analyzes the quality of a brand/competitor mention based on its context.
        Returns a score (0-100) and qualitative attributes.
        """
        start, end = span
        # Extract surrounding context (e.g., +/- 150 chars)
        ctx_start = max(0, start - 150)
        ctx_end = min(len(text), end + 150)
        context = text[ctx_start:ctx_end]
        
        # Heuristics for quality:
        # 1. Detail/Length of context
        detail_score = min(100, len(context) / 3)  # Cap at 300 chars for max score
        
        # 2. Sentiment/Adjectives (simple keyword check for now)
        positive_terms = ["best", "top", "leading", "excellent", "great", "innovative", "popular", "recommended", "powerful", "comprehensive"]
        negative_terms = ["slow", "expensive", "limited", "complex", "difficult", "bad", "poor", "weak"]
        
        pos_count = sum(1 for t in positive_terms if t in context.lower())
        neg_count = sum(1 for t in negative_terms if t in context.lower())
        
        sentiment_score = 50 + (pos_count * 10) - (neg_count * 10)
        sentiment_score = max(0, min(100, sentiment_score))
        
        # 3. Specificity (numbers, features)
        specific_terms = [r"\d+%", r"\d+\s+users", "feature", "capability", "module", "integration", "support", "pricing"]
        spec_count = sum(1 for t in specific_terms if re.search(t, context, re.IGNORECASE))
        specificity_score = min(100, spec_count * 20)
        
        # Weighted average
        overall_quality = (detail_score * 0.4) + (sentiment_score * 0.3) + (specificity_score * 0.3)
        
        return {
            "quality_score": round(overall_quality, 1),
            "sentiment_score": round(sentiment_score, 1),
            "specificity_score": round(specificity_score, 1),
            "context_snippet": context.strip()
        }

    def _analyze_intent_coverage(self, text: str, prompt: str) -> Dict[str, Any]:
        """
        Analyzes how well the text answers the prompt's intent.
        Returns a score (0-100) and attributes.
        """
        text_lower = text.lower()
        prompt_lower = prompt.lower()
        
        # 1. Direct Answer Check
        # Does it contain "Here are", "The best", "I recommend", "Top", "List of"
        answer_signals = ["here are", "the best", "i recommend", "top", "list of", "following", "include", "features", "pros and cons"]
        has_answer_signal = any(s in text_lower for s in answer_signals)
        
        # 2. Refusal Check
        refusal_signals = ["i cannot", "i don't know", "i am sorry", "i'm sorry", "no information", "not able to"]
        has_refusal = any(s in text_lower for s in refusal_signals)
        
        if has_refusal and len(text) < 200:
            return {"intent_coverage_score": 0, "reason": "Refusal detected"}
            
        # 3. Structure Check (Bullet points, numbered lists)
        has_list = bool(re.search(r"^\s*[\d\-\*]\.?\s+", text, re.MULTILINE))
        
        score = 50 # Baseline
        if has_answer_signal: score += 30
        if has_list: score += 20
        
        # 4. Keyword Overlap (Prompt vs Response)
        # Extract significant words from prompt (len > 3 and not stop words)
        stop_words = {"what", "which", "where", "when", "how", "that", "this", "with", "from", "your", "have"}
        prompt_words = [
            w for w in re.findall(r"\w+", prompt_lower) 
            if len(w) > 3 and w not in stop_words
        ]
        
        if prompt_words:
            matched_words = sum(1 for w in prompt_words if w in text_lower)
            overlap_ratio = matched_words / len(prompt_words)
            score = (score * 0.7) + (overlap_ratio * 100 * 0.3)
            
        return {
            "intent_coverage_score": round(min(100, score), 1),
            "has_list": has_list,
            "direct_answer": has_answer_signal
        }

    async def analyze_competitor_prompt_wins(
        self,
        prompts: List[str],
        competitors: List[str],
        url: str,
        brand_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        brand_domain = _extract_domain(url)
        brand_display = str(brand_name).strip() if isinstance(brand_name, str) and brand_name.strip() else brand_domain
        brand_key = _normalize_term(brand_display)

        company_key_to_display: Dict[str, str] = {}
        for name in [brand_display, *competitors]:
            if not name:
                continue
            key = _normalize_term(name)
            if not key or key in company_key_to_display:
                continue
            company_key_to_display[key] = str(name).strip() or key

        company_keys = list(company_key_to_display.keys())

        results = []
        brand_wins = 0
        competitor_wins = 0
        total_analyzed = 0
        
        # Limit prompts to avoid excessive API usage if list is huge
        # Usually Module E generates ~5-10 prompts.
        prompts_to_run = prompts[:10]

        async def check_prompt(prompt: str) -> Dict[str, Any]:
            if not company_keys:
                return {
                    "prompt": prompt,
                    "error": "No companies to compare",
                    "winner": "unknown",
                }

            companies_block = "\n".join([f"- {company_key_to_display[k]}" for k in company_keys])
            eval_prompt = (
                f'Query: "{prompt}"\n\n'
                "Rank the companies below from best to worst for this query.\n"
                "Rules:\n"
                "- You MUST include every company exactly once.\n"
                "- Return ONLY valid JSON.\n\n"
                "Companies:\n"
                f"{companies_block}\n\n"
                'JSON format (either is acceptable):\n'
                '{"ranking": ["Company 1", "Company 2", "..."]}\n'
                'or {"ranking": [{"name": "Company 1"}, {"name": "Company 2"}]}\n'
            )

            parsed: Dict[str, Any] = {}
            provider_used: Optional[str] = None
            for provider in self.models:
                resp = await execute_task(
                    task_name=f"module_f_win_check_{provider}",
                    input_data={"messages": [{"role": "user", "content": eval_prompt}]},
                    provider=provider,
                    options={
                        "temperature": 0.2,
                        "response_format": {"type": "json_object"},
                        "skip_cache": True,
                    },
                )
                if not resp.success or not resp.data:
                    continue
                parsed = _safe_parse_json(resp.data) or {}
                if parsed.get("ranking"):
                    provider_used = provider
                    break

            ranking = parsed.get("ranking") if isinstance(parsed, dict) else None
            if not isinstance(ranking, list) or not ranking:
                return {
                    "prompt": prompt,
                    "error": "Ranking not returned",
                    "winner": "unknown",
                }

            ranks: Dict[str, int] = {}
            rank_num = 1
            for item in ranking:
                name = None
                if isinstance(item, str):
                    name = item
                elif isinstance(item, dict):
                    name = item.get("name") or item.get("company")
                if not name:
                    continue
                key = _normalize_term(str(name))
                if key in company_key_to_display and key not in ranks:
                    ranks[key] = rank_num
                    rank_num += 1

            brand_rank = ranks.get(brand_key)

            winner = "none"
            competitor_winner_key = None

            competitor_keys = [k for k in company_keys if k != brand_key]
            competitor_ranks = [(k, ranks.get(k)) for k in competitor_keys if isinstance(ranks.get(k), int)]
            competitor_ranks.sort(key=lambda x: x[1])

            if brand_rank is None:
                if competitor_ranks:
                    winner = "competitor"
                    competitor_winner_key = competitor_ranks[0][0]
            else:
                better = [k for k, r in competitor_ranks if r < brand_rank]
                if better:
                    winner = "competitor"
                    competitor_winner_key = better[0]
                else:
                    winner = "brand"

            total = len(company_keys)
            if brand_rank is None:
                coverage_gap_score = 100.0
            else:
                denom = float(max(1, total - 1))
                coverage_gap_score = 100.0 * ((float(brand_rank) - 1.0) / denom)

            intent_analysis = {"intent_coverage_score": 100.0 if len(ranks) == total else 60.0}
            winner_quality = {}
            brand_quality = {}

            return {
                "prompt": prompt,
                "winner": winner,
                "winner_name": (
                    company_key_to_display.get(competitor_winner_key)
                    if winner == "competitor"
                    else (company_key_to_display.get(brand_key) if winner == "brand" else None)
                ),
                "brand_rank": brand_rank,
                "ranks": ranks,
                "text_snippet": ", ".join([f"{company_key_to_display.get(k, k)}={r}" for k, r in sorted(ranks.items(), key=lambda kv: kv[1])])[:200] + "...",
                "coverage_gap_score": round(coverage_gap_score, 1),
                "intent_coverage": intent_analysis,
                "winner_quality": winner_quality,
                "brand_quality": brand_quality
            }

        tasks = [check_prompt(p) for p in prompts_to_run]
        prompt_results = await asyncio.gather(*tasks)
        
        for res in prompt_results:
            if res.get("error"):
                continue
            total_analyzed += 1
            if res["winner"] == "brand":
                brand_wins += 1
            elif res["winner"] == "competitor":
                competitor_wins += 1
        
        win_rate = (brand_wins / total_analyzed * 100.0) if total_analyzed > 0 else 0.0
        competitor_win_rate = (competitor_wins / total_analyzed * 100.0) if total_analyzed > 0 else 0.0
        
        # Calculate avg gap
        gaps = [r["coverage_gap_score"] for r in prompt_results if "coverage_gap_score" in r]
        avg_gap = sum(gaps) / len(gaps) if gaps else 0.0

        competitor_map: Dict[str, str] = {}
        for c in competitors:
            nk = _normalize_term(c)
            if nk and nk not in competitor_map:
                competitor_map[nk] = c
        competitor_keys = list(competitor_map.keys())
        detailed_no_error = [r for r in prompt_results if isinstance(r, dict) and not r.get("error")]
        brand_prompt_mentions = sum(1 for r in detailed_no_error if r.get("brand_rank") is not None)

        breakdown: List[Dict[str, Any]] = []
        for comp_key in competitor_keys:
            prompts_mentioned = 0
            prompts_won = 0
            gap_values: List[float] = []
            for r in detailed_no_error:
                ranks = r.get("ranks") or {}
                comp_rank = ranks.get(comp_key)
                if comp_rank is None:
                    continue
                prompts_mentioned += 1
                brand_rank = r.get("brand_rank")
                if brand_rank is None or (isinstance(comp_rank, int) and isinstance(brand_rank, int) and comp_rank < brand_rank):
                    prompts_won += 1
                if isinstance(comp_rank, int) and isinstance(brand_rank, int):
                    denom = float(max(1, len(competitor_keys)))
                    gap_values.append(max(0.0, float(brand_rank - comp_rank)) / denom * 100.0)
            win_percent = (prompts_won / total_analyzed * 100.0) if total_analyzed > 0 else 0.0
            content_gap_score = (sum(gap_values) / len(gap_values)) if gap_values else 0.0
            breakdown.append({
                "competitor": competitor_map.get(comp_key, comp_key),
                "competitor_key": comp_key,
                "prompts_mentioned": prompts_mentioned,
                "prompts_won": prompts_won,
                "win_percent": round(win_percent, 1),
                "content_gap_score": round(content_gap_score, 1),
            })
        breakdown.sort(key=lambda x: (int(x.get("prompts_won") or 0), int(x.get("prompts_mentioned") or 0)), reverse=True)

        return {
            "summary": {
                "total_prompts": total_analyzed,
                "brand_wins": brand_wins,
                "competitor_wins": competitor_wins,
                "brand_win_rate": round(win_rate, 1),
                "competitor_win_rate": round(competitor_win_rate, 1),
                "avg_content_gap_score": round(avg_gap, 1),
                "brand_prompt_mentions": brand_prompt_mentions,
            },
            "detailed_results": prompt_results,
            "competitor_breakdown": breakdown,
        }

    def compute_gap_analysis(
        self,
        prompt_results: List[Dict[str, Any]],
        competitors: List[str]
    ) -> List[Dict[str, Any]]:
        # normalize competitor names to match keys in ranks
        comp_map = {}
        for c in competitors:
            norm = _normalize_term(c)
            if norm:
                comp_map[norm] = c
        
        gap_data = []

        total = len(prompt_results)
        vis_counts = []
        for res in prompt_results:
            ranks = res.get("ranks", {}) if isinstance(res, dict) else {}
            if isinstance(ranks, dict):
                vis_counts.append(len(ranks))
        avg_visibility_per_prompt = (sum(vis_counts) / len(vis_counts)) if vis_counts else 0.0

        def _clamp(value: float, min_v: float, max_v: float) -> float:
            return max(min_v, min(max_v, value))

        def _compute_opportunity_score(rank_value: Any) -> float:
            try:
                r = int(rank_value) if rank_value is not None else None
            except Exception:
                r = None
            if r is None or r <= 0:
                return 100.0
            if r > 10:
                return 100.0
            return float(_clamp(((float(r) - 1.0) / 9.0) * 100.0, 0.0, 100.0))
        
        for comp_key, comp_name in comp_map.items():
            missing_count = 0
            opportunities = []
            
            for res in prompt_results:
                ranks = res.get("ranks", {})
                # ranks keys are normalized in analyze_competitor_prompt_wins
                rank = ranks.get(comp_key)
                
                score = _compute_opportunity_score(rank)
                try:
                    rank_int = int(rank) if rank is not None and int(rank) > 0 else None
                except Exception:
                    rank_int = None

                if rank_int is None or rank_int > 3:
                    missing_count += 1

                opportunities.append({
                    "prompt": res.get("prompt"),
                    "rank": rank_int,
                    "opportunityScore": round(score, 1),
                })
            
            gap_score = (sum(o.get("opportunityScore", 0) for o in opportunities) / len(opportunities)) if opportunities else 0.0
            potential_gain_mentions = missing_count * avg_visibility_per_prompt
            potential_gain_percent = gap_score
            potential_gain_mentions = (
                sum((float(o.get("opportunityScore") or 0.0) / 100.0) * avg_visibility_per_prompt for o in opportunities)
                if opportunities
                else 0.0
            )

            opportunities.sort(key=lambda x: float(x.get("opportunityScore") or 0), reverse=True)
            
            gap_data.append({
                "competitor": comp_name,
                "gapScore": round(gap_score, 1),
                "missingPrompts": missing_count,
                # Potential gain is proportional to the gap - if they are missing it, we can take it.
                "potentialGainPercent": round(potential_gain_percent, 1),
                "potentialGainMentions": round(potential_gain_mentions, 1),
                "opportunities": opportunities
            })
            
        # Sort by gap score (descending) - biggest opportunities first
        gap_data.sort(key=lambda x: x["gapScore"], reverse=True)
        
        return gap_data
