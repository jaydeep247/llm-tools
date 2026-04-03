import logging
import json
import asyncio
import re
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
from orchestrator.checkpoint.executor import execute_task
from .competitive_leaderboard import CompetitiveLeaderboard

logger = logging.getLogger("module_e_competitors")

# Platforms that appear in DataForSEO keyword overlap but are NOT real business competitors.
# These are social media, UGC portals, reference sites, and common tools (if brand is an agency).
SOCIAL_MEDIA_BLOCKLIST: set = {
    "youtube.com", "reddit.com", "instagram.com", "facebook.com",
    "twitter.com", "x.com", "tiktok.com", "pinterest.com",
    "linkedin.com", "tumblr.com", "snapchat.com", "vimeo.com",
    "medium.com", "quora.com", "wikipedia.org", "wikihow.com",
    "blogger.com", "wordpress.com", "wix.com", "squarespace.com",
    "yelp.com", "trustpilot.com", "google.com", "bing.com",
    "moz.com", "semrush.com", "ahrefs.com", "yoast.com", "hubspot.com",
}

# DataForSEO location codes to try for competitor discovery (worldwide coverage).
# We try multiple locations so niche/regional brands still get real competitors.
_DFS_LOCATION_CODES = [
    2840,   # United States
    2826,   # United Kingdom
    2356,   # India
    2036,   # Australia
    2124,   # Canada
]


