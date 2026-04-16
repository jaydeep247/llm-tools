# competitor_ai_intelligence.py
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
 
    suffixes = [
        " inc", " corp", " llc", " ltd", " gmbh", " plc", " sa", " nv", " co",
        " company", " corporation", " incorporated", " limited", " group", " holdings"
    ]
    suffixes.sort(key=len, reverse=True)
 
    def process_term(t: str):
        if not t:
            return
        add_term(t)
        root = t.split(".")[0]
        if root and root != t:
            add_term(root)
        cleaned = t
        for suffix in suffixes:
            pattern = rf"{re.escape(suffix)}\.?$"
            if re.search(pattern, cleaned):
                cleaned = re.sub(pattern, "", cleaned).strip()
                break
        if cleaned and cleaned != t:
            add_term(cleaned)
        parts = cleaned.split()
        if len(parts) > 1:
            first = parts[0]
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
    # Strip markdown code fences that models sometimes add
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()
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
                parsed = json.loads(raw[start: end + 1])
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
        return None
 
 
# ─────────────────────────────────────────────────────────────────────────────
# CITATION SCORE CALCULATOR
# Implements SOP-007 §2 Step 3 signal weights exactly:
#   Citation Present (URL)     → 30 pts
#   Brand Name Mentioned       → 25 pts
#   First Mention Position     → 20 pts  (pos1=20, pos5+=4, linear between)
#   Mention Sentiment          → 15 pts  (positive=15, neutral=7.5, neg=0)
#   Answer Section (title)     → 10 pts
# ─────────────────────────────────────────────────────────────────────────────
 
def _compute_citation_score(
    citation_present: bool,
    mention_present: bool,
    mention_position: Optional[int],
    mention_sentiment: float,   # -1.0 to +1.0
    mention_in_title: bool,
) -> float:
    """
    Compute Citation Score 0-100 per SOP-007 §2 Step 3 weights.
    """
    score = 0.0
 
    # 1. URL explicitly cited — 30 pts
    if citation_present:
        score += 30.0
 
    # 2. Brand name appears in response — 25 pts
    if mention_present:
        score += 25.0
 
    # 3. Position score:
    #    pos 1  → 20 pts
    #    pos 5+ → 4 pts
    #    linear: pos2=16, pos3=12, pos4=8
    if mention_position is not None and mention_position > 0:
        if mention_position == 1:
            pos_score = 20.0
        elif mention_position >= 5:
            pos_score = 4.0
        else:
            pos_score = 20.0 - (mention_position - 1) * 4.0
        score += pos_score
 
    # 4. Sentiment: maps -1.0→+1.0 onto 0→15 pts
    #    SOP: sentiment is a context signal — only scores when brand is actually
    #    present (mentioned OR URL cited). No presence = no context = no points.
    #    neutral (0.0) = 7.5 pts, positive (1.0) = 15 pts, negative (-1.0) = 0 pts
    if mention_present or citation_present:
        sentiment_pts = max(0.0, min(15.0, (mention_sentiment + 1.0) / 2.0 * 15.0))
        score += sentiment_pts
 
    # 5. Title/heading mention — 10 pts
    if mention_in_title:
        score += 10.0
 
    return round(min(100.0, score), 2)
 
 
def _estimate_sentiment(text: str, brand_name: str, aliases: Optional[List[str]] = None) -> float:
    """
    Estimate sentiment around a brand mention (-1.0 to +1.0).
    """
    # ── 1. Locate mention ────────────────────────────────────────────────────
    names = [brand_name] + (aliases or [])
    idx = -1
    found_name = brand_name
    
    for name in names:
        if not name: continue
        idx = text.lower().find(name.lower())
        if idx != -1:
            found_name = name
            break
            
    if idx == -1:
        return 0.0
    ctx = text[max(0, idx - 400): min(len(text), idx + 400)].lower()
 
    # ── 2. Weighted keyword tables ───────────────────────────────────────────
    # (keyword, weight) — weights sum-averaged at the end
    _POS_KEYWORDS: List[Tuple[str, float]] = [
        ("best", 2.0), ("top", 1.5), ("leading", 2.0), ("excellent", 2.0),
        ("great", 1.5), ("innovative", 1.5), ("popular", 1.0),
        ("recommended", 2.0), ("powerful", 1.5), ("comprehensive", 1.5),
        ("trusted", 2.0), ("award", 1.5), ("winner", 1.5),
        ("superior", 2.0), ("advanced", 1.5), ("reliable", 1.5),
        ("fast", 1.0), ("good", 1.0), ("strong", 1.0), ("effective", 1.5),
        ("first choice", 2.0), ("market leader", 2.0),
    ]
    _NEG_KEYWORDS: List[Tuple[str, float]] = [
        ("slow", 1.5), ("expensive", 1.5), ("limited", 1.0),
        ("complex", 1.0), ("difficult", 1.0), ("bad", 2.0),
        ("poor", 2.0), ("weak", 1.5), ("overpriced", 2.0),
        ("buggy", 2.0), ("outdated", 1.5), ("deprecated", 2.0),
        ("unreliable", 2.0), ("lack", 1.0), ("lacking", 1.0),
        ("worse", 1.5), ("worst", 2.0), ("fails", 1.5), ("avoid", 2.0),
    ]
 
    # ── 3. Negation patterns ─────────────────────────────────────────────────
    # These up to 5-token prefixes flip the polarity of the keyword that follows
    _NEGATIONS = (
        "not ", "never ", "no ", "isn't ", "aren't ", "wasn't ",
        "doesn't ", "don't ", "didn't ", "hardly ", "barely ",
        "fails to ", "unable to ", "cannot ", "can't ",
    )
 
    def _negated(keyword: str) -> bool:
        """
        Check if the keyword in ctx is preceded within 5 words by a negation.
        """
        pattern = re.compile(rf"\b{re.escape(keyword)}\b", re.IGNORECASE)
        for m in pattern.finditer(ctx):
            # grab up to 40 chars before the match for negation scan
            prefix = ctx[max(0, m.start() - 40): m.start()]
            if any(neg in prefix for neg in _NEGATIONS):
                return True
        return False
 
    # ── 4. Accumulate weighted scores ────────────────────────────────────────
    pos_score = 0.0
    neg_score = 0.0
    evidence_count = 0
 
    for kw, weight in _POS_KEYWORDS:
        if kw in ctx:
            if _negated(kw):
                neg_score += weight        # negated positive → negative signal
            else:
                pos_score += weight
            evidence_count += 1
 
    for kw, weight in _NEG_KEYWORDS:
        if kw in ctx:
            if _negated(kw):
                pos_score += weight * 0.5  # double-negative → weak positive
            else:
                neg_score += weight
            evidence_count += 1
 
    # ── 5. Comparative context boost ─────────────────────────────────────────
    # "better than", "ahead of", "outperforms" near brand → positive
    _POS_COMPARATIVES = ("better than", "ahead of", "outperforms", "leads over", "surpasses")
    _NEG_COMPARATIVES = ("worse than", "behind", "lags behind", "trails")
    for phrase in _POS_COMPARATIVES:
        if phrase in ctx:
            pos_score += 1.5
            evidence_count += 1
    for phrase in _NEG_COMPARATIVES:
        if phrase in ctx:
            neg_score += 1.5
            evidence_count += 1
 
    # ── 6. Neutral bias for low-evidence context ─────────────────────────────
    if evidence_count < 2:
        return 0.0
 
    total = pos_score + neg_score
    if total == 0:
        return 0.0
 
    raw = (pos_score - neg_score) / total       # range [-1, +1]
    return round(max(-1.0, min(1.0, raw)), 3)
 
 
