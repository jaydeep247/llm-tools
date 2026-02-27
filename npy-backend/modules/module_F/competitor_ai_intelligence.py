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
    t = t.strip().strip("/")
    return t


def _make_entity_terms(name: str, extra_terms: Optional[List[str]] = None) -> EntityTerms:
    base = _normalize_term(name)
    terms: List[str] = []
    if base:
        terms.append(base)
        root = base.split(".")[0]
        if root and root not in terms:
            terms.append(root)
    if extra_terms:
        for t in extra_terms:
            nt = _normalize_term(t)
            if nt and nt not in terms:
                terms.append(nt)
            if nt:
                root = nt.split(".")[0]
                if root and root not in terms:
                    terms.append(root)
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


def _safe_parse_json(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except Exception:
        return None


class CompetitorAIIntelligence:
    def __init__(self, models: Optional[List[str]] = None):
        self.models = models or ["openai", "gemini", "claude"]

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
            "Identify the top 3 authoritative sources, publications, or domains that frequently cite them "
            "or are considered key influencers for their brand authority.\n"
            "For each source, estimate a Domain Authority (DA) score from 0-100 based on its reputation.\n\n"
            "Return ONLY valid JSON in this format:\n"
            "{\n"
            '  "competitor_sources": {\n'
            '    "Competitor Name": [\n'
            '      {"domain": "example.com", "authority_score": 85, "citation_type": "industry_report"}\n'
            "    ]\n"
            "  }\n"
            "}"
        )

        task_name = "module_f_source_influence"
        # Use one model (e.g. Gemini or OpenAI) for this analysis
        provider = "model" 
        
        try:
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
                logger.error(f"Source influence analysis failed: {resp.error}")
                return {}

            data = _safe_parse_json(str(resp.data)) or {}
            sources_map = data.get("competitor_sources", {})
            
            # Post-process to calculate aggregate metrics
            results = []
            all_domains = {}

            for comp, sources in sources_map.items():
                if not sources:
                    continue
                
                # Normalize competitor name
                norm_comp = _normalize_term(comp)
                
                # Calculate avg authority
                total_auth = sum(s.get("authority_score", 0) for s in sources)
                avg_auth = round(total_auth / len(sources), 1) if sources else 0
                
                # Influence score = (Avg DA * 0.7) + (Count * 5) capped at 100
                influence_score = min(100, (avg_auth * 0.8) + (len(sources) * 2))

                results.append({
                    "competitor": comp,
                    "source_domain_influence_score": round(influence_score, 1),
                    "average_domain_authority": avg_auth,
                    "citation_count": len(sources),
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

        questions = [
            f"What are the top companies in {topic}?",
            f"Which {topic} providers would you recommend?",
            f"Who are the leaders and innovators in {topic}?",
        ]
        batch_prompt = (
            f"Answer these questions about {topic}. Be specific with real company names.\n\n"
            + "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))
        )

        async def query_model(model: str) -> Tuple[str, Optional[str], Optional[str]]:
            task_name = f"module_e_ai_sov_{model}"
            resp = await execute_task(
                task_name=task_name,
                input_data={"messages": [{"role": "user", "content": batch_prompt}]},
                provider="model",
                options={
                    "temperature": 0.4,
                    "skip_cache": True,
                },
            )
            if not resp.success:
                return model, None, resp.error or "Model call failed"
            return model, str(resp.data), None

        outputs = await asyncio.gather(*[query_model(m) for m in self.models], return_exceptions=True)

        per_model: Dict[str, Dict[str, Any]] = {}
        model_errors: Dict[str, str] = {}

        entity_patterns = {e.name: _compile_patterns(e.terms) for e in entities}

        for out in outputs:
            if isinstance(out, Exception):
                continue
            model, text_raw, err = out
            if err or not text_raw:
                model_errors[model] = err or "Empty response"
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
                rank_percentile = 100.0 if mentioned_entities_count <= 1 else (1 - (rank - 1) / mentioned_entities_count) * 100.0
                entity_stats[entity_name]["rank"] = rank
                entity_stats[entity_name]["rank_percentile"] = round(rank_percentile, 1)

            per_model[model] = {
                "entities": entity_stats,
                "mentioned_entities": mentioned_entities_count,
            }

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

        brand_key = _normalize_term(brand_domain)
        brand_agg = aggregate.get(brand_key) or aggregate.get(entities[0].name)
        brand_avg_rank = None
        if brand_agg:
            ranks = [
                v.get("rank")
                for v in brand_agg["per_model"].values()
                if isinstance(v.get("rank"), int)
            ]
            brand_avg_rank = round(sum(ranks) / len(ranks), 2) if ranks else None

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

            visibility_score = round(0.6 * mention_rate + 0.4 * avg_rank_percentile, 1)
            row["visibility_score"] = max(0.0, min(100.0, visibility_score))

            if total_mentions_all_entities > 0:
                row["market_share_percent"] = round((row["mentions_total"] / total_mentions_all_entities) * 100.0, 1)
            else:
                row["market_share_percent"] = 0.0

            if brand_avg_rank is not None and row["avg_rank"] is not None and entity_name != brand_key:
                row["rank_difference_vs_brand"] = round(row["avg_rank"] - brand_avg_rank, 2)

        competitors_rows = [aggregate[_normalize_term(c)] for c in competitors if _normalize_term(c) in aggregate]
        competitors_rows.sort(key=lambda r: (-float(r.get("visibility_score") or 0.0), str(r.get("name") or "")))

        return {
            "brand": aggregate.get(brand_key) or aggregate.get(entities[0].name),
            "competitors": competitors_rows,
            "topic": topic,
            "models": list(per_model.keys()),
            "model_errors": model_errors,
        }

    async def analyze_competitor_prompt_wins(
        self,
        prompts: List[str],
        competitors: List[str],
        url: str,
        brand_name: Optional[str] = None,
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
        
        entity_patterns = {e.name: _compile_patterns(e.terms) for e in entities}
        brand_key = _normalize_term(entities[0].name)

        results = []
        brand_wins = 0
        competitor_wins = 0
        total_analyzed = 0
        
        # Limit prompts to avoid excessive API usage if list is huge
        # Usually Module E generates ~5-10 prompts.
        prompts_to_run = prompts[:10]

        async def check_prompt(prompt: str) -> Dict[str, Any]:
            # Use one capable model for speed/cost, e.g. gpt-4o or gemini-1.5-pro
            # Or use self.models[0]
            model = self.models[0]
            
            resp = await execute_task(
                task_name=f"module_f_win_check_{model}",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="model",
                options={"temperature": 0.4, "skip_cache": True},
            )
            
            if not resp.success or not resp.data:
                return {
                    "prompt": prompt,
                    "error": resp.error or "No response",
                    "winner": "unknown"
                }
            
            text = str(resp.data).lower()
            
            # Check mentions and ranks
            mentioned = []
            for entity_name, patterns in entity_patterns.items():
                spans = _find_unique_spans(text, patterns)
                if spans:
                    first_pos = spans[0][0]
                    mentioned.append((entity_name, first_pos))
            
            mentioned.sort(key=lambda x: x[1])
            
            ranks = {name: idx + 1 for idx, (name, _) in enumerate(mentioned)}
            
            brand_rank = ranks.get(brand_key)
            
            # Determine winner
            winner = "none"
            competitor_winner_name = None
            
            if brand_rank is not None:
                # Brand is mentioned. Check if any competitor is higher (lower rank number)
                better_competitors = [
                    name for name, rank in ranks.items() 
                    if name != brand_key and rank < brand_rank
                ]
                if better_competitors:
                    winner = "competitor"
                    competitor_winner_name = better_competitors[0] # The highest ranking one
                else:
                    winner = "brand"
            else:
                # Brand not mentioned
                # If any competitor mentioned, they win
                mentioned_competitors = [name for name in ranks.keys() if name != brand_key]
                if mentioned_competitors:
                    winner = "competitor"
                    competitor_winner_name = mentioned_competitors[0]
                else:
                    winner = "none"

            # Gap analysis (simple entity coverage count)
            # Count how many unique entities from our list are mentioned
            entities_covered_count = len(mentioned)
            total_entities_count = len(entities)
            coverage_gap_score = 100.0 * (1.0 - (entities_covered_count / total_entities_count)) if total_entities_count > 0 else 0.0

            return {
                "prompt": prompt,
                "winner": winner,
                "winner_name": competitor_winner_name if winner == "competitor" else (brand_key if winner == "brand" else None),
                "brand_rank": brand_rank,
                "ranks": ranks,
                "text_snippet": text[:200] + "...",
                "coverage_gap_score": round(coverage_gap_score, 1)
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

        return {
            "summary": {
                "total_prompts": total_analyzed,
                "brand_wins": brand_wins,
                "competitor_wins": competitor_wins,
                "brand_win_rate": round(win_rate, 1),
                "competitor_win_rate": round(competitor_win_rate, 1),
                "avg_content_gap_score": round(avg_gap, 1)
            },
            "detailed_results": prompt_results
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
        
        for comp_key, comp_name in comp_map.items():
            missing_count = 0
            opportunities = []
            total = len(prompt_results)
            
            for res in prompt_results:
                ranks = res.get("ranks", {})
                # ranks keys are normalized in analyze_competitor_prompt_wins
                rank = ranks.get(comp_key)
                
                # If rank is missing or > 5 (weak), it's an opportunity
                # We assume rank 1-5 is "strong", >5 is "weak"
                is_weak = rank is None or rank > 5
                
                if is_weak:
                    missing_count += 1
                    # Opportunity score: 100 if missing completely
                    # If rank 6, score 60. If rank 10, score 80.
                    opp_score = 100
                    if rank is not None:
                        opp_score = min(90, 50 + (rank * 2))
                    
                    opportunities.append({
                        "prompt": res.get("prompt"),
                        "rank": rank,
                        "opportunityScore": opp_score
                    })
            
            gap_score = (missing_count / total * 100.0) if total > 0 else 0.0
            
            gap_data.append({
                "competitor": comp_name,
                "gapScore": round(gap_score, 1),
                "missingPrompts": missing_count,
                # Potential gain is proportional to the gap - if they are missing it, we can take it.
                "potentialGainPercent": round(gap_score * 0.8, 1), 
                "opportunities": opportunities
            })
            
        # Sort by gap score (descending) - biggest opportunities first
        gap_data.sort(key=lambda x: x["gapScore"], reverse=True)
        
        return gap_data