class CompetitorAnalyzer:
    """
    Analyzes competitor landscape, mentions, and AI Share of Voice.

    Competitor Discovery Strategy (in order):
      1. DataForSEO organic competitors — tried across multiple global locations
         so niche/regional/international sites still return real results.
      2. AI fallback — LLM infers top competitors using the brand description
         obtained during onboarding (much more accurate than domain-name guessing).

    AI SOV Strategy:
      - Asks 3 AI models generic industry questions (brand NOT mentioned in prompt)
      - Checks if brand name OR domain appears in the AI's response
      - SOV = brand appearances / total appearances (brand + all competitors)
    """

    async def analyze(
        self,
        url: str,
        competitor_domains: Optional[List[str]] = None,
        brand_name: Optional[str] = None,
        keywords: Optional[List[str]] = None,
        brand_description: Optional[str] = None,   # ← NEW: passed from runner
    ) -> Dict[str, Any]:
        """Runs the complete competitor analysis suite."""
        domain = self._extract_domain(url)
        if not brand_name:
            brand_name = self._extract_brand_name(domain)

        # 1. Infer industry — now uses brand_description when available
        industry, service_type = await self._infer_industry(
            domain, brand_name, brand_description=brand_description
        )

        # 2. Discover competitors
        if not competitor_domains:
            competitor_domains = await self._discover_competitors(
                domain, brand_name, industry, service_type, brand_description=brand_description
            )

        # 3. Run mentions then SOV
        try:
            mentions = await self._analyze_mentions(domain, competitor_domains)
        except Exception as e:
            logger.error(f"Mentions analysis failed: {e}")
            mentions = {"error": str(e)}

        try:
            sov = await self._analyze_ai_sov(domain, brand_name, industry, service_type, competitor_domains)
        except Exception as e:
            logger.error(f"AI SOV analysis failed: {e}")
            sov = {"error": str(e)}

        # 4. Competitive Leaderboard
        try:
            leaderboard = await self._generate_competitive_leaderboard(industry, brand_name, domain, keywords)
        except Exception as e:
            logger.error(f"Leaderboard generation failed: {e}")
            leaderboard = {"error": str(e)}

        return {
            "domain": domain,
            "brand_name": brand_name,
            "industry": industry,
            "competitors": competitor_domains,
            "mentions": mentions,
            "ai_sov": sov,
            "competitive_leaderboard": leaderboard,
        }

    async def _generate_competitive_leaderboard(
        self, industry: str, brand_name: str, domain: str, keywords: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Produces a competitive leaderboard based on keywords, prompts, or industry."""
        leaderboard_gen = CompetitiveLeaderboard()
        return await leaderboard_gen.generate(industry, brand_name, domain, keywords)

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _extract_domain(self, url: str) -> str:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        parsed = urlparse(url)
        return parsed.netloc or parsed.path

    def _extract_brand_name(self, domain: str) -> str:
        """
        Extracts a human-readable brand name from a domain.
        e.g. 'yesquesttech.com' → 'YesQuestTech'
             'www.hubspot.com'  → 'HubSpot'
        """
        clean = domain.replace("www.", "").split(".")[0]
        return clean.capitalize()

    # ─── Industry Inference ───────────────────────────────────────────────────

    async def _infer_industry(
        self,
        domain: str,
        brand_name: str,
        brand_description: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Uses Claude to infer the brand's industry and service type.

        When a brand_description is available (from onboarding), it is used
        as the primary signal — this is far more accurate than guessing from
        the domain name alone (fixes e.g. attrock.com being misclassified).

        Returns (industry, service_type) tuple.
        """
        if brand_description:
            description_section = f"""
Brand Description (from onboarding — use this as your PRIMARY signal):
\"\"\"{brand_description}\"\"\"
"""
        else:
            description_section = "(No brand description available — infer from domain name only.)"

        prompt = f"""You are a market research analyst. Determine the industry and primary service type for this brand.

Brand Name: {brand_name}
Website: {domain}
{description_section}

Instructions:
- If a brand description is provided, base your answer PRIMARILY on that description.
- Do NOT guess from the domain name if a description is available.
- Be specific: prefer "digital marketing agency" over "marketing", or "SaaS HR platform" over "software".

Return ONLY valid JSON (no markdown, no explanation):
{{"industry": "exact industry name", "service_type": "primary service or product description"}}"""

        try:
            resp = await execute_task(
                task_name="module_e_industry_inference",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="claude",
                options={"temperature": 0.1, "response_format": {"type": "json_object"}},
            )
            if resp.success and resp.data:
                raw = resp.data
                data = json.loads(raw) if isinstance(raw, str) else raw
                industry = data.get("industry", "technology")
                service_type = data.get("service_type", "software solutions")
                logger.info(f"Inferred industry='{industry}', service_type='{service_type}' for {domain}")
                return industry, service_type
        except Exception as e:
            logger.warning(f"Industry inference failed: {e}")

        return "technology", "software solutions"

    # ─── Competitor Discovery ─────────────────────────────────────────────────

    async def _discover_competitors(
        self,
        domain: str,
        brand_name: str,
        industry: str,
        service_type: str,
        brand_description: Optional[str] = None,
    ) -> List[str]:
        """
        Strategy:
          1. DataForSEO across multiple global locations (not just US).
          2. AI fallback using brand description when DataForSEO has no data.
        """
        dfs_competitors = await self._discover_via_dataforseo_global(domain)
        if dfs_competitors:
            filtered = await self._filter_competitors_via_ai(
                domain=domain,
                brand_name=brand_name,
                industry=industry,
                service_type=service_type,
                candidates=dfs_competitors,
                brand_description=brand_description,
            )
            # Only trust DataForSEO results if we got at least 3 real competitors.
            # If fewer survive filtering, DataForSEO doesn't have enough data for
            # this domain — fall through to AI which uses brand description and
            # finds correct worldwide competitors.
            if len(filtered) >= 3:
                return filtered
            logger.info(
                f"DataForSEO only returned {len(filtered)} filtered competitors for {domain}"
                f" — falling back to AI discovery for better coverage"
            )

        # Fallback: AI discovery using brand description
        return await self._discover_via_ai(
            domain, brand_name, industry, service_type, brand_description=brand_description
        )

    async def _discover_via_dataforseo_global(self, domain: str) -> List[str]:
        """
        Calls DataForSEO competitors_domain endpoint across multiple locations
        (US, UK, India, Australia, Canada) and merges results.

        This ensures niche, regional, or non-US brands still get real competitors
        instead of returning empty or returning only US-centric sites.
        """
        domain_root = domain.lower().replace("www.", "").rstrip("/")
        all_competitors: List[str] = []
        seen: set = set()

        async def fetch_for_location(location_code: int) -> List[str]:
            endpoint = "/dataforseo_labs/google/competitors_domain/live"
            payload = [{
                "target": domain,
                "location_code": location_code,
                "language_code": "en",
                "limit": 10,  # fetch more per location so we have candidates to filter
            }]
            resp = await execute_task(
                task_name="module_e_competitor_discovery",
                input_data={"endpoint": endpoint, "payload": payload},
                provider="dataforseo",
            )
            if not resp.success:
                logger.debug(f"DataForSEO location {location_code} failed: {resp.error}")
                return []
            try:
                tasks = resp.data.get("tasks", [])
                if not tasks:
                    return []
                result = tasks[0].get("result", [])
                if not result:
                    return []
                items = result[0].get("items") or []
                found = []
                for item in items:
                    comp_domain = item.get("domain")
                    if not comp_domain:
                        continue
                    clean = str(comp_domain).lower().replace("www.", "").rstrip("/")
                    if not clean or "." not in clean:
                        continue
                    if clean == domain_root or clean in SOCIAL_MEDIA_BLOCKLIST:
                        continue
                    found.append(clean)
                return found
            except Exception as e:
                logger.debug(f"Error parsing DataForSEO response for location {location_code}: {e}")
                return []

        # Run all location queries in parallel
        results = await asyncio.gather(
            *[fetch_for_location(loc) for loc in _DFS_LOCATION_CODES],
            return_exceptions=True,
        )

        for result in results:
            if isinstance(result, Exception):
                continue
            for comp in result:
                if comp not in seen:
                    seen.add(comp)
                    all_competitors.append(comp)

        logger.info(
            f"DataForSEO global discovery found {len(all_competitors)} unique competitors for {domain}"
        )
        return all_competitors[:20]  # Pass up to 20 candidates to AI filter

    async def _filter_competitors_via_ai(
        self,
        domain: str,
        brand_name: str,
        industry: str,
        service_type: str,
        candidates: List[str],
        brand_description: Optional[str] = None,
    ) -> List[str]:
        """
        Post-filter: removes candidates that don't match the brand's business model.
        STRICT RULE: only returns domains from the candidates list — never invents new ones.
        Uses brand description to correctly identify business model.
        """
        if not candidates:
            return []

        description_section = (
            f"\nBrand Description: \"{brand_description}\"\n"
            if brand_description
            else ""
        )

        prompt = f"""You are a market research analyst doing a strict YES/NO filter.

Target brand:
- domain: {domain}
- brand name: {brand_name}
- inferred industry: {industry}
- inferred service: {service_type}{description_section}

Your ONLY job is to decide which of the candidate domains below are TRUE direct competitors
of the target brand — same business model, same customer base.

STRICT RULES:
- You may ONLY return domains from the candidates list below. NEVER add new domains.
- If the target is a service agency: keep ONLY other service agencies. Reject SEO tools (moz, semrush, ahrefs, etc).
- If the target is a SaaS/platform: keep ONLY other SaaS platforms. Reject agencies.
- If the target is ecommerce: keep ONLY other ecommerce brands. Reject agencies and tools.
- If NO candidates are real competitors, return an empty array [].
- Do NOT hallucinate or add domains not in the list.

Candidates to evaluate (ONLY these, nothing else):
{json.dumps(candidates)}

Return ONLY a valid JSON array of kept domains from the list above (subset or empty):
["domain1.com", "domain2.com"]

No explanations. Only domains from the candidates list above."""

        try:
            resp = await execute_task(
                task_name="module_e_ai_competitor_filter",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="claude",
                options={"temperature": 0.1},  # Low temp for strict filtering
            )

            if not resp.success or not resp.data:
                raise ValueError(resp.error or "Empty response")

            raw = str(resp.data).strip()
            raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
            raw = re.sub(r'```\s*$', '', raw, flags=re.MULTILINE).strip()

            match = re.search(r'\[.*?\]', raw, re.DOTALL)
            if not match:
                return []
            domains = json.loads(match.group(0))

            # Normalise candidates for strict membership check
            candidate_set = set()
            for c in candidates:
                c_norm = c.strip().lower().replace("www.", "").rstrip("/")
                candidate_set.add(c_norm)

            cleaned: List[str] = []
            seen: set = set()
            for d in domains:
                d = str(d).strip().lower()
                d = re.sub(r'^https?://', '', d)
                d = re.sub(r'^www\.', '', d)
                d = d.rstrip('/')
                if not d or '.' not in d:
                    continue
                if d in seen:
                    continue
                # STRICT: only keep if it was in the original candidate list
                if d not in candidate_set:
                    logger.debug(f"Filter rejected invented domain '{d}' — not in candidates")
                    continue
                seen.add(d)
                cleaned.append(d)

            logger.info(f"AI filter kept {len(cleaned)} competitors from {len(candidates)} candidates")
            return cleaned[:5]
        except Exception as e:
            logger.error(f"AI competitor filtering failed: {e}")
            return []

    async def _discover_via_ai(
        self,
        domain: str,
        brand_name: str,
        industry: str,
        service_type: str,
        brand_description: Optional[str] = None,
    ) -> List[str]:
        """
        AI fallback: asks Claude to name the top 5 real worldwide competitors.

        When a brand_description is provided (from onboarding), it is injected
        into the prompt so the model understands EXACTLY what this company does
        rather than guessing from the domain name.
        """
        description_section = (
            f"\nBrand Description (use this as your primary signal):\n\"\"\"{brand_description}\"\"\"\n"
            if brand_description
            else ""
        )

        prompt = f"""You are a market research analyst helping identify the most well-known WORLDWIDE business competitors.

Brand information:
- Name: {brand_name}
- Website: {domain}
- Industry: {industry}
- Service type: {service_type}{description_section}

Step 1 — Infer the brand category from the description:
- Service agency / consultancy (clients hire them for services)
- Product / ecommerce brand (customers buy products)
- SaaS / platform (users subscribe to software/services)

Step 2 — Think: if a potential CLIENT was evaluating {brand_name} for their needs,
which OTHER companies would appear on their shortlist? These are the true competitors.

Step 3 — List the top 5 most WELL-KNOWN real competitors globally. Prioritise:
- Companies that are widely recognised in the same space
- Brands that frequently appear together in "best of" or "alternative to" comparisons
- Agencies or companies a potential customer would likely already know about

Rules:
- Match the SAME business model (agency vs agency, SaaS vs SaaS, product vs product)
- DO exclude pure software tools like Semrush, Ahrefs, Moz — these are TOOLS not service competitors
- DO include agencies or consultancies that ALSO publish SEO/marketing content (e.g. neilpatel.com is an agency, not a tool)
- DO include globally recognised names even if they are large (e.g. Neil Patel Digital, WebFX, Siege Media)
- Use real, existing companies only

Return ONLY a valid JSON array of their primary website domains (no www, no https):
["competitor1.com", "competitor2.com", "competitor3.com", "competitor4.com", "competitor5.com"]

No explanations, just the JSON array."""

        try:
            resp = await execute_task(
                task_name="module_e_ai_competitor_discovery",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="claude",
                options={"temperature": 0.2},
            )

            if not resp.success or not resp.data:
                raise ValueError(resp.error or "Empty response")

            raw = str(resp.data).strip()
            raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
            raw = re.sub(r'```\s*$', '', raw, flags=re.MULTILINE).strip()

            match = re.search(r'\[.*?\]', raw, re.DOTALL)
            if match:
                domains = json.loads(match.group(0))
                cleaned: List[str] = []
                seen: set = set()
                for d in domains:
                    d = str(d).strip().lower()
                    d = re.sub(r'^https?://', '', d)
                    d = re.sub(r'^www\.', '', d)
                    d = d.rstrip('/')
                    if d and '.' in d and d not in seen:
                        seen.add(d)
                        cleaned.append(d)
                logger.info(f"AI fallback discovered {len(cleaned)} competitors for {domain}")
                return cleaned[:5]

        except Exception as e:
            logger.error(f"AI competitor discovery failed: {e}")

        return []

    # ─── Mention Trends ───────────────────────────────────────────────────────

    async def _analyze_mentions(self, domain: str, competitors: List[str]) -> Dict[str, Any]:
        """
        Tracks monthly mention trends for brand and competitors via DataForSEO
        content_analysis/phrase_trends endpoint.
        """
        raw_dataforseo: Dict[str, Any] = {}

        async def fetch_mentions(d: str) -> tuple[str, Dict]:
            payload = [{
                "keyword": d,
                "date_from": "2021-01-01",
                "date_group": "month",
            }]

            resp = await execute_task(
                task_name="module_e_mentions_trend",
                input_data={
                    "endpoint": "/content_analysis/phrase_trends/live",
                    "payload": payload,
                },
                provider="dataforseo",
                options={"skip_cache": True},
            )

            if not resp.success:
                logger.warning(f"Mentions analysis failed for {d}: {resp.error}")
                return d, {"mentions": 0, "sentiment": "Neutral", "trend": [0] * 12}

            try:
                tasks = resp.data.get("tasks", [])
                raw_dataforseo[d] = resp.data
                if not tasks:
                    raise ValueError("No tasks in response")

                monthly_trends = tasks[0].get("result") or []
                trend = [entry.get("total_count", 0) for entry in monthly_trends]
                total = sum(trend)

                sentiment = "Neutral"
                if total > 0 and monthly_trends:
                    agg_pos = sum(e.get("connotation_types", {}).get("positive", 0) for e in monthly_trends)
                    agg_neg = sum(e.get("connotation_types", {}).get("negative", 0) for e in monthly_trends)
                    if agg_pos > agg_neg * 1.5:
                        sentiment = "Positive"
                    elif agg_neg > agg_pos * 1.5:
                        sentiment = "Negative"

                return d, {"mentions": total, "sentiment": sentiment, "trend": trend}

            except Exception as e:
                logger.warning(f"Error parsing mentions for {d}: {e}")
                return d, {"mentions": 0, "sentiment": "Neutral", "trend": [0] * 12}

        all_domains = [domain] + list(competitors)
        mention_results = await asyncio.gather(*[fetch_mentions(d) for d in all_domains])
        results = dict(mention_results)

        total_all = sum(r["mentions"] for r in results.values()) or 1
        brand_sov = round((results[domain]["mentions"] / total_all) * 100, 3)

        return {
            "overall_sov": brand_sov,
            "data": [{"name": d, **results[d]} for d in all_domains],
            "raw_dataforseo": raw_dataforseo,
        }

    # ─── AI Share of Voice ────────────────────────────────────────────────────

    async def _analyze_ai_sov(
        self,
        domain: str,
        brand_name: str,
        industry: str,
        service_type: str,
        competitors: List[str],
    ) -> Dict[str, Any]:
        """
        Measures AI Share of Voice: how often the brand appears in AI responses
        to generic industry questions (brand NOT mentioned in the prompt).
        """
        competitor_names = [c.split(".")[0].capitalize() for c in competitors[:4]] if competitors else []
        comp_hint = ", ".join(competitor_names) if competitor_names else "other brands"

        questions = [
            f"What are some well-known companies and brands in the {industry} space, including smaller or emerging ones?",
            f"Which {service_type} providers or brands would you recommend? Include both established and indie options.",
            f"Can you name some {service_type} brands that are gaining popularity or worth paying attention to?",
            f"Besides major market leaders, which brands in {industry} are noteworthy — for example brands like {comp_hint}?",
            f"What do you know about {brand_name} (website: {domain})? Describe what they do, who they serve, "
            f"and how they compare to others in {service_type}. If you are not familiar with them, say so.",
        ]

        brand_terms = [domain.lower(), brand_name.lower()]
        domain_root = domain.split(".")[0].lower()
        if domain_root not in brand_terms:
            brand_terms.append(domain_root)
        brand_terms = list(dict.fromkeys(brand_terms))

        comp_terms: Dict[str, List[str]] = {}
        for c in competitors:
            c_root = c.split(".")[0].lower()
            comp_terms[c] = list({c.lower(), c_root})

        models = ["openai", "gemini", "claude"]
        model_results: Dict[str, Any] = {}

        async def query_model(model: str) -> Optional[Dict[str, Any]]:
            batch_prompt = (
                f"Answer these questions about the {industry} industry. "
                f"Be specific with real company names.\n\n"
                + "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))
            )

            resp = await execute_task(
                task_name=f"module_e_ai_sov_{model}",
                input_data={"messages": [{"role": "user", "content": batch_prompt}]},
                provider=model,
                options={"temperature": 0.4, "skip_cache": True},
            )

            if not resp.success:
                logger.warning(f"AI SOV [{model}] failed: {resp.error}")
                return None

            text = str(resp.data)
            brand_mentions_count = 0
            first_brand_position: Optional[int] = None
            brand_known = False

            for term in brand_terms:
                pattern = r"\b" + re.escape(term) + r"\b"
                matches = list(re.finditer(pattern, text, flags=re.IGNORECASE))
                if matches:
                    brand_mentions_count += len(matches)
                    first_pos = matches[0].start()
                    if first_brand_position is None or first_pos < first_brand_position:
                        first_brand_position = first_pos

            not_known_phrases = [
                "not familiar", "don't have information", "i'm not aware",
                "cannot find", "no information", "not aware of", "i don't know",
                "i do not have", "no specific information",
            ]
            if brand_mentions_count > 0 and not any(p in text for p in not_known_phrases):
                brand_known = True

            competitor_mentions_count = 0
            for _, terms in comp_terms.items():
                for term in terms:
                    pattern = r"\b" + re.escape(term) + r"\b"
                    matches = re.findall(pattern, text, flags=re.IGNORECASE)
                    competitor_mentions_count += len(matches)

            if first_brand_position is not None and len(text) > 0:
                if first_brand_position < len(text) * 0.25:
                    boosted = int(round(brand_mentions_count * 1.2))
                    brand_mentions_count = boosted or 1

            total_mentions = brand_mentions_count + competitor_mentions_count
            sov = 0.0 if total_mentions == 0 else round((brand_mentions_count / total_mentions) * 100, 1)

            return {
                "sov": sov,
                "brand_mentions": brand_mentions_count,
                "competitor_mentions": competitor_mentions_count,
                "total_mentions": total_mentions,
                "first_brand_position": first_brand_position,
                "brand_known": brand_known,
            }

        tasks = [query_model(m) for m in models]
        outputs = await asyncio.gather(*tasks, return_exceptions=True)

        for model, out in zip(models, outputs):
            if isinstance(out, Exception):
                logger.error(f"AI SOV [{model}] exception: {out}")
            elif out is not None:
                model_results[model] = out

        if not model_results:
            return {"error": "All AI models failed for SOV analysis"}

        avg_sov = round(
            sum(m["sov"] for m in model_results.values()) / len(model_results), 1
        )

        brand_known_by_models = [
            model for model, result in model_results.items()
            if result.get("brand_known", False)
        ]

        if avg_sov == 0 and not brand_known_by_models:
            visibility_tier = "Not yet AI-indexed"
        elif avg_sov == 0 and brand_known_by_models:
            visibility_tier = "Minimally Indexed"
        elif avg_sov < 5:
            visibility_tier = "Emerging"
        elif avg_sov < 20:
            visibility_tier = "Recognized"
        else:
            visibility_tier = "Established"

        return {
            "overall_sov": avg_sov,
            "visibility_tier": visibility_tier,
            "brand_known_by_models": brand_known_by_models,
            "brand_terms_checked": brand_terms,
            "by_model": model_results,
        }