def _detect_title_mention(text: str, brand_name: str, aliases: Optional[List[str]] = None) -> bool:
    """Return True if brand or its aliases appear inside a markdown heading OR start of a list item."""
    names = [brand_name] + (aliases or [])
    # Escape and join names for regex
    names_pattern = "|".join([re.escape(n) for n in names if n])
    
    # Matches:
    # 1. ### Brand Name
    # 2. 1. Brand Name:
    # 3. **Brand Name**
    pattern = rf"(?:^#{1,3}\s|^[\d\-\*]\.?\s|\*\*|^)(?:{names_pattern})"
    return bool(re.search(pattern, text, re.IGNORECASE | re.MULTILINE))
 
 
# ─────────────────────────────────────────────────────────────────────────────
# BENCHMARK SCORE AGGREGATOR
# Implements SOP-007 §2 Step 4:
#   Benchmark Score = Σ(citation_score) / total_prompts
#   Share of Voice  = entity_score / Σ all_entity_scores × 100
#   Rank            = RANK() by Benchmark Score DESC
# ─────────────────────────────────────────────────────────────────────────────
 
def _aggregate_benchmark_scores(
    per_model: Dict[str, Dict[str, Any]],
    entities: List[EntityTerms],
    brand_key: str,
    brand_name_display: str,
    total_mentions_all_entities: int,
) -> Tuple[Dict[str, Dict[str, Any]], Optional[float]]:
    """
    Given per-model entity stats, compute final aggregate scores for every entity.
 
    Returns:
        aggregate dict  — entity_name → full score dict
        brand_avg_rank  — brand's average rank across models (or None)
    """
    total_models = len(per_model)
 
    aggregate: Dict[str, Dict[str, Any]] = {}
    for e in entities:
        aggregate[e.name] = {
            "name": e.name,
            "visibility_score": 0.0,
            "benchmark_score": 0.0,
            "share_of_voice": 0.0,
            "rank_position": 0,           # SOP §2 Step 4: RANK() by benchmark DESC
            "rank_difference_vs_brand": None,
            "market_share_percent": 0.0,
            "mentions_total": 0,
            "mentioned_in_models": 0,
            "avg_rank": None,
            "avg_rank_percentile": 0.0,
            "per_model": {},
            # SOP §3 Screen 4 — cited URL aggregates across all models
            "cited_urls": [],
            "citation_count": 0,
        }
 
    # Rename brand row to display name
    if brand_key in aggregate and brand_name_display:
        aggregate[brand_key]["name"] = brand_name_display
 
    # Accumulate per-model stats
    for model_name, model_data in per_model.items():
        model_entities = model_data.get("entities") or {}
        for entity_name, s in model_entities.items():
            if entity_name not in aggregate:
                continue
            mentions = int(s.get("mentions") or 0)
            aggregate[entity_name]["mentions_total"] += mentions
            if mentions > 0:
                aggregate[entity_name]["mentioned_in_models"] += 1
            # Accumulate cited URLs across models (deduplicated)
            for cited_url in (s.get("cited_urls") or []):
                if cited_url not in aggregate[entity_name]["cited_urls"]:
                    aggregate[entity_name]["cited_urls"].append(cited_url)
            if s.get("citation_present"):
                aggregate[entity_name]["citation_count"] += 1
            aggregate[entity_name]["per_model"][model_name] = {
                "mentions":         mentions,
                "rank":             s.get("rank"),
                "rank_percentile":  s.get("rank_percentile"),
                "first_position":   s.get("first_position"),
                "sentiment":        float(s.get("sentiment") or 0.0),
                "in_title":         bool(s.get("in_title", False)),
                "citation_present": bool(s.get("citation_present", False)),
                "cited_urls":       list(s.get("cited_urls") or []),
            }
 
    # Compute derived scores per entity
    for entity_name, row in aggregate.items():
        # Visibility Score = % of models where entity was mentioned (0-100)
        mention_rate = (row["mentioned_in_models"] / total_models) * 100.0 if total_models else 0.0
        row["visibility_score"] = round(max(0.0, min(100.0, mention_rate)), 1)
 
        # Market Share = entity mentions / total mentions across all entities
        if total_mentions_all_entities > 0:
            row["market_share_percent"] = round(
                (row["mentions_total"] / total_mentions_all_entities) * 100.0, 1
            )
 
        # Average rank + rank percentile across models where mentioned
        ranks = [
            v["rank"] for v in row["per_model"].values()
            if isinstance(v.get("rank"), int)
        ]
        row["avg_rank"] = round(sum(ranks) / len(ranks), 2) if ranks else None
 
        rank_percentiles = [
            v["rank_percentile"] for v in row["per_model"].values()
            if isinstance(v.get("rank_percentile"), (int, float)) and v.get("rank") is not None
        ]
        row["avg_rank_percentile"] = round(
            sum(rank_percentiles) / len(rank_percentiles), 1
        ) if rank_percentiles else 0.0
 
        # ── SOP §2 Step 4 — Benchmark Score exact formula ───────────────────
        # Benchmark Score = Σ(citation_score × prompt_weight) / total_prompts
        #
        # Per-snapshot citation_scores live in cbm_citation_snapshots. At the
        # visibility-comparison stage we reconstruct them from the per-model
        # stats that ARE available here, using _compute_citation_score().
        #
        # Signals available per model:
        #   citation_present  → False (URL extraction happens in cbm-extraction-svc;
        #                        not available at compare-visibility stage)
        #   mention_present   → mentions > 0
        #   mention_position  → rank (ordinal position among mentioned entities)
        #   mention_sentiment → estimated via _estimate_sentiment() if raw text
        #                       is available; falls back to neutral (0.0) here
        #   mention_in_title  → False (heading detection requires raw response text)
        #
        # Because citation_present and mention_in_title are always False at this
        # stage, scores max out at 60 pts (mention 25 + position 20 + sentiment 15).
        # This is correct — full 100-pt scores are only possible when the
        # cbm-extraction-svc runs against raw LLM responses.
        per_model_citation_scores: List[float] = []
        for model_stats in row["per_model"].values():
            cs = _compute_citation_score(
                citation_present  = bool(model_stats.get("citation_present", False)),
                mention_present   = int(model_stats.get("mentions") or 0) > 0,
                mention_position  = model_stats.get("rank"),
                mention_sentiment = float(model_stats.get("sentiment") or 0.0),
                mention_in_title  = bool(model_stats.get("in_title", False)),
            )
            per_model_citation_scores.append(cs)
 
        # Benchmark Score = Σ(citation_score) / total_prompts
        # Each model run is treated as one prompt-equivalent (equal weight = 1.0).
        row["benchmark_score"] = round(
            sum(per_model_citation_scores) / len(per_model_citation_scores), 2
        ) if per_model_citation_scores else 0.0
 
    # ── SOP §2 Step 4 — Share of Voice ──────────────────────────────────────
    # Share of Voice = entity_score / Σ all_entity_scores × 100
    total_benchmark = sum(r["benchmark_score"] for r in aggregate.values())
    for row in aggregate.values():
        row["share_of_voice"] = round(
            (row["benchmark_score"] / total_benchmark * 100.0) if total_benchmark > 0 else 0.0, 1
        )
 
    # ── SOP §2 Step 4 — Rank = RANK() by Benchmark Score DESC ───────────────
    sorted_names = sorted(
        aggregate.keys(),
        key=lambda n: -aggregate[n]["benchmark_score"]
    )
    for rank_pos, name in enumerate(sorted_names, start=1):
        aggregate[name]["rank_position"] = rank_pos
 
    # ── Brand avg rank for rank_difference_vs_brand ──────────────────────────
    brand_agg = aggregate.get(brand_key)
    brand_avg_rank: Optional[float] = brand_agg["avg_rank"] if brand_agg else None
    brand_avg_rank_fallback = brand_avg_rank if brand_avg_rank is not None else 11.0
 
    # rank_difference_vs_brand for each competitor
    for entity_name, row in aggregate.items():
        if entity_name != brand_key and row["avg_rank"] is not None:
            row["rank_difference_vs_brand"] = round(row["avg_rank"] - brand_avg_rank_fallback, 2)
 
    return aggregate, brand_avg_rank
 
 
