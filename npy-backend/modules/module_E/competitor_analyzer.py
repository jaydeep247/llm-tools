import logging
import json
import asyncio
import re
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_competitors")


class CompetitorAnalyzer:
    """
    Analyzes competitor landscape, mentions, and AI Share of Voice.

    Competitor Discovery Strategy (in order):
      1. DataForSEO organic competitors (best — based on shared keyword rankings)
      2. AI fallback — LLM infers top competitors based on brand's industry
         (used when DataForSEO returns no data, e.g. new/small domains)

    AI SOV Strategy:
      - Asks 3 AI models generic industry questions (brand NOT mentioned in prompt)
      - Checks if brand name OR domain appears in the AI's response
      - SOV = brand appearances / total appearances (brand + all competitors)
    """

    async def analyze(self, url: str, competitor_domains: List[str] = None) -> Dict[str, Any]:
        """Runs the complete competitor analysis suite."""
        domain = self._extract_domain(url)
        brand_name = self._extract_brand_name(domain)
        logger.info(f"Starting competitor analysis for: {domain} (brand: {brand_name})")

        # 1. Infer industry first (needed for both fallback discovery and AI SOV)
        industry, service_type = await self._infer_industry(domain, brand_name)
        logger.info(f"Inferred industry: {industry} | service_type: {service_type}")

        # 2. Discover competitors
        if not competitor_domains:
            competitor_domains = await self._discover_competitors(
                domain, brand_name, industry, service_type
            )

        logger.info(f"Using competitors: {competitor_domains}")

        # 3. Run mentions + AI SOV in parallel
        mentions_task = self._analyze_mentions(domain, competitor_domains)
        sov_task = self._analyze_ai_sov(domain, brand_name, industry, service_type, competitor_domains)

        mentions, sov = await asyncio.gather(
            mentions_task, sov_task, return_exceptions=True
        )

        mentions = mentions if not isinstance(mentions, Exception) else {"error": str(mentions)}
        sov = sov if not isinstance(sov, Exception) else {"error": str(sov)}

        return {
            "domain": domain,
            "brand_name": brand_name,
            "industry": industry,
            "competitors": competitor_domains,
            "mentions": mentions,
            "ai_sov": sov,
        }

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
        # Strip www. and TLD
        clean = domain.replace("www.", "").split(".")[0]
        # Title-case it
        return clean.capitalize()

    # ─── Industry Inference ───────────────────────────────────────────────────

    async def _infer_industry(self, domain: str, brand_name: str) -> tuple[str, str]:
        """
        Uses OpenAI to infer the brand's industry and service type.
        Returns (industry, service_type) tuple.
        """
        prompt = f"""Analyze the brand "{brand_name}" (website: {domain}) and infer:
1. Industry category (e.g. "software development", "digital marketing", "e-commerce", "SaaS")
2. Primary service type (e.g. "mobile app development", "SEO services", "cloud solutions")

Return ONLY valid JSON (no markdown):
{{"industry": "industry name", "service_type": "service description"}}"""

        try:
            resp = await execute_task(
                task_name="module_e_industry_inference",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="openai",
                options={"temperature": 0.1, "response_format": {"type": "json_object"}}
            )
            if resp.success and resp.data:
                raw = resp.data
                data = json.loads(raw) if isinstance(raw, str) else raw
                return (
                    data.get("industry", "technology"),
                    data.get("service_type", "software solutions")
                )
        except Exception as e:
            logger.warning(f"Industry inference failed: {e}")

        return "technology", "software solutions"

    # ─── Competitor Discovery ─────────────────────────────────────────────────

    async def _discover_competitors(
        self,
        domain: str,
        brand_name: str,
        industry: str,
        service_type: str
    ) -> List[str]:
        """
        Strategy:
          1. Try DataForSEO organic competitors (keyword-overlap based)
          2. If DataForSEO returns nothing → AI fallback (LLM infers top competitors)
        """
        # Step 1: DataForSEO
        dfs_competitors = await self._discover_via_dataforseo(domain)
        if dfs_competitors:
            logger.info(f"DataForSEO found {len(dfs_competitors)} competitors: {dfs_competitors}")
            return dfs_competitors

        # Step 2: AI Fallback
        logger.info(
            f"DataForSEO found no competitors for '{domain}' (likely new/small domain). "
            f"Falling back to AI-based competitor discovery."
        )
        ai_competitors = await self._discover_via_ai(brand_name, industry, service_type)
        logger.info(f"AI fallback found {len(ai_competitors)} competitors: {ai_competitors}")
        return ai_competitors

    async def _discover_via_dataforseo(self, domain: str) -> List[str]:
        """Calls DataForSEO competitors_domain endpoint."""
        endpoint = "/dataforseo_labs/google/competitors_domain/live"
        payload = [{
            "target": domain,
            "location_code": 2840,  # US
            "language_code": "en",
            "limit": 5
        }]

        logger.info(f"DataForSEO competitor discovery → {domain}")

        resp = await execute_task(
            task_name="module_e_competitor_discovery",
            input_data={"endpoint": endpoint, "payload": payload},
            provider="dataforseo"
        )

        if not resp.success:
            logger.warning(f"DataForSEO competitor discovery failed: {resp.error}")
            return []

        try:
            tasks = resp.data.get("tasks", [])
            if not tasks:
                return []
            result = tasks[0].get("result", [])
            if not result:
                return []
            items = result[0].get("items") or []

            # Extract domains, excluding the target domain itself
            domain_root = domain.replace("www.", "")
            competitors = [
                item.get("domain") for item in items
                if item.get("domain")
                and item.get("domain") != domain
                and item.get("domain") != domain_root
            ]

            logger.info(f"DataForSEO found {len(competitors)} competitors: {competitors[:5]}")
            return competitors[:5]

        except Exception as e:
            logger.error(f"Error parsing DataForSEO competitor response: {e}")
            return []


    async def _discover_via_ai(
        self,
        brand_name: str,
        industry: str,
        service_type: str
    ) -> List[str]:
        """
        AI fallback: asks LLM to name the top 5 real competitors in the same space.
        Returns a list of competitor domains (e.g. ['hubspot.com', 'salesforce.com']).
        """
        prompt = f"""You are a market research analyst.

The brand "{brand_name}" operates in the "{industry}" industry, specifically providing "{service_type}".

List the top 5 real, well-known competitor companies in the same space.
Return ONLY a valid JSON array of their primary website domains (no www, no https):
["competitor1.com", "competitor2.com", "competitor3.com", "competitor4.com", "competitor5.com"]

Rules:
- Use real, existing companies only
- Use their primary domain (e.g. "hubspot.com" not "www.hubspot.com")
- No explanations, just the JSON array"""

        try:
            resp = await execute_task(
                task_name="module_e_ai_competitor_discovery",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="openai",
                options={"temperature": 0.2}
            )

            if not resp.success or not resp.data:
                raise ValueError(resp.error or "Empty response")

            raw = str(resp.data).strip()
            # Strip markdown fences if present
            raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
            raw = re.sub(r'```\s*$', '', raw, flags=re.MULTILINE).strip()

            # Try to parse JSON array
            match = re.search(r'\[.*?\]', raw, re.DOTALL)
            if match:
                domains = json.loads(match.group(0))
                # Clean up: strip protocols, www, trailing slashes
                cleaned = []
                for d in domains:
                    d = str(d).strip().lower()
                    d = re.sub(r'^https?://', '', d)
                    d = re.sub(r'^www\.', '', d)
                    d = d.rstrip('/')
                    if d and '.' in d:
                        cleaned.append(d)
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
        from datetime import datetime, timedelta
        date_from = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

        all_domains = [domain] + competitors
        logger.info(f"Analyzing mentions for: {all_domains}")

        async def fetch_mentions(d: str) -> tuple[str, Dict]:
            payload = [{
                "keyword": d,
                "date_from": date_from,
                "date_group": "month"
            }]

            resp = await execute_task(
                task_name="module_e_mentions_trend",
                input_data={
                    "endpoint": "/content_analysis/phrase_trends/live",
                    "payload": payload
                },
                provider="dataforseo"
            )

            if not resp.success:
                logger.warning(f"Mentions analysis failed for {d}: {resp.error}")
                return d, {"mentions": 0, "sentiment": "Neutral", "trend": [0] * 12}

            try:
                tasks = resp.data.get("tasks", [])
                if not tasks:
                    raise ValueError("No tasks in response")

                # DataForSEO phrase_trends result is a flat list of monthly trend objects.
                # Each entry has: { "date": "2025-05-01", "total_count": 132001,
                #                   "connotation_types": {...}, ... }
                monthly_trends = tasks[0].get("result") or []

                trend = [entry.get("total_count", 0) for entry in monthly_trends]
                total = sum(trend)

                # Sentiment: aggregate connotation_types across all months
                sentiment = "Neutral"
                if total > 0 and monthly_trends:
                    agg_pos = sum(e.get("connotation_types", {}).get("positive", 0) for e in monthly_trends)
                    agg_neg = sum(e.get("connotation_types", {}).get("negative", 0) for e in monthly_trends)
                    if agg_pos > agg_neg * 1.5:
                        sentiment = "Positive"
                    elif agg_neg > agg_pos * 1.5:
                        sentiment = "Negative"

                logger.info(f"Mentions for {d}: total={total}, months={len(trend)}, sentiment={sentiment}")
                return d, {"mentions": total, "sentiment": sentiment, "trend": trend}

            except Exception as e:
                logger.warning(f"Error parsing mentions for {d}: {e}")
                return d, {"mentions": 0, "sentiment": "Neutral", "trend": [0] * 12}


        # Run all domain mention lookups in parallel
        mention_results = await asyncio.gather(*[fetch_mentions(d) for d in all_domains])
        results = dict(mention_results)


        # Brand SOV = brand mentions / total mentions across all domains
        total_all = sum(r["mentions"] for r in results.values()) or 1
        brand_sov = round((results[domain]["mentions"] / total_all) * 100, 1)

        return {
            "overall_sov": brand_sov,
            "data": [{"name": d, **results[d]} for d in all_domains]
        }

    # ─── AI Share of Voice ────────────────────────────────────────────────────

    async def _analyze_ai_sov(
        self,
        domain: str,
        brand_name: str,
        industry: str,
        service_type: str,
        competitors: List[str]
    ) -> Dict[str, Any]:
        """
        Measures AI Share of Voice: how often the brand appears in AI responses
        to generic industry questions (brand NOT mentioned in the prompt).

        SOV formula per model:
          brand_score   = 1 if brand mentioned, else 0
          comp_scores   = count of competitors mentioned (each counts as 1)
          total_score   = brand_score + comp_scores  (min 1 to avoid div/0)
          model_sov     = (brand_score / total_score) × 100

        Final SOV = average across all successful models.
        """
        # Generic discovery questions — brand NOT mentioned
        questions = [
            f"What are the top companies in the {industry} sector?",
            f"Which {service_type} providers would you recommend?",
            f"Who are the leaders and innovators in {industry}?",
        ]

        # Build search terms for the brand: check domain AND brand name
        brand_terms = [domain.lower(), brand_name.lower()]
        # Also check domain without TLD (e.g. "yesquesttech" from "yesquesttech.com")
        domain_root = domain.split(".")[0].lower()
        if domain_root not in brand_terms:
            brand_terms.append(domain_root)

        # Competitor search terms (domain root + full domain)
        comp_terms: Dict[str, List[str]] = {}
        for c in competitors:
            c_root = c.split(".")[0].lower()
            comp_terms[c] = list({c.lower(), c_root})

        models = ["openai", "gemini", "claude"]
        model_results = {}

        async def query_model(model: str) -> Optional[Dict]:
            batch_prompt = (
                f"Answer these questions about the {industry} industry. "
                f"Be specific with real company names.\n\n"
                + "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))
            )

            logger.info(f"AI SOV query [{model}]: {batch_prompt[:200]}...")

            resp = await execute_task(
                task_name=f"module_e_ai_sov_{model}",
                input_data={"messages": [{"role": "user", "content": batch_prompt}]},
                provider=model,
                options={"temperature": 0.4}
            )

            if not resp.success:
                logger.warning(f"AI SOV [{model}] failed: {resp.error}")
                return None

            text = str(resp.data).lower()
            logger.info(f"AI SOV [{model}] response (first 400 chars): {text[:400]}")

            # Check if brand is mentioned (any of its terms)
            brand_mentioned = any(term in text for term in brand_terms)
            brand_score = 1 if brand_mentioned else 0

            # Count how many distinct competitors are mentioned
            comp_score = sum(
                1 for c, terms in comp_terms.items()
                if any(term in text for term in terms)
            )

            total = brand_score + comp_score or 1
            sov = round((brand_score / total) * 100, 1)

            logger.info(
                f"AI SOV [{model}]: brand_mentioned={brand_mentioned}, "
                f"comp_mentions={comp_score}, SOV={sov}%"
            )

            return {
                "sov": sov,
                "brand_mentioned": brand_mentioned,
                "brand_mentions": brand_score,
                "competitor_mentions": comp_score,
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

        logger.info(f"AI SOV final: {avg_sov}% across {list(model_results.keys())}")

        return {
            "overall_sov": avg_sov,
            "brand_terms_checked": brand_terms,
            "by_model": model_results,
        }