# ─────────────────────────────────────────────────────────────────────────────
# SOP §6 — PLAN GATING
# Free=0, Pro=3, Agency=10, Enterprise=25 competitors max
# ─────────────────────────────────────────────────────────────────────────────
 
PLAN_COMPETITOR_LIMITS: Dict[str, int] = {
    "free":       0,
    "pro":        3,
    "agency":    10,
    "enterprise": 25,
}
 
 
def _enforce_competitor_limit(competitors: List[str], plan: str) -> List[str]:
    """
    SOP §6: Enforce per-plan competitor count limits.
    Returns the trimmed list. Logs a warning if truncated.
    """
    limit = PLAN_COMPETITOR_LIMITS.get(plan.lower(), 10)  # default agency
    if len(competitors) > limit:
        logger.warning(
            f"Plan '{plan}' allows max {limit} competitors; "
            f"{len(competitors)} supplied — truncating to {limit}."
        )
        return competitors[:limit]
    return competitors
 
 
# ─────────────────────────────────────────────────────────────────────────────
# SOP §3 Screen 4 — CONTENT TYPE AUTO-TAGGER
# Tags a URL/page title as: blog | guide | comparison | tool | faq
# ─────────────────────────────────────────────────────────────────────────────
 
_CONTENT_TYPE_RULES: List[Tuple[str, List[str]]] = [
    # Order matters — more specific patterns first
    ("comparison", ["vs-", "-vs-", "/vs/", "vs.", "compare", "comparison", "versus", "alternative", "alternatives"]),
    ("faq",        ["faq", "frequently-asked", "frequently asked", "questions", "q-and-a", "q&a", "/help/"]),
    ("tool",       ["tool", "calculator", "generator", "checker", "analyzer", "analyser", "audit", "tracker"]),
    # blog checked before guide so /blog/seo-guide → blog not guide
    ("blog",       ["/blog/", "/post/", "/article/", "/news/", "/update/", "/insight/", "/opinion/"]),
    ("guide",      ["guide", "how-to", "how_to", "howto", "tutorial", "step-by-step", "learn", "beginner", "introduction", "rank"]),
]
 
 
def _tag_content_type(url: str, page_title: str = "") -> str:
    """
    SOP §3 Screen 4: auto-tag content type from URL path + page title.
    Returns one of: blog | guide | comparison | tool | faq | page (fallback)
    """
    text = (url + " " + page_title).lower()
    for content_type, keywords in _CONTENT_TYPE_RULES:
        if any(kw in text for kw in keywords):
            return content_type
    return "page"  # generic fallback
 
 
class CompetitorAIIntelligence:
    def __init__(self, models: Optional[List[str]] = None, plan: str = "agency"):
        self.models = models or ["openai", "gemini", "claude"]
        # SOP §6 — plan gating: enforced on every analysis call
        self.plan = plan.lower()
 
    # ─────────────────────────────────────────────────────────────────────────
    # compute_emerging_trends — unchanged logic, bug-free safe floats added
    # ─────────────────────────────────────────────────────────────────────────
 
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
        prev_wins_map = {
            str(r.get("prompt") or "").strip(): r
            for r in prev_details if r.get("prompt")
        }
 
        cur_map = to_map(current_compare or {})
        prev_map = to_map(prev_compare or {})
        names = set(list(cur_map.keys()) + list(prev_map.keys()))
 
        competitor_changes: List[Dict[str, Any]] = []
        deltas: List[float] = []
 
        for name in names:
            cur = cur_map.get(name)
            prev = prev_map.get(name)
 
            # Safe float extraction — avoids TypeError on None values
            def _sf(obj: Any, key: str) -> Optional[float]:
                try:
                    return float((obj or {}).get(key) or 0.0)
                except (TypeError, ValueError):
                    return 0.0
 
            cur_vis   = _sf(cur, "visibility_score")   if cur  else None
            prev_vis  = _sf(prev, "visibility_score")  if prev else None
            cur_share = _sf(cur, "market_share_percent")  if cur  else None
            prev_share= _sf(prev, "market_share_percent") if prev else None
 
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
                # SOP threshold: ±0.5 pts = "rising" / "falling"
                status = "rising" if dv > 0.5 else ("falling" if dv < -0.5 else "stable")
 
            deltas.append(abs(dv))
            competitor_changes.append({
                "name": name,
                "delta_visibility": round(dv, 1),
                "delta_market_share": round(ds, 1),
                "status": status,
                # SOP §3 Screen 6 — fields needed for trend chart delta annotations
                "score_delta": round(dv, 1),      # alias of delta_visibility for cbm_benchmark_scores
                "rank_delta": 0,                   # populated below once ranks are sorted
            })
 
        competitor_changes.sort(
            key=lambda x: abs(x.get("delta_visibility", 0)), reverse=True
        )
 
        # Prompt winner swings
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
 
        # Model targeting
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
            uniq, seen_set = [], set()
            for n in model_targeting[mdl]:
                if n not in seen_set:
                    seen_set.add(n)
                    uniq.append(n)
            model_targeting[mdl] = uniq[:8]
 
        # Threat level
        # high  = any competitor gained ≥10 pts OR a prompt flipped to competitor
        # medium= any competitor gained ≥5 pts
        # low   = everything else
        max_up = max(
            (c["delta_visibility"] for c in competitor_changes if c["delta_visibility"] > 0),
            default=0.0,
        )
        flipped = any(sw.get("to") == "competitor" for sw in prompt_swings)
        if max_up >= 10 or flipped:
            threat_level = "high"
        elif max_up >= 5:
            threat_level = "medium"
        else:
            threat_level = "low"
 
        trends_detected = (
            sum(1 for c in competitor_changes if c["status"] != "stable") + len(prompt_swings)
        )
        avg_visibility_delta = round(sum(deltas) / len(deltas), 1) if deltas else 0.0
        new_prompts = len([
            r for r in cur_details
            if str(r.get("prompt") or "").strip()
            and str(r.get("prompt") or "").strip() not in prev_wins_map
        ])
 
        return {
            "competitor_changes": competitor_changes[:10],
            "prompt_swings": prompt_swings[:10],
            "model_targeting": model_targeting,
            "summary": {
                "trends_detected": trends_detected,
                "avg_visibility_delta": avg_visibility_delta,
                "new_prompts": new_prompts,
                "threat_level": threat_level,
            },
        }
 
    # ─────────────────────────────────────────────────────────────────────────
    # generate_metric_recommendations — same prompts, fixed metric extraction
    # ─────────────────────────────────────────────────────────────────────────
 
    async def generate_metric_recommendations(
        self,
        visibility_data: Dict[str, Any],
        win_rate_data: Dict[str, Any],
        gap_data: List[Dict[str, Any]],
        source_data: Dict[str, Any],
    ) -> Dict[str, Dict[str, str]]:
 
        brand = visibility_data.get("brand") or {}
        competitors = visibility_data.get("competitors") or []
 
        brand_vis             = float(brand.get("visibility_score") or 0)
        brand_share           = float(brand.get("market_share_percent") or 0)
        brand_mentions_total  = int(brand.get("mentions_total") or 0)
        brand_mentioned_models= int(brand.get("mentioned_in_models") or 0)
        brand_avg_rank        = brand.get("avg_rank")
 
        summary         = win_rate_data.get("summary") or {}
        total_prompts   = int(summary.get("total_prompts") or 0)
        brand_wins      = int(summary.get("brand_wins") or 0)
        competitor_wins = int(summary.get("competitor_wins") or 0)
        brand_win_rate  = float(summary.get("brand_win_rate") or 0)
        comp_win_rate   = float(summary.get("competitor_win_rate") or 0)
 
        avg_gap_score = total_missing_prompts = avg_potential_gain_percent = 0.0
        top_gap_competitor_name = ""
        top_gap_score = 0.0
        if gap_data:
            avg_gap_score              = sum(float(g.get("gapScore") or 0) for g in gap_data) / len(gap_data)
            total_missing_prompts      = sum(int(g.get("missingPrompts") or 0) for g in gap_data)
            avg_potential_gain_percent = sum(float(g.get("potentialGainPercent") or 0) for g in gap_data) / len(gap_data)
            top_gap                    = max(gap_data, key=lambda g: float(g.get("gapScore") or 0))
            top_gap_competitor_name    = str(top_gap.get("competitor") or "").strip()
            top_gap_score              = float(top_gap.get("gapScore") or 0)
 
        source_list = source_data.get("competitor_source_analysis") or []
        avg_influence = avg_domain_authority = total_citations = avg_unique_domains = 0.0
        if source_list:
            avg_influence        = sum(float(s.get("source_domain_influence_score") or 0) for s in source_list) / len(source_list)
            avg_domain_authority = sum(float(s.get("average_domain_authority") or 0) for s in source_list) / len(source_list)
            total_citations      = sum(int(s.get("citation_count") or 0) for s in source_list)
            avg_unique_domains   = sum(int(s.get("unique_domains") or 0) for s in source_list) / len(source_list)
 
        top_comp = None
        if competitors and isinstance(competitors, list):
            top_comp = max(competitors, key=lambda c: float((c or {}).get("visibility_score") or 0))
        top_comp_name     = str((top_comp or {}).get("name") or "")
        top_comp_vis      = float((top_comp or {}).get("visibility_score") or 0) if top_comp else 0.0
        top_comp_share    = float((top_comp or {}).get("market_share_percent") or 0) if top_comp else 0.0
        top_comp_avg_rank = (top_comp or {}).get("avg_rank") if top_comp else None
 
        prompt = (
            "You are an expert SEO and AI visibility strategist. based on the following metrics for a brand:\n\n"
            f"- AI Visibility Score: {brand_vis}/100\n"
            f"- Market Share: {brand_share}%\n"
            f"- Mentions total: {brand_mentions_total} across {brand_mentioned_models} models\n"
            f"- Avg rank (when mentioned): {brand_avg_rank}\n"
            f"- Brand wins: {brand_wins}/{total_prompts} ({brand_win_rate}%)\n"
            f"- Competitor wins: {competitor_wins}/{total_prompts} ({comp_win_rate}%)\n"
            f"- Content Gap Score (avg): {round(avg_gap_score, 1)}/100 (higher = bigger gap)\n"
            f"- Missing prompts (total across competitors): {int(total_missing_prompts)}\n"
            f"- Potential gain (avg %): {round(avg_potential_gain_percent, 1)}%\n"
            f"- Top gap competitor: {top_gap_competitor_name} ({round(top_gap_score, 1)}/100)\n"
            f"- Competitor Source Influence (avg): {round(avg_influence, 1)}/100\n"
            f"- Competitor Source Domain Authority (avg): {round(avg_domain_authority, 1)}/100\n"
            f"- Competitor Source Citations (total): {int(total_citations)}\n"
            f"- Competitor Source Unique Domains (avg): {round(avg_unique_domains, 1)}\n"
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
            "- missing_prompts\n"
            "- potential_gain\n"
            "- source_influence\n"
            "- avg_domain_authority\n"
            "- total_citations\n"
            "- rank_delta (explain what Rank Δ vs Brand means and how to reduce it)\n\n"
            "Return ONLY valid JSON in this exact structure:\n"
            "{\n"
            '  "visibility_score": {"why": "...", "fix": "..."},\n'
            '  "market_share": {"why": "...", "fix": "..."},\n'
            '  "brand_win_rate": {"why": "...", "fix": "..."},\n'
            '  "competitor_win_rate": {"why": "...", "fix": "..."},\n'
            '  "content_gap_score": {"why": "...", "fix": "..."},\n'
            '  "missing_prompts": {"why": "...", "fix": "..."},\n'
            '  "potential_gain": {"why": "...", "fix": "..."},\n'
            '  "source_influence": {"why": "...", "fix": "..."},\n'
            '  "avg_domain_authority": {"why": "...", "fix": "..."},\n'
            '  "total_citations": {"why": "...", "fix": "..."},\n'
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
                    why = str(value.get("why") or "").strip()
                    fix = str(value.get("fix") or "").strip()
                    return {"why": why, "fix": fix} if (why or fix) else None
                return None
 
            recs: Dict[str, Dict[str, str]] = {}
            for k in [
                "visibility_score", "market_share", "brand_win_rate",
                "competitor_win_rate", "content_gap_score", "missing_prompts",
                "potential_gain", "source_influence", "avg_domain_authority",
                "total_citations", "rank_delta",
            ]:
                n = normalize(resp_data.get(k))
                if n:
                    recs[k] = n
 
            # ── Hardcoded fallbacks (data-driven) ────────────────────────────
            if "visibility_score" not in recs:
                recs["visibility_score"] = {
                    "why": f"Visibility is {brand_vis}/100 vs {top_comp_name or 'top competitor'} at {top_comp_vis}/100; mentions across models are limited.",
                    "fix": "Publish prompt-target landing pages, add comparison/alternatives sections, implement Organization/Product schema, strengthen entity consistency across site, earn citations from authoritative industry sites.",
                }
            if "market_share" not in recs:
                recs["market_share"] = {
                    "why": f"Market share is {brand_share}%; higher share comes from more frequent mentions and citations.",
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
            if "missing_prompts" not in recs:
                recs["missing_prompts"] = {
                    "why": f"There are {int(total_missing_prompts)} missing prompt positions across competitors (rank missing or outside top 3).",
                    "fix": "Prioritize prompts where top competitors are missing, publish prompt-target pages with direct answers, add comparisons/alternatives blocks, ensure internal links to these pages, align titles/headings to the exact prompt language.",
                }
            if "potential_gain" not in recs:
                recs["potential_gain"] = {
                    "why": f"Potential gain is ~{round(avg_potential_gain_percent, 1)}% on average; bigger gaps mean more visibility you can capture.",
                    "fix": "Start with the highest-opportunity prompts, improve topical depth and entity coverage, add structured sections for extraction, strengthen citations and trust signals, iterate using re-runs to confirm rank improvements.",
                }
            if "source_influence" not in recs:
                recs["source_influence"] = {
                    "why": f"Avg source influence is {round(avg_influence, 1)}/100; weaker citations reduce model trust signals.",
                    "fix": "Publish original research, secure citations from high-authority domains, build partner pages and integrations, get listed in trusted directories, improve E-E-A-T signals.",
                }
            if "avg_domain_authority" not in recs:
                recs["avg_domain_authority"] = {
                    "why": f"Avg citing-domain authority is {round(avg_domain_authority, 1)}/100; higher-authority sources confer stronger trust signals.",
                    "fix": "Pitch data-backed stories to high-DA publishers, publish original benchmarks and reports, build partner/integration pages for authoritative mentions, earn .edu/.gov citations where relevant, improve PR targeting.",
                }
            if "total_citations" not in recs:
                recs["total_citations"] = {
                    "why": f"Total competitor citations tracked is {int(total_citations)}; higher citation volume correlates with broader brand footprint.",
                    "fix": "Increase cite-worthy assets (studies, tools, stats pages), run digital PR campaigns around unique data, expand via partners/directories, refresh cornerstone pages, pursue outreach to top industry publications.",
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
 
    # ─────────────────────────────────────────────────────────────────────────
    # analyze_competitor_sources — fixed influence score calculation
    # ─────────────────────────────────────────────────────────────────────────
 
    async def analyze_competitor_sources(
        self,
        competitors: List[str],
        topic: Optional[str] = None,
    ) -> Dict[str, Any]:
 
        if not competitors:
            return {}
        if not topic:
            topic = "their industry"
 
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
                    isinstance(data, dict) and data
                    and all(isinstance(k, str) for k in data.keys())
                    and all(isinstance(v, list) for v in data.values())
                ):
                    sources_map = data
                    break
 
            if not sources_map:
                return {}
 
            results = []
 
            for comp, sources in sources_map.items():
                if not sources:
                    continue
 
                domains: List[str] = []
                authority_by_domain: Dict[str, float] = {}
 
                for s in sources:
                    if not isinstance(s, dict):
                        continue
                    raw_domain = str(s.get("domain") or "").strip().lower()
                    raw_url    = str(s.get("url") or "").strip()
                    candidate  = raw_url or raw_domain
                    d = _extract_domain(candidate) if candidate else ""
                    if not d and candidate:
                        d = _normalize_term(candidate).split("/")[0]
                    if not d:
                        continue
                    try:
                        da = float(s.get("authority_score") or 0)
                    except (TypeError, ValueError):
                        da = 0.0
                    domains.append(d)
                    # Keep the highest DA if same domain appears more than once
                    authority_by_domain[d] = max(authority_by_domain.get(d, 0.0), da)
 
                citation_count = len(domains)
                if citation_count == 0:
                    continue
 
                freq: Dict[str, int] = {}
                for d in domains:
                    freq[d] = freq.get(d, 0) + 1
 
                unique_domain_count = len(freq)
 
                # Average DA = simple average across unique domains
                avg_auth = round(
                    sum(authority_by_domain.values()) / unique_domain_count, 1
                ) if unique_domain_count else 0.0
 
                # Influence score = frequency-weighted DA average
                # Domains cited more often count more toward the score
                total_influence = sum(
                    authority_by_domain.get(d, 0.0) * freq[d] for d in freq
                )
                influence_score = round(total_influence / citation_count, 1)
 
                source_diversity_ratio = round(unique_domain_count / citation_count, 3)
 
                types = [
                    str((s or {}).get("citation_type") or "").strip().lower()
                    for s in sources if isinstance(s, dict)
                ]
                types = [t for t in types if t]
 
                # SOP §3 Screen 4 — auto-tag content_type on each citation
                # if model didn't supply it, derive from URL + page title
                tagged_citations = []
                for s in sources:
                    if not isinstance(s, dict):
                        continue
                    s_copy = dict(s)
                    if not s_copy.get("content_type"):
                        s_copy["content_type"] = _tag_content_type(
                            str(s_copy.get("url") or s_copy.get("domain") or ""),
                            str(s_copy.get("page_title") or ""),
                        )
                    tagged_citations.append(s_copy)
 
                results.append({
                    "competitor": comp,
                    "source_domain_influence_score": influence_score,
                    "average_domain_authority": avg_auth,
                    "credibility_score": avg_auth,
                    "citation_count": citation_count,
                    "source_diversity": source_diversity_ratio,
                    "unique_domains": unique_domain_count,
                    "citation_frequency": [
                        {"domain": d, "count": int(freq[d])}
                        for d in sorted(freq, key=lambda k: (-freq[k], k))[:20]
                    ],
                    "type_diversity": len(set(types)),
                    "top_citations": tagged_citations,  # SOP §3 Screen 4: content_type tagged
                })
 
            results.sort(key=lambda x: x["source_domain_influence_score"], reverse=True)
            return {"competitor_source_analysis": results}
 
        except Exception as e:
            logger.exception(f"Error in analyze_competitor_sources: {e}")
            return {}
 
    # ─────────────────────────────────────────────────────────────────────────
    # compare_visibility_against_competitors
    # Key fix: uses _aggregate_benchmark_scores() for correct SOV + benchmark
    # ─────────────────────────────────────────────────────────────────────────
 
    async def compare_visibility_against_competitors(
        self,
        url: str,
        competitors: List[str],
        brand_name: Optional[str] = None,
        topic: Optional[str] = None,
        competitor_configs: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:

        brand_domain = _extract_domain(url)
        brand_terms_extra = [brand_name] if brand_name else []

        # SOP §6 — enforce plan competitor limit before processing
        competitors = _enforce_competitor_limit(list(competitors), self.plan)

        # SOP §2 Step 1 — merge aliases and metadata from competitor_config
        _alias_map: Dict[str, List[str]] = {}
        _config_id_map: Dict[str, str] = {}
        _display_order_map: Dict[str, int] = {}
        if competitor_configs:
            for cfg in competitor_configs:
                cfg_name = _normalize_term(
                    str(cfg.get("competitor_name") or cfg.get("name") or "")
                )
                if not cfg_name:
                    continue
                _alias_map[cfg_name] = list(cfg.get("brand_aliases") or [])
                cfg_id = str(cfg.get("id") or "")
                if cfg_id:
                    _config_id_map[cfg_name] = cfg_id
                _display_order_map[cfg_name] = int(cfg.get("display_order") or 0)

        entities: List[EntityTerms] = [
            _make_entity_terms(brand_domain, extra_terms=brand_terms_extra),
            *[
                _make_entity_terms(
                    c,
                    extra_terms=_alias_map.get(_normalize_term(c), []),
                )
                for c in competitors
            ],
        ]
 
        # Deduplicate entities
        normalized_entities, seen = [], set()
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
 
            seen_local: set = set()
            company_list_unique: List[str] = []
            for c in company_list:
                k = _normalize_term(c)
                if not k or k in seen_local:
                    continue
                seen_local.add(k)
                company_list_unique.append(c)
 
            examples_clause = ""
            if examples:
                examples_clean = [e for e in examples if e]
                if examples_clean:
                    examples_clause = f" (Examples: {', '.join(examples_clean)})"
 
            return (
                f"You are analyzing {topic_label}{examples_clause}.\n\n"
                "Company list (you MUST mention every company at least once in your answer):\n"
                f"{', '.join(company_list_unique)}\n\n"
                "Tasks:\n"
                f"1) Rank the companies above for {topic_label} from best to worst. Use a numbered list.\n"
                "2) For each company, provide its name as a heading or list item, a 1-line reason focused on strengths, and its official website URL if known.\n"
                "3) End with a short 'Honorable mentions' line that repeats any company not in your top 5.\n"
            )
 
        topic_used = topic
        batch_prompt = _build_batch_prompt(topic_used)
        entity_patterns = {e.name: _compile_patterns(e.terms) for e in entities}
        entity_terms_map = {e.name: e.terms for e in entities}
 
        async def _run_models(prompt_text: str) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, str]]:
            async def _query(model: str) -> Tuple[str, Optional[str], Optional[str]]:
                resp = await execute_task(
                    task_name=f"module_e_ai_sov_{model}",
                    input_data={"messages": [{"role": "user", "content": prompt_text}]},
                    provider=model,
                    options={"temperature": 0.4, "skip_cache": True},
                )
                if not resp.success:
                    return model, None, resp.error or "Model call failed"
                return model, str(resp.data), None
 
            outputs = await asyncio.gather(
                *[_query(m) for m in self.models], return_exceptions=True
            )
 
            per_model_local: Dict[str, Dict[str, Any]] = {}
            model_errors_local: Dict[str, str] = {}
 
            for out in outputs:
                if isinstance(out, Exception):
                    continue
                model, text_raw, err = out
                if err or not text_raw:
                    model_errors_local[model] = err or "Empty response"
                    continue
 
                text = text_raw.lower()
                mentioned: List[Tuple[str, int]] = []
                entity_stats: Dict[str, Dict[str, Any]] = {}
 
                # ── URL extraction (SOP §5.1 Table 2 cited_url + Screen 4) ──
                # Extract all http/https URLs from the raw (case-preserved) response.
                # Map each URL back to whichever entity domain it belongs to.
                _URL_RE = re.compile(r'https?://[^\s\)\]>,"\']+', re.IGNORECASE)
                raw_urls = _URL_RE.findall(text_raw)
                # Build entity → [cited_url] map for this model response
                entity_cited_urls: Dict[str, List[str]] = {}
                for raw_url in raw_urls:
                    url_domain = _extract_domain(raw_url)
                    for entity in entities:
                        for term in entity.terms:
                            if term and (term in url_domain or url_domain.endswith("." + term)):
                                entity_cited_urls.setdefault(entity.name, [])
                                if raw_url not in entity_cited_urls[entity.name]:
                                    entity_cited_urls[entity.name].append(raw_url)
                                break
 
                for entity_name, patterns in entity_patterns.items():
                    spans = _find_unique_spans(text, patterns)
                    count = len(spans)
                    first_pos = spans[0][0] if spans else None
                    aliases = entity_terms_map.get(entity_name, [])
 
                    # ── Sentiment from raw text (SOP §2 Step 3, weight 15 pts) ──
                    sentiment = _estimate_sentiment(text_raw, entity_name, aliases=aliases) if count > 0 else 0.0
 
                    # ── Title/heading detection (SOP §2 Step 3, weight 10 pts) ──
                    in_title = _detect_title_mention(text_raw, entity_name, aliases=aliases)
 
                    # ── Citation present = URL from this entity's domain cited ──
                    cited_urls_for_entity = entity_cited_urls.get(entity_name, [])
                    citation_present = len(cited_urls_for_entity) > 0
 
                    entity_stats[entity_name] = {
                        "mentions":         count,
                        "first_position":   first_pos,
                        "rank":             None,
                        "rank_percentile":  0.0,
                        "sentiment":        sentiment,
                        "in_title":         in_title,
                        "citation_present": citation_present,
                        "cited_urls":       cited_urls_for_entity,
                    }
                    if first_pos is not None:
                        mentioned.append((entity_name, first_pos))
 
                mentioned.sort(key=lambda x: x[1])
                n = len(mentioned)
                for idx, (entity_name, _) in enumerate(mentioned):
                    rank = idx + 1
                    rank_percentile = (
                        100.0 if n <= 1
                        else round((1 - (rank - 1) / n) * 100.0, 1)
                    )
                    entity_stats[entity_name]["rank"] = rank
                    entity_stats[entity_name]["rank_percentile"] = rank_percentile
 
                per_model_local[model] = {
                    "entities": entity_stats,
                    "mentioned_entities": n,
                }
 
            return per_model_local, model_errors_local
 
        def _has_any_mentions(per_model_data: Dict[str, Dict[str, Any]]) -> bool:
            for md in per_model_data.values():
                for s in (md.get("entities") or {}).values():
                    if int(s.get("mentions") or 0) > 0:
                        return True
            return False
 
        per_model, model_errors = await _run_models(batch_prompt)
 
        # Fallback 1 — infer topic if no mentions found
        if per_model and not _has_any_mentions(per_model):
            try:
                hint_resp = await execute_task(
                    task_name="module_e_industry_inference",
                    input_data={"messages": [{"role": "user", "content": (
                        "Given these websites/brands, infer a short market/topic label (2-6 words). "
                        f"Return only the label.\n\n{', '.join([brand_domain] + competitors[:8])}"
                    )}]},
                    provider=self.models[0],
                    options={"temperature": 0.2, "max_tokens": 30, "skip_cache": True},
                )
                if hint_resp.success and hint_resp.data:
                    inferred = str(hint_resp.data).splitlines()[0].strip()
                    inferred = re.sub(r"^(topic|industry|niche)\s*[:\-]\s*", "", inferred, flags=re.IGNORECASE)
                    inferred = inferred.strip().strip('"').strip("'")
                    if inferred:
                        topic_used = inferred
                        batch_prompt = _build_batch_prompt(topic_used)
                        per_model, model_errors = await _run_models(batch_prompt)
            except Exception:
                pass
 
        # Fallback 2 — add short domain-root examples to prompt
        if per_model and not _has_any_mentions(per_model):
            examples: List[str] = []
            for c in [brand_domain] + competitors[:5]:
                root = _normalize_term(c).split(".")[0]
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
 
        # Count total mentions across ALL entities across ALL models
        total_mentions_all_entities = sum(
            int(s.get("mentions") or 0)
            for md in per_model.values()
            for s in (md.get("entities") or {}).values()
        )
 
        brand_key = _normalize_term(brand_domain)
        brand_name_display = (
            brand_name.strip()
            if isinstance(brand_name, str) and brand_name.strip()
            else brand_domain
        )
 
        # ── Core aggregation (benchmark + SOV + rank delta) ─────────────────
        aggregate, brand_avg_rank = _aggregate_benchmark_scores(
            per_model, entities, brand_key, brand_name_display, total_mentions_all_entities
        )

        # SOP §2 Step 1 — attach competitor_config metadata (entity_id, display_order)
        for entity_name, row in aggregate.items():
            row["entity_id"] = _config_id_map.get(entity_name)
            row["display_order"] = _display_order_map.get(entity_name, 0)

        # Brand entity_type marker for downstream snapshot writer
        if brand_key in aggregate:
            aggregate[brand_key]["entity_type"] = "client"

        # Brand probe — if brand has zero mentions, do a lightweight check
        if brand_key in aggregate and aggregate[brand_key]["mentioned_in_models"] == 0:
            try:
                brand_label = brand_name_display or brand_key
                probe_prompt = (
                    f"In the context of {topic_used}, is '{brand_label}' a notable provider? "
                    "Return JSON with keys: present (true/false) and rank (1-10 or null). "
                    'Example: {"present": true, "rank": 7}'
                )
                for probe_model in self.models:
                    resp_probe = await execute_task(
                        task_name=f"module_f_brand_probe_{probe_model}",
                        input_data={"messages": [{"role": "user", "content": probe_prompt}]},
                        provider=probe_model,
                        options={"temperature": 0.2, "skip_cache": True},
                    )
                    data = _safe_parse_json(resp_probe.data) if resp_probe and resp_probe.success else None
                    present = bool((data or {}).get("present"))
                    rank_val = (data or {}).get("rank")
                    if present:
                        rp = 100.0
                        if isinstance(rank_val, (int, float)) and rank_val and rank_val > 0:
                            rp = round((1 - (min(float(rank_val), 10.0) - 1) / 10.0) * 100.0, 1)
                        aggregate[brand_key]["mentioned_in_models"] = 1
                        aggregate[brand_key]["mentions_total"] += 1
                        aggregate[brand_key]["visibility_score"] = round(1 / len(per_model) * 100.0, 1)
                        aggregate[brand_key]["per_model"][probe_model] = {
                            "mentions": 1,
                            "rank": int(rank_val) if isinstance(rank_val, int) else 1,
                            "rank_percentile": rp,
                            "first_position": 0,
                        }
                        # Recompute benchmark for brand after probe using real citation score
                        probe_cs = _compute_citation_score(
                            citation_present  = False,
                            mention_present   = True,
                            mention_position  = int(rank_val) if isinstance(rank_val, int) else 1,
                            mention_sentiment = 0.0,
                            mention_in_title  = False,
                        )
                        aggregate[brand_key]["benchmark_score"] = round(probe_cs, 2)
                        break
            except Exception:
                pass
 
        competitors_rows = [
            aggregate[_normalize_term(c)]
            for c in competitors
            if _normalize_term(c) in aggregate
        ]
        competitors_rows.sort(
            key=lambda r: (-float(r.get("visibility_score") or 0.0), str(r.get("name") or ""))
        )
 
        return {
            "brand": aggregate.get(brand_key) or aggregate.get(entities[0].name),
            "competitors": competitors_rows,
            "topic": topic_used,
            "models": list(per_model.keys()),
            "model_errors": model_errors,
        }
 
    # ─────────────────────────────────────────────────────────────────────────
    # _analyze_mention_quality — unchanged
    # ─────────────────────────────────────────────────────────────────────────
 
    def _analyze_mention_quality(self, text: str, span: Tuple[int, int]) -> Dict[str, Any]:
        start, end = span
        ctx_start = max(0, start - 150)
        ctx_end = min(len(text), end + 150)
        context = text[ctx_start:ctx_end]
 
        detail_score = min(100, len(context) / 3)
 
        positive_terms = ["best", "top", "leading", "excellent", "great", "innovative",
                          "popular", "recommended", "powerful", "comprehensive"]
        negative_terms = ["slow", "expensive", "limited", "complex", "difficult", "bad", "poor", "weak"]
        pos_count = sum(1 for t in positive_terms if t in context.lower())
        neg_count = sum(1 for t in negative_terms if t in context.lower())
        sentiment_score = max(0, min(100, 50 + (pos_count * 10) - (neg_count * 10)))
 
        specific_terms = [r"\d+%", r"\d+\s+users", "feature", "capability",
                          "module", "integration", "support", "pricing"]
        spec_count = sum(1 for t in specific_terms if re.search(t, context, re.IGNORECASE))
        specificity_score = min(100, spec_count * 20)
 
        overall_quality = (detail_score * 0.4) + (sentiment_score * 0.3) + (specificity_score * 0.3)
        return {
            "quality_score": round(overall_quality, 1),
            "sentiment_score": round(float(sentiment_score), 1),
            "specificity_score": round(float(specificity_score), 1),
            "context_snippet": context.strip(),
        }
 
    # ─────────────────────────────────────────────────────────────────────────
    # _analyze_intent_coverage — unchanged
    # ─────────────────────────────────────────────────────────────────────────
 
    def _analyze_intent_coverage(self, text: str, prompt: str) -> Dict[str, Any]:
        text_lower   = text.lower()
        prompt_lower = prompt.lower()
 
        answer_signals  = ["here are", "the best", "i recommend", "top", "list of",
                           "following", "include", "features", "pros and cons"]
        refusal_signals = ["i cannot", "i don't know", "i am sorry", "i'm sorry",
                           "no information", "not able to"]
        has_answer_signal = any(s in text_lower for s in answer_signals)
        has_refusal = any(s in text_lower for s in refusal_signals)
 
        if has_refusal and len(text) < 200:
            return {"intent_coverage_score": 0, "reason": "Refusal detected"}
 
        has_list = bool(re.search(r"^\s*[\d\-\*]\.?\s+", text, re.MULTILINE))
        score = 50.0
        if has_answer_signal:
            score += 30.0
        if has_list:
            score += 20.0
 
        stop_words = {"what", "which", "where", "when", "how", "that", "this",
                      "with", "from", "your", "have"}
        prompt_words = [
            w for w in re.findall(r"\w+", prompt_lower)
            if len(w) > 3 and w not in stop_words
        ]
        if prompt_words:
            matched = sum(1 for w in prompt_words if w in text_lower)
            overlap_ratio = matched / len(prompt_words)
            score = (score * 0.7) + (overlap_ratio * 100 * 0.3)
 
        return {
            "intent_coverage_score": round(min(100.0, score), 1),
            "has_list": has_list,
            "direct_answer": has_answer_signal,
        }
 
    # ─────────────────────────────────────────────────────────────────────────
    # analyze_competitor_prompt_wins — fixed coverage_gap_score formula
    # ─────────────────────────────────────────────────────────────────────────
 
    async def analyze_competitor_prompt_wins(
        self,
        prompts: List[str],
        competitors: List[str],
        url: str,
        brand_name: Optional[str] = None,
    ) -> Dict[str, Any]:
 
        brand_domain  = _extract_domain(url)
        brand_display = str(brand_name).strip() if isinstance(brand_name, str) and brand_name.strip() else brand_domain
        brand_key     = _normalize_term(brand_display)
        
        # Build terms for each entity for better matching
        entities: List[EntityTerms] = [
            _make_entity_terms(brand_display),
            *[_make_entity_terms(c) for c in competitors if c]
        ]
        
        # Map of normalized term -> primary entity name
        term_to_name: Dict[str, str] = {}
        for e in entities:
            for term in e.terms:
                if term not in term_to_name:
                    term_to_name[term] = e.name

        company_names = [e.name for e in entities]
        prompts_to_run = prompts[:10]
 
        async def check_prompt(prompt: str) -> Dict[str, Any]:
            if not company_names:
                return {"prompt": prompt, "error": "No companies to compare", "winner": "unknown"}
 
            companies_block = "\n".join([f"- {name}" for name in company_names])
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
                    break
 
            ranking = parsed.get("ranking") if isinstance(parsed, dict) else None
            if not isinstance(ranking, list) or not ranking:
                return {"prompt": prompt, "error": "Ranking not returned", "winner": "unknown"}
 
            # Build rank map from the returned list
            ranks: Dict[str, int] = {}
            rank_num = 1
            for item in ranking:
                name = item if isinstance(item, str) else (
                    item.get("name") or item.get("company") if isinstance(item, dict) else None
                )
                if not name:
                    continue
                
                # Match name back to primary entity name using terms
                key = _normalize_term(str(name))
                matched_name = term_to_name.get(key)
                
                if not matched_name:
                    # Try partial match if no exact term match
                    for term, primary_name in term_to_name.items():
                        if term in key or key in term:
                            matched_name = primary_name
                            break
                
                if matched_name and matched_name not in ranks:
                    ranks[matched_name] = rank_num
                    rank_num += 1
 
            brand_rank = ranks.get(brand_display)
 
            competitor_names_local = [n for n in company_names if n != brand_display]
            competitor_ranks = [
                (n, ranks[n]) for n in competitor_names_local if isinstance(ranks.get(n), int)
            ]
            competitor_ranks.sort(key=lambda x: x[1])
 
            # Winner determination
            winner = "none"
            competitor_winner_name = None
            if brand_rank is None:
                if competitor_ranks:
                    winner = "competitor"
                    competitor_winner_name = competitor_ranks[0][0]
            else:
                better = [n for n, r in competitor_ranks if r < brand_rank]
                if better:
                    winner = "competitor"
                    competitor_winner_name = better[0]
                else:
                    winner = "brand"
 
            # Coverage gap score:
            # brand rank 1 of N = 0 (no gap), brand rank N of N = 100 (max gap)
            # Formula: (brand_rank - 1) / (N - 1) × 100
            total = len(company_names)
            if brand_rank is None:
                coverage_gap_score = 100.0
            else:
                denom = float(max(1, total - 1))
                coverage_gap_score = round(100.0 * (float(brand_rank) - 1.0) / denom, 1)
 
            return {
                "prompt": prompt,
                "winner": winner,
                "winner_name": (
                    competitor_winner_name
                    if winner == "competitor"
                    else (brand_display if winner == "brand" else None)
                ),
                "brand_rank": brand_rank,
                "ranks": ranks,
                "text_snippet": ", ".join([
                    f"{k}={r}"
                    for k, r in sorted(ranks.items(), key=lambda kv: kv[1])
                ])[:200] + "...",
                "coverage_gap_score": coverage_gap_score,
                "intent_coverage": {"intent_coverage_score": 100.0 if len(ranks) == total else 60.0},
                "winner_quality": {},
                "brand_quality": {},
            }
 
        prompt_results = list(await asyncio.gather(*[check_prompt(p) for p in prompts_to_run]))
 
        # Aggregate summary
        brand_wins = competitor_wins = total_analyzed = 0
        for res in prompt_results:
            if res.get("error"):
                continue
            total_analyzed += 1
            if res["winner"] == "brand":
                brand_wins += 1
            elif res["winner"] == "competitor":
                competitor_wins += 1
 
        brand_win_rate    = round(brand_wins    / total_analyzed * 100.0, 1) if total_analyzed else 0.0
        competitor_win_rate = round(competitor_wins / total_analyzed * 100.0, 1) if total_analyzed else 0.0
        gaps = [r["coverage_gap_score"] for r in prompt_results if "coverage_gap_score" in r]
        avg_gap = round(sum(gaps) / len(gaps), 1) if gaps else 0.0
 
        # Per-competitor breakdown
        competitor_map: Dict[str, str] = {}
        for c in competitors:
            nk = _normalize_term(c)
            if nk and nk not in competitor_map:
                competitor_map[nk] = c
 
        detailed_no_error = [r for r in prompt_results if isinstance(r, dict) and not r.get("error")]
        brand_prompt_mentions = sum(1 for r in detailed_no_error if r.get("brand_rank") is not None)
 
        breakdown: List[Dict[str, Any]] = []
        for comp_key, comp_name in competitor_map.items():
            prompts_mentioned = prompts_won = 0
            gap_values: List[float] = []
            for r in detailed_no_error:
                comp_rank = (r.get("ranks") or {}).get(comp_key)
                if not isinstance(comp_rank, int):
                    continue
                prompts_mentioned += 1
                brand_rank = r.get("brand_rank")
                if brand_rank is None or comp_rank < brand_rank:
                    prompts_won += 1
                if isinstance(brand_rank, int):
                    denom = float(max(1, len(competitor_map)))
                    gap_values.append(max(0.0, float(brand_rank - comp_rank)) / denom * 100.0)
 
            breakdown.append({
                "competitor": comp_name,
                "competitor_key": comp_key,
                "prompts_mentioned": prompts_mentioned,
                "prompts_won": prompts_won,
                "win_percent": round(prompts_won / total_analyzed * 100.0, 1) if total_analyzed else 0.0,
                "content_gap_score": round(sum(gap_values) / len(gap_values), 1) if gap_values else 0.0,
            })
 
        breakdown.sort(
            key=lambda x: (int(x.get("prompts_won") or 0), int(x.get("prompts_mentioned") or 0)),
            reverse=True,
        )
 
        return {
            "summary": {
                "total_prompts": total_analyzed,
                "brand_wins": brand_wins,
                "competitor_wins": competitor_wins,
                "brand_win_rate": brand_win_rate,
                "competitor_win_rate": competitor_win_rate,
                "avg_content_gap_score": avg_gap,
                "brand_prompt_mentions": brand_prompt_mentions,
            },
            "detailed_results": list(prompt_results),
            "competitor_breakdown": breakdown,
        }
 
    # ─────────────────────────────────────────────────────────────────────────
    # compute_gap_analysis — fixed opportunity score + correct missing threshold
    # ─────────────────────────────────────────────────────────────────────────
 
    def compute_gap_analysis(
        self,
        prompt_results: List[Dict[str, Any]],
        competitors: List[str],
    ) -> List[Dict[str, Any]]:
 
        comp_map: Dict[str, str] = {}
        for c in competitors:
            norm = _normalize_term(c)
            if norm:
                comp_map[norm] = c
 
        vis_counts = [
            len(r.get("ranks", {}))
            for r in prompt_results
            if isinstance(r.get("ranks"), dict)
        ]
        avg_visibility_per_prompt = sum(vis_counts) / len(vis_counts) if vis_counts else 1.0
 
        def _opportunity_score(rank_value: Any) -> float:
            """
            rank=None or rank>10 → 100  (not present = full opportunity)
            rank=1               → 0    (they dominate = no opportunity for you)
            rank=2..10           → linear 11.1% → 100%
            """
            try:
                r = int(rank_value)
            except (TypeError, ValueError):
                return 100.0
            if r <= 0 or r > 10:
                return 100.0
            if r == 1:
                return 0.0
            return round(((float(r) - 1.0) / 9.0) * 100.0, 1)
 
        gap_data = []
 
        for comp_key, comp_name in comp_map.items():
            missing_count = 0
            opportunities = []
 
            for res in prompt_results:
                ranks = res.get("ranks") or {}
                rank = ranks.get(comp_key)
                score = _opportunity_score(rank)
 
                try:
                    rank_int = int(rank) if rank is not None else None
                    if rank_int is not None and rank_int <= 0:
                        rank_int = None
                except (TypeError, ValueError):
                    rank_int = None
 
                # "missing" = not in top 3 (SOP Screen 5 threshold)
                if rank_int is None or rank_int > 3:
                    missing_count += 1
 
                opportunities.append({
                    "prompt": res.get("prompt"),
                    "rank": rank_int,
                    "opportunityScore": score,
                })
 
            if not opportunities:
                continue
 
            gap_score = round(
                sum(o["opportunityScore"] for o in opportunities) / len(opportunities), 1
            )
            potential_gain_percent = gap_score  # gap score IS the potential gain %
            potential_gain_mentions = round(
                sum(
                    (o["opportunityScore"] / 100.0) * avg_visibility_per_prompt
                    for o in opportunities
                ), 1
            )
 
            opportunities.sort(key=lambda x: x["opportunityScore"], reverse=True)
 
            gap_data.append({
                "competitor": comp_name,
                "gapScore": gap_score,
                "missingPrompts": missing_count,
                "potentialGainPercent": potential_gain_percent,
                "potentialGainMentions": potential_gain_mentions,
                "opportunities": opportunities,
            })
 
        gap_data.sort(key=lambda x: x["gapScore"], reverse=True)
        return gap_data
