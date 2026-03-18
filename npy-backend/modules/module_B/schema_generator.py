
"""
Schema.org Markup Generator — Universal Edition
================================================
Uses Anthropic Claude (claude-opus-4-5) to generate the richest, most accurate
Schema.org JSON-LD markup for ANY website worldwide.

Architecture
------------
1. _extract_page_data()    — deep HTML signal extraction (30+ signal types)
2. _detect_page_signals()  — heuristic scoring across all schema types
3. _build_claude_prompt()  — world-class prompt with all extracted context
4. _call_claude()          — calls Claude API, strips fences, parses JSON
5. _post_process()         — injects FAQ pairs, ensures @graph, cleans empties

Supported schema types (auto-detected or user-selected)
--------------------------------------------------------
WebPage, WebSite, Article, BlogPosting, NewsArticle, TechArticle,
Organization, LocalBusiness, ProfessionalService, MedicalBusiness,
LegalService, FinancialService, FoodEstablishment, Store, Hotel,
Product, Offer, AggregateOffer, Service, FAQPage, BreadcrumbList,
Person, Event, Recipe, HowTo, VideoObject, ImageObject, Course,
JobPosting, Review, AggregateRating, SoftwareApplication, MobileApplication,
Book, Movie, TVSeries, MusicRecording, Podcast, PodcastEpisode,
Dataset, MedicalCondition, Drug, ItemList, SiteLinksSearchBox
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, urldefrag

# urllib.request is stdlib — no extra install needed
try:
    from urllib.request import Request, urlopen
    from urllib.error import URLError, HTTPError
    URLLIB_AVAILABLE = True
except ImportError:
    URLLIB_AVAILABLE = False

# requests is faster and handles redirects better — use if available
try:
    import requests as _requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# ---------------------------------------------------------------------------
# Optional dependencies
# ---------------------------------------------------------------------------
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logging.warning("Anthropic SDK not available — run: pip install anthropic")

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except Exception:
    BS4_AVAILABLE = False
    BeautifulSoup = None  # type: ignore

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CLAUDE_MODEL     = "claude-opus-4-5"   # Most intelligent — best structured data
MAX_TOKENS       = 8192                 # Enough for rich multi-schema output
MAX_PROMPT_CHARS = 90_000               # Claude's large context window

# ---------------------------------------------------------------------------
# Multi-page enrichment settings
# The generator auto-discovers and fetches contact/about pages to find
# address, phone, email and other business signals missing from the homepage.
# ---------------------------------------------------------------------------
FETCH_TIMEOUT       = 8      # seconds per HTTP request
FETCH_MAX_PAGES     = 4      # max extra pages to fetch per generation job
FETCH_MAX_BYTES     = 300_000  # max bytes to read per fetched page (300 KB)

# URL path patterns that strongly indicate a contact/about/location page
ENRICHMENT_URL_PATTERNS = re.compile(
    r"/(contact|about|location|locations|office|offices|"
    r"find-us|find_us|reach-us|reach_us|get-in-touch|"
    r"our-team|team|company|who-we-are|"
    r"address|directions|store|stores|branch|branches|"
    r"impressum|datenschutz|legal|imprint|"        # European sites
    r"kontakt|sobre|contacto|localisation|"         # Non-English
    r"support|help-center|helpdesk)(/|$|\?)",
    re.IGNORECASE,
)

# HTTP headers to send with all requests
_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; SchemaBot/1.0; "
        "+https://schema.org/docs/jsonldcontext.json)"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

# All supported schema types grouped by category
ALL_SCHEMA_TYPES: Dict[str, List[str]] = {
    "page":       ["WebPage", "WebSite", "SiteLinksSearchBox"],
    "content":    ["Article", "BlogPosting", "NewsArticle", "TechArticle",
                   "Book", "Movie", "TVSeries", "MusicRecording",
                   "Podcast", "PodcastEpisode", "Dataset"],
    "business":   ["Organization", "LocalBusiness", "ProfessionalService",
                   "MedicalBusiness", "LegalService", "FinancialService",
                   "FoodEstablishment", "Store", "Hotel"],
    "ecommerce":  ["Product", "Offer", "AggregateOffer"],
    "service":    ["Service"],
    "help":       ["FAQPage", "HowTo"],
    "navigation": ["BreadcrumbList", "ItemList"],
    "people":     ["Person"],
    "events":     ["Event"],
    "food":       ["Recipe"],
    "media":      ["VideoObject", "ImageObject"],
    "education":  ["Course"],
    "jobs":       ["JobPosting"],
    "reviews":    ["Review", "AggregateRating"],
    "software":   ["SoftwareApplication", "MobileApplication"],
    "medical":    ["MedicalCondition", "Drug"],
}

ALL_SCHEMA_TYPES_FLAT = [t for types in ALL_SCHEMA_TYPES.values() for t in types]

# ---------------------------------------------------------------------------
# Canonical output templates
# Exact structure for Organization, OrganizationLogo, LocalBusiness, Person, Product.
# Claude fills every "" field with real page data — structure never changes.
# ---------------------------------------------------------------------------
CANONICAL_TEMPLATES: Dict[str, Any] = {
    "Organization": {
        "@context":    "https://schema.org/",
        "@type":       "Organization",
        "@id":         "#Organization",
        "url":         "",
        "legalName":   "",
        "name":        "",
        "description": "",
        "image":       "",
        "logo":        "",
        "telephone":   "",
        "faxNumber":   "",
        "email":       "",
        "address": {
            "@type":           "PostalAddress",
            "streetAddress":   "",
            "addressLocality": "",
            "addressRegion":   "",
            "addressCountry":  "",
            "postalCode":      "",
        },
        "sameAs": ["", "", "", "", ""],
    },
    "LocalBusiness": {
        "@context":    "https://schema.org/",
        "@type":       "LocalBusiness",
        "@id":         "#LocalBusiness",
        "url":         "",
        "legalName":   "",
        "name":        "",
        "description": "",
        "image":       "",
        "logo":        "",
        "telephone":   "",
        "faxNumber":   "",
        "email":       "",
        "address": {
            "@type":           "PostalAddress",
            "streetAddress":   "",
            "addressLocality": "",
            "addressRegion":   "",
            "addressCountry":  "",
            "postalCode":      "",
        },
    },
    "Person": {
        "@context":    "https://schema.org/",
        "@type":       "Person",
        "@id":         "#Person",
        "url":         "",
        "name":        "",
        "description": "",
        "image":       "",
        "telephone":   "",
        "email":       "",
        "sameAs": ["", "", "", "", ""],
    },

    # Logo-only Organisation markup (lightweight, for sites that just need logo)
    "OrganizationLogo": {
        "@context": "https://schema.org",
        "@type":    "Organization",
        "url":      "",
        "logo":     "",
    },

    # Full Product markup with nested Review, Rating, Brand, Offer
    "Product": {
        "@context":    "https://schema.org",
        "@type":       "Product",
        "name":        "",
        "description": "",
        "image":       ["", "", ""],
        "sku":         "",
        "brand": {
            "@type": "Brand",
            "name":  "",
        },
        "review": {
            "@type": "Review",
            "reviewRating": {
                "@type":       "Rating",
                "ratingValue": "",
                "bestRating":  "",
            },
            "author": {
                "@type": "Person",
                "name":  "",
            },
        },
        "offers": {
            "@type":           "Offer",
            "url":             "",
            "priceCurrency":   "",
            "price":           "",
            "priceValidUntil": "",
        },
    },
}


# ===========================================================================
# SchemaGenerator
# ===========================================================================
class SchemaGenerator:
    """
    Universal Schema.org markup generator powered by Anthropic Claude.
    Works on ANY website — ecommerce, blogs, local businesses, medical,
    legal, SaaS, recipes, events, jobs, and more.
    """

    GENERATOR_VERSION = "2026-03-18-universal-v6-address"

    # ------------------------------------------------------------------
    # Noise / FAQ detection patterns
    # ------------------------------------------------------------------
    _FAQ_NOISE_RE = re.compile(
        r"(want\s+to\s+know|see\s+how|find\s+out|ready\s+to|shall\s+we|"
        r"will\s+you|are\s+you\s+ready|want\s+us\s+to|allow\s+us|"
        r"select\s+all\s+that\s+apply|fill\s+out|"
        r"your\s+(name|email|website|budget|message|monthly)|"
        r"which\s+(campaign|strategy)|"
        r"what\s+do\s+you\s+need\s+help|"
        r"what.{1,3}s\s+your\s+monthly|what.{1,3}s\s+your\s+budget|"
        r"even\s+an\s+estimated)",
        re.IGNORECASE,
    )

    _FAQ_SECTION_RE = re.compile(
        r"faq|frequently.asked|question|accordion|toggle|collapse|"
        r"faq-section|faq_section|faqs",
        re.IGNORECASE,
    )

    _REAL_Q_START_RE = re.compile(
        r"^\s*(\d+[\.\)]\s*)?(what|how|why|when|where|do|does|can|is|are|"
        r"should|will|which|who|have|has|did|would|could|may|might|"
        r"am|was|were|shall|need|must|ought)\b",
        re.IGNORECASE,
    )

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------
    def __init__(self) -> None:
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.client: Optional[anthropic.Anthropic] = None

        if ANTHROPIC_AVAILABLE and self.api_key:
            try:
                self.client = anthropic.Anthropic(api_key=self.api_key)
                logging.info(
                    f"SchemaGenerator initialised — model: {CLAUDE_MODEL}"
                )
            except Exception as exc:
                logging.error(f"Anthropic client init failed: {exc}")
        elif not self.api_key:
            logging.warning("ANTHROPIC_API_KEY not set.")

    # ==================================================================
    # PUBLIC API
    # ==================================================================

    def generate_schema(
        self,
        html: str,
        url: str,
        schema_type: str = "auto",
    ) -> Dict[str, Any]:
        """
        Main entry point.
        html        — raw HTML string of the page (already fetched by caller)
        url         — canonical URL of the page
        schema_type — 'auto' (detect all) or any Schema.org type name

        Multi-page enrichment:
            Automatically discovers and fetches contact/about/location pages
            from the same domain to collect address, phone, email, hours and
            other business signals that are rarely on the homepage.
            All extra fetches run in parallel (max FETCH_MAX_PAGES pages).
        """
        if not self.client:
            return self._err(
                "Anthropic API not configured",
                "Set ANTHROPIC_API_KEY in your environment.",
            )
        try:
            # ── Step 0: Multi-page enrichment ─────────────────────────
            # Extract page data from the primary HTML first so we can
            # check if business-signal pages need fetching.
            primary_data = self._extract_page_data(html, url)

            needs_enrichment = self._needs_enrichment(
                primary_data, schema_type
            )
            if needs_enrichment and url:
                enriched = self._enrich_from_extra_pages(
                    primary_data, url
                )
                if enriched:
                    primary_data = enriched
                    logging.info(
                        f"[SCHEMA] Multi-page enrichment applied for {url}"
                    )

            return self._generate(url, html, schema_type,
                                  pre_extracted=primary_data)
        except Exception as exc:
            logging.error(f"generate_schema failed: {exc}")
            return self._err("Schema generation failed", str(exc))

    def validate_schema(self, schema_json: Dict[str, Any]) -> Dict[str, Any]:
        """Lightweight structural validation."""
        issues: List[str] = []
        if "@context" not in schema_json:
            issues.append("Missing @context")
        has_type = bool(schema_json.get("@type"))
        if not has_type and isinstance(schema_json.get("@graph"), list):
            has_type = any(
                isinstance(n, dict) and n.get("@type")
                for n in schema_json["@graph"]
            )
        if not has_type:
            issues.append("Missing @type")
        return {"valid": not issues, "issues": issues, "warnings": []}

    # ==================================================================
    # CORE GENERATION PIPELINE
    # ==================================================================

    def _generate(
        self,
        url: str,
        html: str,
        schema_type: str,
        pre_extracted: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:

        # ── Step 1: Extract all page signals ──────────────────────────
        # Use pre_extracted if already computed (from multi-page enrichment)
        page_data = pre_extracted if pre_extracted is not None             else self._extract_page_data(html, url)

        # ── Step 2: Score schema types ────────────────────────────────
        is_auto = not schema_type or schema_type.lower() == "auto"
        detected = self._detect_page_signals(page_data, schema_type)
        faq_pairs: List[Dict[str, str]] = page_data.get("faq_pairs") or []

        if faq_pairs:
            logging.info(
                f"[SCHEMA] {len(faq_pairs)} FAQ pairs extracted | url={url}"
            )

        # ── Step 3: Fast-paths (no Claude needed) ─────────────────────
        if schema_type == "FAQPage":
            if faq_pairs:
                return self._fast_faqpage(faq_pairs, url, page_data)
        if schema_type == "BreadcrumbList":
            return self._fast_breadcrumb(page_data, url)

        # ── Step 3b: Canonical-template fast-paths ─────────────────────
        # For Organization, LocalBusiness, Person we use EXACT fixed templates
        # and ask Claude only to fill the "" fields — structure is guaranteed.
        if schema_type in CANONICAL_TEMPLATES:
            return self._template_fill_with_claude(
                schema_type, page_data, url
            )

        # ── Step 4: Build prompt and call Claude ──────────────────────
        content_sample, _ = self._trim_page_data(page_data, MAX_PROMPT_CHARS)
        system_prompt = self._build_system_prompt()
        user_prompt   = self._build_user_prompt(
            url, content_sample, detected, schema_type, is_auto
        )
        raw = self._call_claude(system_prompt, user_prompt)

        # ── Step 5: Parse + post-process ──────────────────────────────
        try:
            data = self._safe_parse_json(raw)
            data = self._inject_faq(data, faq_pairs)
            data = self._ensure_graph(data)
            data = self._clean_empty_fields(data)

            primary = (
                schema_type if (schema_type and not is_auto)
                else self._primary_type(data)
            )
            return {
                "success":     True,
                "schema":      data,
                "type":        primary,
                "schema_text": json.dumps(data, indent=2, ensure_ascii=False),
                "rdfa_markup": "",
            }
        except Exception as exc:
            logging.error(f"JSON parse failed: {exc}\nRaw snippet: {raw[:300]}")
            return self._err("Failed to parse Claude response", str(exc))


    # ==================================================================
    # MULTI-PAGE ENRICHMENT ENGINE
    # ==================================================================
    # Strategy: discover contact/about/location pages on the same domain,
    # fetch them in parallel, extract all business signals, then merge
    # the richest values into the primary page_data.
    # This is the most reliable way to find addresses, phone numbers, etc.
    # since most websites put contact info on dedicated pages, not homepages.
    # ==================================================================

    def _needs_enrichment(
        self, page_data: Dict[str, Any], schema_type: str
    ) -> bool:
        """
        Returns True if extra page fetching would improve the schema.
        We enrich when:
        - Requested type is business-related (Org, LocalBusiness, Person)
        - OR auto-mode and address/phone/email is missing
        """
        business_types = {
            "Organization", "LocalBusiness", "ProfessionalService",
            "MedicalBusiness", "LegalService", "FinancialService",
            "FoodEstablishment", "Store", "Hotel", "Person", "auto",
        }
        st = (schema_type or "auto").strip()
        if st not in business_types and st.lower() != "auto":
            return False

        # Already have good address data — no need
        if self._has_address_data(page_data):
            addr = page_data.get("address_signals") or {}
            real = {k: v for k, v in addr.items()
                    if k not in ("@type", "raw_address") and v}
            if len(real) >= 2:  # have at least city + country
                return False

        return True

    def _discover_enrichment_urls(
        self, primary_data: Dict[str, Any], base_url: str
    ) -> List[str]:
        """
        Discover candidate URLs for enrichment by:
        1. Scanning all internal links for contact/about patterns
        2. Guessing common paths (/contact, /about-us, etc.)
        Returns up to FETCH_MAX_PAGES unique URLs sorted by relevance.
        """
        parsed_base = urlparse(base_url)
        base_origin = f"{parsed_base.scheme}://{parsed_base.netloc}"

        scored: Dict[str, int] = {}

        # Priority path guesses (tried even if not found in links)
        guesses = [
            "/contact", "/contact-us", "/contact_us",
            "/about", "/about-us", "/about_us", "/about/contact",
            "/location", "/locations", "/our-locations",
            "/office", "/offices", "/find-us",
            "/get-in-touch", "/reach-us",
            "/company", "/company/contact",
            "/impressum",           # German sites
            "/kontakt",             # German/Dutch
            "/contacto",            # Spanish
            "/support/contact",
            "/store-locator",
            "/stores",
        ]
        for path in guesses:
            url = base_origin + path
            scored[url] = scored.get(url, 0) + 5  # high base score

        # Scan all links from primary page
        for link in (primary_data.get("links") or []):
            href = (link.get("href") or "").strip()
            if not href:
                continue
            # Make absolute
            abs_href = urljoin(base_url, href)
            abs_href, _ = urldefrag(abs_href)  # strip fragment
            parsed = urlparse(abs_href)

            # Same domain only
            if parsed.netloc != parsed_base.netloc:
                continue
            # Skip non-HTML resources
            if re.search(r"\.(jpg|jpeg|png|gif|pdf|zip|css|js|xml|ico)$",
                         parsed.path, re.I):
                continue
            # Skip homepage itself
            if parsed.path in ("", "/"):
                continue

            # Score by relevance
            if ENRICHMENT_URL_PATTERNS.search(parsed.path):
                scored[abs_href] = scored.get(abs_href, 0) + 10

            # Bonus: link text hints at contact/about
            link_text = (link.get("text") or "").lower()
            if re.search(
                r"contact|about|location|address|office|find us|"
                r"reach|get in touch|directions|store",
                link_text, re.I
            ):
                scored[abs_href] = scored.get(abs_href, 0) + 8

        # Sort by score descending, return top N
        ranked = sorted(scored.items(), key=lambda x: x[1], reverse=True)
        result = [u for u, _ in ranked if u != base_url]

        # Deduplicate (path-level)
        seen_paths: set = set()
        unique: List[str] = []
        for u in result:
            p = urlparse(u).path.rstrip("/").lower()
            if p not in seen_paths:
                seen_paths.add(p)
                unique.append(u)
            if len(unique) >= FETCH_MAX_PAGES:
                break

        logging.info(
            f"[ENRICH] Discovered {len(unique)} candidate URLs: "
            f"{unique}"
        )
        return unique

    def _fetch_url(self, url: str) -> Optional[str]:
        """
        Fetch a URL and return its HTML. Returns None on any error.
        Uses `requests` if available, falls back to urllib.
        """
        try:
            if REQUESTS_AVAILABLE:
                resp = _requests.get(
                    url,
                    headers=_HTTP_HEADERS,
                    timeout=FETCH_TIMEOUT,
                    allow_redirects=True,
                    stream=True,
                )
                if resp.status_code == 200:
                    content_type = resp.headers.get("content-type", "")
                    if "html" not in content_type.lower():
                        return None
                    chunks: List[bytes] = []
                    size = 0
                    for chunk in resp.iter_content(chunk_size=8192):
                        chunks.append(chunk)
                        size += len(chunk)
                        if size >= FETCH_MAX_BYTES:
                            break
                    html = b"".join(chunks).decode("utf-8", errors="replace")
                    logging.info(
                        f"[FETCH] ✅ {url} — {len(html):,} chars"
                    )
                    return html
                else:
                    logging.debug(
                        f"[FETCH] HTTP {resp.status_code}: {url}"
                    )
                    return None

            elif URLLIB_AVAILABLE:
                req = Request(url, headers=_HTTP_HEADERS)
                with urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                    content_type = resp.headers.get_content_type()
                    if "html" not in content_type:
                        return None
                    raw = resp.read(FETCH_MAX_BYTES)
                    charset = resp.headers.get_content_charset("utf-8")
                    return raw.decode(charset, errors="replace")
            else:
                logging.warning("[FETCH] No HTTP library available")
                return None

        except Exception as exc:
            logging.debug(f"[FETCH] Failed {url}: {exc}")
            return None

    def _extract_business_signals(
        self, html: str, url: str
    ) -> Dict[str, Any]:
        """
        Lightweight extraction focused on business contact signals.
        Called for each extra page — extracts only what we need for
        enrichment (address, phone, email, hours, social, logo).
        """
        if not html or not BS4_AVAILABLE:
            return {}
        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            return {}

        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()

        return {
            "url":              url,
            "address_signals":  self._address(soup),
            "address_context":  self._address_context(soup),
            "phone_signals":    self._phones(soup),
            "email_signals":    self._emails(soup),
            "hours_signals":    self._hours(soup),
            "social_links":     self._social(soup),
            "persons":          self._persons(soup),
            "existing_json_ld": self._existing_jsonld(soup),
            "microdata":        self._microdata(soup),
            # Grab first few paragraphs for address parsing context
            "paragraphs": [
                self._txt(p) for p in soup.find_all("p")
                if len(self._txt(p)) >= 20
            ][:30],
        }

    def _merge_page_signals(
        self,
        primary: Dict[str, Any],
        extras: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Merge extra-page signals into primary page_data.
        Rules:
        - Address: take the richest (most filled sub-fields) address found
        - Phone / email: union all unique values, primary page first
        - Hours: take first non-empty
        - Social: union
        - Persons: union
        - Existing JSON-LD: prepend (contact page JSON-LD is gold)
        - address_context: concatenate all
        """
        import copy
        merged = copy.deepcopy(primary)

        def _addr_richness(addr: Dict[str, Any]) -> int:
            """Count non-empty, non-@type fields."""
            return sum(
                1 for k, v in addr.items()
                if k not in ("@type",) and v and str(v).strip()
            )

        best_addr = primary.get("address_signals") or {}
        best_score = _addr_richness(best_addr)

        ctx_parts = [primary.get("address_context") or ""]

        for extra in extras:
            # ── Address: keep richest ──────────────────────────────────
            ea = extra.get("address_signals") or {}
            score = _addr_richness(ea)
            if score > best_score:
                best_addr  = ea
                best_score = score
                logging.info(
                    f"[ENRICH] Better address found on {extra.get('url')}: "
                    f"{ea}"
                )

            # ── address_context: append ────────────────────────────────
            ectx = (extra.get("address_context") or "").strip()
            if ectx:
                ctx_parts.append(ectx)

            # ── Phone: union ───────────────────────────────────────────
            existing_phones = set(merged.get("phone_signals") or [])
            for p in (extra.get("phone_signals") or []):
                if p and p not in existing_phones:
                    merged.setdefault("phone_signals", []).append(p)
                    existing_phones.add(p)

            # ── Email: union ───────────────────────────────────────────
            existing_emails = set(merged.get("email_signals") or [])
            for e in (extra.get("email_signals") or []):
                if e and e not in existing_emails:
                    merged.setdefault("email_signals", []).append(e)
                    existing_emails.add(e)

            # ── Hours ──────────────────────────────────────────────────
            if not merged.get("hours_signals") and extra.get("hours_signals"):
                merged["hours_signals"] = extra["hours_signals"]

            # ── Social: union ──────────────────────────────────────────
            existing_social = set(merged.get("social_links") or [])
            for s in (extra.get("social_links") or []):
                if s and s not in existing_social:
                    merged.setdefault("social_links", []).append(s)
                    existing_social.add(s)

            # ── Persons ────────────────────────────────────────────────
            existing_names = {
                p.get("name") for p in (merged.get("persons") or [])
            }
            for person in (extra.get("persons") or []):
                if person.get("name") not in existing_names:
                    merged.setdefault("persons", []).append(person)
                    existing_names.add(person.get("name"))

            # ── Existing JSON-LD (contact page schemas are valuable) ───
            extra_jld = extra.get("existing_json_ld") or []
            if extra_jld:
                current = merged.get("existing_json_ld") or []
                merged["existing_json_ld"] = extra_jld + current

            # ── Microdata ─────────────────────────────────────────────
            extra_md = extra.get("microdata") or []
            if extra_md:
                current = merged.get("microdata") or []
                merged["microdata"] = extra_md + current

            # ── Extra paragraphs (for address context parsing) ─────────
            extra_paras = extra.get("paragraphs") or []
            if extra_paras:
                current = merged.get("paragraphs") or []
                merged["paragraphs"] = extra_paras + current[:50]

        merged["address_signals"]  = best_addr
        merged["address_context"]  = " | ".join(
            p for p in ctx_parts if p
        )[:3000]

        # Log summary
        logging.info(
            f"[ENRICH] Merged signals: "
            f"address_richness={best_score} "
            f"phones={len(merged.get('phone_signals') or [])} "
            f"emails={len(merged.get('email_signals') or [])} "
            f"social={len(merged.get('social_links') or [])}"
        )
        return merged

    def _enrich_from_extra_pages(
        self,
        primary_data: Dict[str, Any],
        base_url: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Discovers, fetches and merges contact/about/location pages
        in parallel. Returns enriched page_data, or None if no useful
        extra data was found.
        """
        candidate_urls = self._discover_enrichment_urls(
            primary_data, base_url
        )
        if not candidate_urls:
            logging.info(f"[ENRICH] No candidate URLs found for {base_url}")
            return None

        # Fetch all candidates in parallel
        extras: List[Dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=FETCH_MAX_PAGES) as pool:
            future_map = {
                pool.submit(self._fetch_url, url): url
                for url in candidate_urls
            }
            for future in as_completed(
                future_map, timeout=FETCH_TIMEOUT + 2
            ):
                url = future_map[future]
                try:
                    html = future.result()
                    if html:
                        signals = self._extract_business_signals(html, url)
                        if signals:
                            extras.append(signals)
                            logging.info(
                                f"[ENRICH] Signals from {url}: "
                                f"addr={bool(signals.get('address_signals'))}"
                                f" phones={signals.get('phone_signals')}"
                                f" emails={signals.get('email_signals')}"
                            )
                except Exception as exc:
                    logging.debug(f"[ENRICH] {url} error: {exc}")

        if not extras:
            logging.info(f"[ENRICH] No extra signals found for {base_url}")
            return None

        return self._merge_page_signals(primary_data, extras)

    # ==================================================================
    # SIGNAL EXTRACTION — 30+ signal categories
    # ==================================================================

    def _extract_page_data(self, html: str, url: str) -> Dict[str, Any]:
        parsed = urlparse(url) if url else urlparse("")
        base: Dict[str, Any] = {
            "url":               url,
            "url_host":          parsed.netloc or "",
            "url_path":          parsed.path or "",
            "detected_page_type": self._url_to_type(parsed.path or ""),
        }

        if not html:
            return base

        if not BS4_AVAILABLE:
            base["text"] = self._regex_clean(html)[:60_000]
            return base

        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            base["text"] = self._regex_clean(html)[:60_000]
            return base

        for tag in soup(["script", "style", "noscript",
                          "iframe", "svg", "canvas", "template"]):
            tag.decompose()

        return {
            **base,
            # ── Head / meta ──────────────────────────────────────────
            "title":             self._title(soup),
            "canonical":         self._canonical(soup, url),
            "meta":              self._meta_all(soup),
            "og_data":           self._og(soup),
            "twitter_data":      self._twitter(soup),

            # ── Content ──────────────────────────────────────────────
            "headings":          self._headings(soup),
            "paragraphs":        self._paragraphs(soup),
            "lists":             self._lists(soup),

            # ── Media ────────────────────────────────────────────────
            "images":            self._images(soup, url),
            "videos":            self._videos(soup, url),
            "audio":             self._audio(soup),

            # ── Navigation ───────────────────────────────────────────
            "breadcrumbs":       self._breadcrumbs(soup),
            "links":             self._links(soup, url),
            "nav_links":         self._nav_links(soup),

            # ── Existing structured data ──────────────────────────────
            "existing_json_ld":  self._existing_jsonld(soup),
            "microdata":         self._microdata(soup),

            # ── FAQ / HowTo ───────────────────────────────────────────
            "faq_pairs":         self._extract_faq_pairs(soup),
            "howto_steps":       self._howto_steps(soup),

            # ── Ecommerce ─────────────────────────────────────────────
            "prices":            self._prices(soup),
            "product_signals":   self._product_signals(soup),
            "offers":            self._offers(soup),
            "ratings":           self._ratings(soup),

            # ── People ────────────────────────────────────────────────
            "authors":           self._authors(soup),
            "persons":           self._persons(soup),

            # ── Dates ─────────────────────────────────────────────────
            "dates":             self._dates(soup),

            # ── Business ──────────────────────────────────────────────
            "address_signals":   self._address(soup),
            "phone_signals":     self._phones(soup),
            "email_signals":     self._emails(soup),
            "hours_signals":     self._hours(soup),
            "social_links":      self._social(soup),
            "address_context":   self._address_context(soup),

            # ── Vertical signals ──────────────────────────────────────
            "event_signals":     self._event_signals(soup),
            "job_signals":       self._job_signals(soup),
            "recipe_signals":    self._recipe_signals(soup),
            "app_signals":       self._app_signals(soup),
            "course_signals":    self._course_signals(soup),
            "medical_signals":   self._medical_signals(soup),
            "review_signals":    self._review_signals(soup),
        }

    # ------------------------------------------------------------------
    # Head / meta
    # ------------------------------------------------------------------
    def _title(self, soup) -> str:
        t = soup.find("title")
        if t:
            return self._txt(t)
        h1 = soup.find("h1")
        return self._txt(h1) if h1 else ""

    def _canonical(self, soup, base: str) -> str:
        tag = soup.find("link", rel=re.compile(r"canonical", re.I))
        if tag:
            href = (tag.get("href") or "").strip()
            return urljoin(base, href) if href else ""
        return base or ""

    def _meta_all(self, soup) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for m in soup.find_all("meta"):
            k = (m.get("name") or m.get("property") or "").strip()
            v = (m.get("content") or "").strip()
            if k and v and k not in out:
                out[k] = v
            if len(out) >= 80:
                break
        return out

    def _og(self, soup) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for m in soup.find_all("meta",
                                property=re.compile(r"^og:", re.I)):
            k = (m.get("property") or "").replace("og:", "").strip()
            v = (m.get("content") or "").strip()
            if k and v:
                out[k] = v
        return out

    def _twitter(self, soup) -> Dict[str, str]:
        out: Dict[str, str] = {}
        for m in soup.find_all(
            "meta", attrs={"name": re.compile(r"^twitter:", re.I)}
        ):
            k = (m.get("name") or "").replace("twitter:", "").strip()
            v = (m.get("content") or "").strip()
            if k and v:
                out[k] = v
        return out

    # ------------------------------------------------------------------
    # Content
    # ------------------------------------------------------------------
    def _headings(self, soup) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
            t = self._txt(h)
            if t:
                out.append({"level": h.name, "text": t})
        return self._dd_by("text", out, 80)

    def _paragraphs(self, soup) -> List[str]:
        return self._dd_list(
            [self._txt(p) for p in soup.find_all("p") if len(self._txt(p)) >= 30],
            100,
        )

    def _lists(self, soup) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for lst in soup.find_all(["ul", "ol"])[:20]:
            items = [
                self._txt(li)
                for li in lst.find_all("li")
                if self._txt(li)
            ]
            if len(items) >= 2:
                out.append({"type": lst.name, "items": items[:30]})
        return out

    # ------------------------------------------------------------------
    # Media
    # ------------------------------------------------------------------
    def _images(self, soup, base: str) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for img in soup.find_all("img"):
            src = (img.get("src") or img.get("data-src") or "").strip()
            if not src or src.startswith("data:"):
                continue
            out.append({
                "url":    urljoin(base, src),
                "alt":    (img.get("alt") or "").strip(),
                "width":  (img.get("width") or "").strip(),
                "height": (img.get("height") or "").strip(),
            })
            if len(out) >= 30:
                break
        return out

    def _videos(self, soup, base: str) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for v in soup.find_all("video"):
            src = (v.get("src") or "").strip()
            if src:
                out.append({"src": urljoin(base, src),
                            "poster": urljoin(base, v.get("poster") or "")})
        for iframe in soup.find_all("iframe"):
            src = (iframe.get("src") or "").strip()
            if re.search(r"youtube|vimeo|dailymotion|wistia|loom",
                         src, re.I):
                out.append({"embed_url": src})
        return out[:10]

    def _audio(self, soup) -> List[Dict[str, str]]:
        return [
            {"src": (a.get("src") or "").strip()}
            for a in soup.find_all("audio")
            if a.get("src")
        ][:5]

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------
    def _breadcrumbs(self, soup) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for nav in soup.find_all(["nav", "ol", "ul"]):
            attrs = " ".join([
                str(nav.get("aria-label") or ""),
                " ".join(nav.get("class") or []),
                str(nav.get("id") or ""),
            ]).lower()
            if "breadcrumb" not in attrs:
                continue
            for a in nav.find_all("a"):
                name = self._txt(a)
                if name:
                    out.append({"name": name,
                                "url": (a.get("href") or "").strip()})
            for item in nav.find_all(["li", "span"]):
                if not item.find("a"):
                    name = self._txt(item)
                    if name:
                        out.append({"name": name, "url": ""})
            if out:
                return out[:20]
        return out

    def _links(self, soup, base: str) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for a in soup.find_all("a"):
            href = (a.get("href") or "").strip()
            if not href or href.startswith(("#", "javascript")):
                continue
            t = self._txt(a)
            if t:
                out.append({"text": t[:120], "href": href})
        return self._dd_by("href", out, 60)

    def _nav_links(self, soup) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for nav in soup.find_all("nav")[:3]:
            for a in nav.find_all("a"):
                t = self._txt(a)
                h = (a.get("href") or "").strip()
                if t and h:
                    out.append({"text": t, "href": h})
        return self._dd_by("text", out, 40)

    # ------------------------------------------------------------------
    # Existing structured data
    # ------------------------------------------------------------------
    def _existing_jsonld(self, soup) -> List[Any]:
        out: List[Any] = []
        for tag in soup.find_all(
            "script",
            attrs={"type": re.compile(r"application/ld\+json", re.I)},
        ):
            raw = (tag.string or tag.get_text() or "").strip()
            if not raw:
                continue
            try:
                out.append(json.loads(raw))
            except Exception:
                out.append(raw[:3000])
            if len(out) >= 5:
                break
        return out

    def _microdata(self, soup) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for node in soup.find_all(attrs={"itemscope": True}):
            itemtype = (node.get("itemtype") or "").strip()
            if "schema.org" not in itemtype:
                continue
            props: Dict[str, str] = {}
            for pn in node.find_all(attrs={"itemprop": True}):
                prop = (pn.get("itemprop") or "").strip()
                val  = (pn.get("content") or self._txt(pn) or "").strip()
                if prop and val and prop not in props:
                    props[prop] = val
                if len(props) >= 30:
                    break
            out.append({"itemtype": itemtype, "properties": props})
            if len(out) >= 8:
                break
        return out

    # ------------------------------------------------------------------
    # FAQ extraction — robust + noise-resistant
    # ------------------------------------------------------------------
    def _is_faq_container(self, el) -> bool:
        node = el
        for _ in range(14):
            if node is None:
                break
            s = " ".join([
                str(node.get("id") or ""),
                " ".join(node.get("class") or []),
                str(node.get("data-section") or ""),
                str(node.get("aria-label") or ""),
            ])
            if self._FAQ_SECTION_RE.search(s):
                return True
            node = getattr(node, "parent", None)
        return False

    def _is_noise_q(self, text: str) -> bool:
        t = (text or "").strip()
        if len(t) < 10:
            return True
        if self._FAQ_NOISE_RE.search(t):
            return True
        if not self._REAL_Q_START_RE.match(t):
            return True
        return False

    def _extract_faq_pairs(self, soup) -> List[Dict[str, str]]:
        faq: List[Dict[str, str]] = []

        def _add(q: str, a: str) -> bool:
            q = re.sub(r"^\s*\d+[\.\)]\s*", "", q).strip()
            q = re.sub(r"\s+", " ", q)
            a = re.sub(r"\s+", " ", (a or "").strip())
            if not q or not a or self._is_noise_q(q):
                logging.debug(f"[FAQ] Rejected noise: {q[:60]}")
                return False
            faq.append({"question": q, "answer": a[:1000]})
            return True

        def _collect_answer(heading_el) -> str:
            parts: List[str] = []
            for sib in heading_el.next_siblings:
                sn = getattr(sib, "name", None)
                if sn in {"h2", "h3", "h4", "h5", "h6", "dt"}:
                    break
                if sn and sn not in {"script", "style", "noscript"}:
                    t = self._txt(sib)
                    if t:
                        parts.append(t)
            return " ".join(parts).strip()

        # ── 1. <details>/<summary> — most semantically reliable ───────
        for details in soup.find_all("details"):
            summary = details.find("summary")
            if not summary:
                continue
            q = self._txt(summary)
            if "?" not in q:
                continue
            try:
                summary.extract()
            except Exception:
                pass
            _add(q, self._txt(details))
            if len(faq) >= 25:
                break
        if faq:
            return self._dedup_faq(faq)

        # ── 2. Elements inside explicit FAQ containers ─────────────────
        for el in soup.find_all(True):
            attrs_s = " ".join([
                str(el.get("id") or ""),
                " ".join(el.get("class") or []),
            ])
            if not self._FAQ_SECTION_RE.search(attrs_s):
                continue
            for h in el.find_all(
                ["h2", "h3", "h4", "h5", "h6", "dt", "strong", "b"]
            ):
                q = self._txt(h)
                if "?" not in q:
                    continue
                _add(q, _collect_answer(h))
                if len(faq) >= 25:
                    return self._dedup_faq(faq)
            if faq:
                return self._dedup_faq(faq)

        # ── 3. Numbered headings anywhere — "1. What is ...?" ─────────
        num_re = re.compile(r"^\s*\d+[\.\)]\s+.{5,}\?", re.I)
        for h in soup.find_all(["h2", "h3", "h4", "h5", "h6"]):
            q = self._txt(h)
            if not num_re.match(q):
                continue
            _add(q, _collect_answer(h))
            if len(faq) >= 25:
                break
        if faq:
            return self._dedup_faq(faq)

        # ── 4. <li> with <strong>/<b> question inside FAQ container ───
        for li in soup.find_all("li"):
            if not self._is_faq_container(li):
                continue
            strong = li.find(["strong", "b"])
            if not strong:
                continue
            q = self._txt(strong)
            if "?" not in q:
                continue
            p = li.find("p")
            if p:
                _add(q, self._txt(p))
            if len(faq) >= 25:
                break

        return self._dedup_faq(faq)

    def _dedup_faq(self, faq: List[Dict[str, str]]) -> List[Dict[str, str]]:
        seen: set = set()
        out: List[Dict[str, str]] = []
        for pair in faq:
            k = (pair.get("question") or "").strip().lower()
            if k and k not in seen:
                seen.add(k)
                out.append(pair)
        return out[:25]

    # ------------------------------------------------------------------
    # HowTo steps
    # ------------------------------------------------------------------
    def _howto_steps(self, soup) -> List[Dict[str, str]]:
        steps: List[Dict[str, str]] = []
        step_re = re.compile(r"\bstep\b", re.I)

        for container in soup.find_all(True):
            attrs = " ".join([
                str(container.get("id") or ""),
                " ".join(container.get("class") or []),
            ])
            if not step_re.search(attrs):
                continue
            for h in container.find_all(
                ["h2", "h3", "h4", "h5", "li"]
            ):
                t = self._txt(h)
                if not step_re.search(t):
                    continue
                parts: List[str] = []
                for sib in h.next_siblings:
                    sn = getattr(sib, "name", None)
                    if sn in {"h2", "h3", "h4", "h5", "li"}:
                        break
                    if sn == "p":
                        parts.append(self._txt(sib))
                steps.append({
                    "name":        t,
                    "description": " ".join(parts)[:400],
                })

        if not steps:
            for ol in soup.find_all("ol")[:5]:
                items = [
                    self._txt(li)
                    for li in ol.find_all("li")
                    if self._txt(li)
                ]
                if len(items) >= 3:
                    steps = [
                        {"name": f"Step {i}", "description": it}
                        for i, it in enumerate(items[:20], 1)
                    ]
                    break

        return steps[:20]

    # ------------------------------------------------------------------
    # Ecommerce
    # ------------------------------------------------------------------
    def _prices(self, soup) -> List[str]:
        prices: List[str] = []
        for m in soup.find_all("meta"):
            prop = (m.get("property") or m.get("name") or "").lower()
            if "price" in prop:
                v = (m.get("content") or "").strip()
                if v:
                    prices.append(v)
        for el in soup.find_all(
            attrs={"itemprop": re.compile(r"price", re.I)}
        ):
            v = (el.get("content") or self._txt(el) or "").strip()
            if v:
                prices.append(v)
        price_re = re.compile(
            r"[\$£€¥₹]\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*[\$£€¥]",
            re.I,
        )
        for el in soup.find_all(
            class_=re.compile(r"price|cost|amount|rate", re.I)
        )[:10]:
            m = price_re.search(self._txt(el))
            if m:
                prices.append(m.group().strip())
        return list(dict.fromkeys(prices))[:20]

    def _product_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        h1 = soup.find("h1")
        if h1:
            sig["name"] = self._txt(h1)
        for prop in ["brand", "sku", "gtin", "mpn", "model",
                     "availability", "condition", "color",
                     "size", "material", "weight", "description"]:
            el = soup.find(attrs={"itemprop": prop})
            if el:
                v = (el.get("content") or self._txt(el) or "").strip()
                if v:
                    sig[prop] = v[:500] if prop == "description" else v
        return sig

    def _offers(self, soup) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for node in soup.find_all(
            attrs={"itemtype": re.compile(r"Offer", re.I)}
        ):
            offer: Dict[str, str] = {}
            for p in ["price", "priceCurrency", "availability",
                      "url", "validFrom", "priceValidUntil"]:
                el = node.find(attrs={"itemprop": p})
                if el:
                    offer[p] = (
                        el.get("content") or self._txt(el) or ""
                    ).strip()
            if offer:
                out.append(offer)
        return out[:10]

    def _ratings(self, soup) -> Dict[str, str]:
        r: Dict[str, str] = {}
        for p in ["ratingValue", "bestRating", "worstRating",
                  "ratingCount", "reviewCount"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                r[p] = (el.get("content") or self._txt(el) or "").strip()
        rating_re = re.compile(r"(\d+\.?\d*)\s*/\s*(\d+)", re.I)
        for el in soup.find_all(
            class_=re.compile(r"rating|stars?|score", re.I)
        )[:5]:
            m = rating_re.search(self._txt(el))
            if m:
                r.setdefault("ratingValue", m.group(1))
                r.setdefault("bestRating",  m.group(2))
        return r

    # ------------------------------------------------------------------
    # People
    # ------------------------------------------------------------------
    def _authors(self, soup) -> List[Dict[str, str]]:
        authors: List[Dict[str, str]] = []
        for el in soup.find_all(attrs={"itemprop": "author"}):
            n = self._txt(el)
            if n:
                authors.append({"name": n})
        for el in soup.find_all(
            class_=re.compile(r"\bauthor\b|\bbyline\b|\bwriter\b", re.I)
        )[:5]:
            n = self._txt(el)
            if n and len(n) < 80:
                authors.append({"name": n})
        for a in soup.find_all("a", rel="author"):
            n = self._txt(a)
            if n:
                authors.append({"name": n, "url": (a.get("href") or "").strip()})
        return self._dd_by("name", authors, 5)

    def _persons(self, soup) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        for el in soup.find_all(
            attrs={"itemtype": re.compile(r"Person", re.I)}
        ):
            p: Dict[str, str] = {}
            for prop in ["name", "jobTitle", "email",
                         "telephone", "url", "image"]:
                child = el.find(attrs={"itemprop": prop})
                if child:
                    p[prop] = (
                        child.get("content") or self._txt(child) or ""
                    ).strip()
            if p.get("name"):
                out.append(p)
        return out[:10]

    # ------------------------------------------------------------------
    # Dates
    # ------------------------------------------------------------------
    def _dates(self, soup) -> Dict[str, str]:
        dates: Dict[str, str] = {}
        for prop in ["datePublished", "dateModified", "dateCreated",
                     "startDate", "endDate", "validFrom", "validThrough"]:
            el = soup.find(attrs={"itemprop": prop})
            if el:
                dates[prop] = (
                    el.get("content")
                    or el.get("datetime")
                    or self._txt(el)
                    or ""
                ).strip()
        for el in soup.find_all(["time", "meta"]):
            dt   = (el.get("datetime") or el.get("content") or "").strip()
            prop = (el.get("itemprop") or "").strip()
            if dt and prop and prop not in dates:
                dates[prop] = dt
        return dates

    # ------------------------------------------------------------------
    # Business signals
    # ------------------------------------------------------------------
    def _address(self, soup) -> Dict[str, str]:
        """
        Multi-strategy address extraction.
        Strategy 1 — schema.org itemprop attributes (most reliable)
        Strategy 2 — microformat class names (vcard/adr)
        Strategy 3 — footer / contact section text scan
        Strategy 4 — raw_address fallback for Claude to parse
        """
        addr: Dict[str, str] = {}
        props = ["streetAddress", "addressLocality", "addressRegion",
                 "postalCode", "addressCountry"]

        # Strategy 1: itemprop
        for p in props:
            el = soup.find(attrs={"itemprop": p})
            if el:
                v = (el.get("content") or self._txt(el) or "").strip()
                if v:
                    addr[p] = v

        if len(addr) >= 2:
            return addr  # Good itemprop data found

        # Strategy 2: microformat class names (vcard / h-adr / adr)
        microformat_map = {
            "street-address":   "streetAddress",
            "locality":         "addressLocality",
            "region":           "addressRegion",
            "postal-code":      "postalCode",
            "country-name":     "addressCountry",
            "extended-address": "streetAddress",
        }
        for cls, prop in microformat_map.items():
            els = soup.find_all(class_=re.compile(
                r"\b" + re.escape(cls) + r"\b", re.I
            ))
            for el in els[:3]:
                v = self._txt(el)
                if v and prop not in addr:
                    addr[prop] = v

        if len(addr) >= 2:
            return addr

        # Strategy 3: scan footer / contact / address containers
        container_re = re.compile(
            r"\b(footer|contact|address|location|office|headquarters|hq)\b",
            re.I,
        )
        for container in soup.find_all(
            ["footer", "section", "div", "aside", "article"]
        ):
            attrs_str = " ".join([
                str(container.get("id") or ""),
                " ".join(container.get("class") or []),
                str(container.get("aria-label") or ""),
            ])
            if not container_re.search(attrs_str):
                continue
            # Look for <address> tag inside
            addr_tag = container.find("address")
            if addr_tag:
                raw = self._txt(addr_tag)
                if raw and len(raw) < 300:
                    addr["raw_address"] = raw
                    break
            # Look for any text that looks like an address
            for el in container.find_all(["p", "span", "div", "li"])[:10]:
                t = self._txt(el)
                # Heuristic: contains digits + common address words
                if (t and 10 < len(t) < 250
                        and re.search(r"\d", t)
                        and re.search(
                            r"\b(st|street|ave|avenue|road|rd|blvd|lane|"
                            r"ln|drive|dr|way|place|pl|suite|floor|fl|"
                            r"city|town|state|country|zip|postal|pin)\b",
                            t, re.I
                        )):
                    addr["raw_address"] = t
                    break
            if addr.get("raw_address"):
                break

        # Strategy 4: <address> tag anywhere on page
        if not addr:
            addr_tag = soup.find("address")
            if addr_tag:
                raw = self._txt(addr_tag)
                if raw and len(raw) < 300:
                    addr["raw_address"] = raw

        # Strategy 5: geo meta tags
        if "addressCountry" not in addr:
            for name_pattern in [r"geo\.region", r"geo\.country",
                                  r"geo\.placename"]:
                meta_geo = soup.find(
                    "meta", attrs={"name": re.compile(name_pattern, re.I)}
                )
                if meta_geo:
                    val = (meta_geo.get("content") or "").strip()
                    if val:
                        # geo.region is often "US-NY" format
                        if "-" in val and len(val) <= 6:
                            parts = val.split("-")
                            addr.setdefault("addressCountry", parts[0].upper())
                            addr.setdefault("addressRegion",  parts[1].upper())
                        else:
                            addr.setdefault("addressCountry", val[:50])

        # Strategy 6: OG / twitter site_name location hint
        if not addr:
            for meta in soup.find_all("meta"):
                prop = (meta.get("property") or meta.get("name") or "").lower()
                content = (meta.get("content") or "").strip()
                if "locality" in prop or "location" in prop:
                    if content:
                        addr["raw_address"] = content
                        break

        # Strategy 7: scan page text for country/city patterns using
        # common phrases like "Located in", "Based in", "Our office in"
        if not addr:
            location_re = re.compile(
                r"(?:located|based|headquartered|offices?|"
                r"serving clients?|teams?|founded)\s+in\s+"
                r"([A-Z][a-zA-Z\s,]+(?:USA?|UK|India|Canada|Australia|"
                r"Germany|France|Dubai|Singapore|[A-Z]{2})?)",
                re.IGNORECASE,
            )
            page_text = soup.get_text(" ", strip=True)[:5000]
            m = location_re.search(page_text)
            if m:
                addr["raw_address"] = m.group(1).strip()[:150]

        return addr

    def _address_context(self, soup) -> str:
        """
        Collect all address-like text from footer, contact section, and
        <address> tags into a single string for Claude to parse.
        This gives Claude raw material when itemprop/microformat is absent.
        """
        chunks: List[str] = []

        # <address> tags
        for el in soup.find_all("address")[:5]:
            t = self._txt(el)
            if t and len(t) < 400:
                chunks.append(t)

        # footer text
        for footer in soup.find_all(["footer"])[:2]:
            t = self._txt(footer)
            if t and len(t) < 800:
                chunks.append(t[:600])

        # Sections/divs with contact/address class or id
        contact_re = re.compile(
            r"\b(contact|address|location|office|headquarters|hq|"
            r"get.in.touch|reach.us|find.us)\b", re.I
        )
        for el in soup.find_all(["section", "div", "aside"])[:50]:
            attrs_str = " ".join([
                str(el.get("id") or ""),
                " ".join(el.get("class") or []),
            ])
            if contact_re.search(attrs_str):
                t = self._txt(el)
                if t and len(t) < 500:
                    chunks.append(t[:400])

        # Also capture alt text of flag images — e.g. "US flag", "India flag"
        # which are the only location indicators on some company pages
        country_hints: List[str] = []
        for img in soup.find_all("img"):
            alt = (img.get("alt") or "").strip()
            src = (img.get("src") or "").strip().lower()
            # Flag images often have country name in src or alt
            if re.search(r"flag|country|location", src, re.I) or                re.search(r"\b(flag|located|office)\b", alt, re.I):
                if alt:
                    country_hints.append(alt)
            # Also catch imgs with country names in filename
            country_re = re.compile(
                r"\b(US|USA|UK|India|Canada|Australia|Germany|"
                r"France|Dubai|Singapore|United States|United Kingdom)\b",
                re.I,
            )
            if country_re.search(src) or country_re.search(alt):
                match = country_re.search(src + " " + alt)
                if match:
                    country_hints.append(f"Office location: {match.group()}")

        if country_hints:
            chunks.extend(country_hints[:5])

        # Deduplicate and join
        seen: set = set()
        out: List[str] = []
        for c in chunks:
            key = c[:80].lower()
            if key not in seen:
                seen.add(key)
                out.append(c)

        return " | ".join(out)[:2000]

    def _phones(self, soup) -> List[str]:
        phones: List[str] = []
        for el in soup.find_all(attrs={"itemprop": "telephone"}):
            t = (el.get("content") or self._txt(el) or "").strip()
            if t:
                phones.append(t)
        for a in soup.find_all("a", href=re.compile(r"^tel:", re.I)):
            t = (a.get("href") or "").replace("tel:", "").strip()
            if t:
                phones.append(t)
        phone_re = re.compile(r"\+?[\d\s\-\(\)]{7,20}", re.M)
        for el in soup.find_all(
            class_=re.compile(r"phone|tel|contact", re.I)
        )[:5]:
            m = phone_re.search(self._txt(el))
            if m:
                phones.append(m.group().strip())
        return list(dict.fromkeys(phones))[:5]

    def _emails(self, soup) -> List[str]:
        emails: List[str] = []
        for a in soup.find_all("a", href=re.compile(r"^mailto:", re.I)):
            e = (a.get("href") or "").replace("mailto:", "").split("?")[0].strip()
            if e:
                emails.append(e)
        email_re = re.compile(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
        )
        for el in soup.find_all(
            class_=re.compile(r"email|contact|mail", re.I)
        )[:5]:
            m = email_re.search(self._txt(el))
            if m:
                emails.append(m.group())
        return list(dict.fromkeys(emails))[:5]

    def _hours(self, soup) -> List[str]:
        hours: List[str] = []
        for el in soup.find_all(attrs={"itemprop": "openingHours"}):
            t = (el.get("content") or self._txt(el) or "").strip()
            if t:
                hours.append(t)
        for el in soup.find_all(
            class_=re.compile(r"hours?|opening|schedule|timetable", re.I)
        )[:5]:
            t = self._txt(el)
            if t and len(t) < 300:
                hours.append(t)
        return hours[:10]

    def _social(self, soup) -> List[str]:
        social_re = re.compile(
            r"(facebook\.com|twitter\.com|x\.com|instagram\.com|"
            r"linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|"
            r"snapchat\.com|reddit\.com|github\.com|medium\.com)",
            re.I,
        )
        links: List[str] = []
        for a in soup.find_all("a", href=social_re):
            href = (a.get("href") or "").strip()
            if href:
                links.append(href)
        return list(dict.fromkeys(links))[:15]

    # ------------------------------------------------------------------
    # Vertical signal extractors
    # ------------------------------------------------------------------
    def _event_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        for p in ["name", "startDate", "endDate", "location", "description",
                  "url", "organizer", "performer", "eventStatus",
                  "eventAttendanceMode", "offers"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                sig[p] = (
                    el.get("content") or el.get("datetime") or self._txt(el) or ""
                ).strip()
        return sig

    def _job_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        for p in ["title", "datePosted", "validThrough", "description",
                  "jobLocation", "baseSalary", "employmentType",
                  "hiringOrganization", "identifier", "directApply"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                sig[p] = (el.get("content") or self._txt(el) or "").strip()
        return sig

    def _recipe_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        for p in ["name", "description", "image", "author", "prepTime",
                  "cookTime", "totalTime", "recipeYield", "recipeCategory",
                  "recipeCuisine", "recipeInstructions", "nutrition", "keywords"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                sig[p] = (el.get("content") or self._txt(el) or "").strip()
        ings = [
            self._txt(i)
            for i in soup.find_all(attrs={"itemprop": "recipeIngredient"})
        ]
        if ings:
            sig["recipeIngredient"] = ings[:50]
        return sig

    def _app_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        for p in ["name", "description", "operatingSystem",
                  "applicationCategory", "offers", "screenshot",
                  "softwareVersion", "downloadUrl", "author"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                sig[p] = (el.get("content") or self._txt(el) or "").strip()
        store_re = re.compile(
            r"apps\.apple|play\.google|microsoft\.com/store", re.I
        )
        for a in soup.find_all("a", href=store_re)[:3]:
            sig["store_link"] = (a.get("href") or "").strip()
        return sig

    def _course_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        for p in ["name", "description", "provider", "instructor",
                  "timeRequired", "educationalLevel", "teaches",
                  "courseMode", "offers", "hasCourseInstance"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                sig[p] = (el.get("content") or self._txt(el) or "").strip()
        return sig

    def _medical_signals(self, soup) -> Dict[str, Any]:
        sig: Dict[str, Any] = {}
        for p in ["name", "description", "alternateName", "code",
                  "possibleTreatment", "symptom", "drug",
                  "dosageSchedule", "activeIngredient"]:
            el = soup.find(attrs={"itemprop": p})
            if el:
                sig[p] = (el.get("content") or self._txt(el) or "").strip()
        return sig

    def _review_signals(self, soup) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for node in soup.find_all(
            attrs={"itemtype": re.compile(r"Review", re.I)}
        )[:10]:
            r: Dict[str, Any] = {}
            for p in ["author", "datePublished", "reviewBody",
                      "name", "reviewRating"]:
                el = node.find(attrs={"itemprop": p})
                if el:
                    r[p] = (el.get("content") or self._txt(el) or "").strip()
            if r:
                out.append(r)
        return out

    # ==================================================================
    # PAGE TYPE DETECTION
    # ==================================================================

    def _url_to_type(self, path: str) -> str:
        p = (path or "").lower()
        for pattern, stype in [
            (r"/product[s/]",               "Product"),
            (r"/shop|/store|/buy|/cart",     "Product"),
            (r"/blog|/post|/article|/news",  "Article"),
            (r"/faq|/help|/support",         "FAQPage"),
            (r"/about|/team|/company",       "Organization"),
            (r"/contact|/location",          "LocalBusiness"),
            (r"/job[s/]|/career[s/]|/hiring","JobPosting"),
            (r"/event[s/]|/conference",      "Event"),
            (r"/recipe[s/]|/food|/cook",     "Recipe"),
            (r"/course[s/]|/learn|/class",   "Course"),
            (r"/app|/software|/download",    "SoftwareApplication"),
            (r"/person|/author|/profile",    "Person"),
            (r"/review|/testimonial",        "Review"),
            (r"/how-to|/guide|/tutorial",    "HowTo"),
            (r"/video|/watch|/media",        "VideoObject"),
            (r"/podcast",                    "Podcast"),
            (r"/book[s/]",                   "Book"),
            (r"/movie[s/]|/film[s/]",        "Movie"),
            (r"/drug[s/]|/medication|/medicine","Drug"),
            (r"/condition[s/]|/symptom[s/]", "MedicalCondition"),
        ]:
            if re.search(pattern, p):
                return stype
        return "WebPage"

    def _detect_page_signals(
        self, page_data: Dict[str, Any], requested: str
    ) -> List[str]:
        if requested and requested.lower() != "auto":
            return [requested]

        scores: Dict[str, int] = {}

        def bump(t: str, n: int = 1) -> None:
            scores[t] = scores.get(t, 0) + n

        bump("WebPage", 5)
        bump("WebSite", 3)

        url_type = page_data.get("detected_page_type", "")
        if url_type and url_type != "WebPage":
            bump(url_type, 10)

        if page_data.get("breadcrumbs"):
            bump("BreadcrumbList", 8)

        faq = page_data.get("faq_pairs") or []
        if len(faq) >= 2:
            bump("FAQPage", 12)

        steps = page_data.get("howto_steps") or []
        if len(steps) >= 3:
            bump("HowTo", 10)

        prod = page_data.get("product_signals") or {}
        prices = page_data.get("prices") or []
        if prices or prod.get("sku") or prod.get("brand"):
            bump("Product", 10)
        if prices:
            bump("Offer", 6)
        if page_data.get("offers"):
            bump("Offer", 5)

        if page_data.get("ratings"):
            bump("AggregateRating", 7)
        if page_data.get("review_signals"):
            bump("Review", 7)

        if page_data.get("authors"):
            bump("Article", 8)
            bump("BlogPosting", 6)
        if (page_data.get("dates") or {}).get("datePublished"):
            bump("Article", 5)
            bump("BlogPosting", 5)

        rs = page_data.get("recipe_signals") or {}
        if rs.get("recipeIngredient") or rs.get("cookTime"):
            bump("Recipe", 15)

        es = page_data.get("event_signals") or {}
        if es.get("startDate") or es.get("name"):
            bump("Event", 10)

        js = page_data.get("job_signals") or {}
        if js.get("title") or js.get("hiringOrganization"):
            bump("JobPosting", 12)

        apps = page_data.get("app_signals") or {}
        if apps.get("operatingSystem") or apps.get("store_link"):
            bump("SoftwareApplication", 10)

        cs = page_data.get("course_signals") or {}
        if cs.get("provider") or cs.get("teaches"):
            bump("Course", 10)

        ms = page_data.get("medical_signals") or {}
        if ms.get("symptom") or ms.get("drug"):
            bump("MedicalCondition", 10)

        addr = page_data.get("address_signals") or {}
        phones = page_data.get("phone_signals") or []
        hours = page_data.get("hours_signals") or []
        if addr or phones or hours:
            bump("LocalBusiness", 8)
            bump("Organization", 5)
        else:
            bump("Organization", 3)

        if page_data.get("persons"):
            bump("Person", 8)
        if page_data.get("videos"):
            bump("VideoObject", 6)
        if page_data.get("social_links"):
            bump("Organization", 4)

        return sorted(
            [t for t, s in scores.items() if s >= 3],
            key=lambda t: scores[t],
            reverse=True,
        )[:12]

    # ==================================================================
    # CANONICAL TEMPLATE FILLING
    # ==================================================================

    def _has_address_data(self, page_data: Dict[str, Any]) -> bool:
        """
        Returns True if there is ANY address-like data in the page signals.
        Used to decide whether to include the address block in the template.
        """
        addr = page_data.get("address_signals") or {}
        # Has real parsed fields
        real_fields = {k: v for k, v in addr.items()
                       if k != "@type" and v and str(v).strip()}
        if real_fields:
            return True
        # Has raw_address string to parse
        if addr.get("raw_address", "").strip():
            return True
        # Has address_context text
        ctx = (page_data.get("address_context") or "").strip()
        if len(ctx) > 15:
            return True
        return False

    def _template_fill_with_claude(
        self,
        schema_type: str,
        page_data: Dict[str, Any],
        url: str,
    ) -> Dict[str, Any]:
        """
        Uses the exact canonical template for the given schema_type.
        Sends the template + extracted page data to Claude and instructs it
        to fill ONLY the empty-string "" fields — structure never changes.

        Supported canonical types:
            Organization, OrganizationLogo, LocalBusiness, Person, Product

        Smart pre-processing:
        - Removes address block from template if NO address data found
          (prevents Claude from outputting an empty PostalAddress)
        - Injects location hints from OG/meta/social into page_data context
        """
        import copy
        template = copy.deepcopy(CANONICAL_TEMPLATES[schema_type])

        # Pre-fill url where template has it
        if "url" in template:
            template["url"] = url or ""

        # ── Smart address pre-check ───────────────────────────────────
        # If template has an address block but page has NO address data,
        # remove it so Claude doesn't produce an empty PostalAddress stub.
        if "address" in template and not self._has_address_data(page_data):
            del template["address"]
            logging.info(
                f"[SCHEMA] No address data found for {url} — "
                f"address block removed from {schema_type} template"
            )

        content_sample, _ = self._trim_page_data(page_data, 60_000)
        template_json = json.dumps(template, indent=2, ensure_ascii=False)

        # ── Type-specific extra instructions injected into the prompt ──
        type_hints: Dict[str, str] = {
            "Organization": (
                "address: IMPORTANT — extract PostalAddress from address_signals.\n"
                "  - If address_signals has streetAddress/addressLocality etc, use them.\n"
                "  - If address_signals has raw_address, parse it into sub-fields.\n"
                "  - Search paragraphs/footer text for city, state, country, zip.\n"
                "  - If ONLY country is known, fill addressCountry, leave rest \"\".\n"
                "sameAs: fill up to 5 slots with social/profile URLs; leave rest as \"\".\n"
                "logo: use logo/image URL from og_data[image] or images[0].\n"
                "legalName: legal registered company name if available.\n"
            ),
            "OrganizationLogo": (
                "url: canonical homepage URL.\n"
                "logo: absolute URL of the organisation logo image.\n"
            ),
            "LocalBusiness": (
                "address: IMPORTANT — extract PostalAddress from address_signals.\n"
                "  - If address_signals has streetAddress/addressLocality etc, use them.\n"
                "  - If address_signals has raw_address, parse it into PostalAddress fields.\n"
                "  - Search paragraphs, footer, contact sections for address text.\n"
                "  - If ONLY country is known, fill addressCountry, leave rest \"\".\n"
                "telephone: use phone_signals[0] if available.\n"
                "email: use email_signals[0] if available.\n"
                "logo: use logo/image URL from og_data[image] or images[0].\n"
                "legalName: legal registered company name if available.\n"
            ),
            "Person": (
                "sameAs: fill up to 5 slots with social/profile URLs; leave rest as \"\".\n"
                "image: absolute URL of person photo.\n"
                "description: short bio or about text.\n"
            ),
            "Product": (
                "image: fill the 3 image slots with product image URLs (absolute);\n"
                "  if fewer than 3 images, fill what you have, leave rest as \"\".\n"
                "sku: product SKU, model number, or identifier.\n"
                "brand.name: manufacturer or brand name.\n"
                "review.reviewRating.ratingValue: numeric rating e.g. 4.5.\n"
                "review.reviewRating.bestRating: max rating scale e.g. 5.\n"
                "review.author.name: reviewer full name.\n"
                "offers.url: direct product page URL.\n"
                "offers.priceCurrency: ISO 4217 code e.g. USD, GBP, INR.\n"
                "offers.price: numeric price without currency symbol.\n"
                "offers.priceValidUntil: ISO 8601 date YYYY-MM-DD or leave \"\".\n"
            ),
        }

        extra = type_hints.get(schema_type, "")

        system_prompt = (
            "You are a Schema.org structured-data expert.\n"
            "You will receive a JSON template and page data.\n"
            "Your job: fill every empty string \"\" in the template with the best "
            "matching value from the page data.\n\n"
            "STRICT RULES:\n"
            "1. Output ONLY raw valid JSON - no markdown fences, no prose, no comments.\n"
            "2. Keep ALL keys exactly as given - NEVER add or remove any key.\n"
            "3. NEVER invent values - use only data present in the page.\n"
            "4. If a value is not found, leave the field as empty string \"\".\n"
            "5. Preserve ALL nested objects (@type, sub-keys) exactly as in template.\n"
            "6. All URL fields must be full absolute URLs (https://...).\n"
            "7. Output the COMPLETE template - every single key must appear.\n"
            + extra
        )

        user_prompt = (
            "Fill the following JSON template using the page data below.\n\n"
            "TEMPLATE (fill \"\" fields only - keep ALL keys):\n"
            + template_json
            + "\n\nPAGE DATA:\n"
            + content_sample
        )

        try:
            raw    = self._call_claude(system_prompt, user_prompt)
            filled = self._safe_parse_json(raw)
            # Merge: template structure is authoritative, Claude supplies values
            result = self._merge_template(template, filled)
            clean  = self._clean_empty_fields(result)
            logging.info(
                f"[SCHEMA] Template filled: {schema_type} | url={url}"
            )
            return {
                "success":     True,
                "schema":      clean,
                "type":        schema_type,
                "schema_text": json.dumps(clean, indent=2, ensure_ascii=False),
                "rdfa_markup": "",
            }
        except Exception as exc:
            logging.error(f"Template fill failed [{schema_type}]: {exc}")
            return self._err(f"Template fill failed for {schema_type}", str(exc))

    def _merge_template(self, template: Any, filled: Any) -> Any:
        """
        Recursively merge Claude's filled values into the canonical template.

        Rules:
        - Dict  → template keys are authoritative; Claude provides leaf values
        - List  → merge positionally; append any extra real values Claude found
        - ""    → replaced by Claude's string/number if non-empty; else stays ""
        - Other → template's own value wins (e.g. "@type", "@id" constants)
        """
        # ── Dict: recurse key-by-key ──────────────────────────────────
        if isinstance(template, dict):
            src = filled if isinstance(filled, dict) else {}
            return {
                k: self._merge_template(tv, src.get(k))
                for k, tv in template.items()
            }

        # ── List of "" slots (sameAs / image array) ───────────────────
        if isinstance(template, list):
            src_list = filled if isinstance(filled, list) else (
                # Claude sometimes returns a single string instead of list
                [filled] if isinstance(filled, str) and filled.strip() else []
            )
            result: List[Any] = []
            for i, tv in enumerate(template):
                cv = src_list[i] if i < len(src_list) else None
                result.append(self._merge_template(tv, cv))

            # Append any EXTRA real values Claude found beyond the template slots
            # (e.g. site has 6 social links but template only has 5 sameAs slots)
            if len(src_list) > len(template):
                for extra in src_list[len(template):]:
                    if isinstance(extra, str) and extra.strip():
                        result.append(extra.strip())
            return result

        # ── Leaf "" slot: replace with Claude's value ─────────────────
        if template == "":
            if isinstance(filled, str) and filled.strip():
                return filled.strip()
            # Numeric price / ratingValue → keep as string for JSON-LD
            if isinstance(filled, (int, float)):
                # Preserve decimal for floats (4.5 not 4)
                return str(filled) if filled == int(filled) else str(filled)
            # Claude returned a list for a single "" (e.g. gave multiple logos)
            if isinstance(filled, list):
                non_empty = [
                    str(v).strip() for v in filled
                    if str(v).strip()
                ]
                return non_empty[0] if non_empty else ""
            return ""

        # ── Non-empty template constant (@type, @id etc.) — keep as-is ─
        return template

    # ==================================================================
    # PROMPT BUILDING
    # ==================================================================

    def _build_system_prompt(self) -> str:
        return (
            "You are a world-class Schema.org structured-data expert with mastery of "
            "Google Rich Results guidelines, Schema.org spec v24+, and global SEO.\n\n"
            "Your job: analyse the provided page data and output the richest, most "
            "accurate JSON-LD possible for this page.\n\n"
            "ABSOLUTE RULES:\n"
            "1. Output ONLY raw valid JSON — no markdown fences, no prose, no comments.\n"
            "2. NEVER invent or hallucinate values — only use data from the page.\n"
            "3. Omit fields with no data — no empty strings, no null values in output.\n"
            "4. Always: \"@context\": \"https://schema.org\"\n"
            "5. Always wrap all schema nodes in a single @graph array.\n"
            "6. Use the MOST SPECIFIC type available "
            "(BlogPosting > Article, ProfessionalService > LocalBusiness).\n"
            "7. Populate as many valid properties as the data allows.\n"
            "8. All url/image/@id fields must be full absolute URLs.\n"
            "9. Dates must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ).\n"
            "10. FAQPage: include ALL question/answer pairs from faq_pairs.\n"
            "11. address: ALWAYS fill PostalAddress — check address_signals,\n"
            "    address_context, phone_signals, email_signals, footer text,\n"
            "    og_data and paragraphs. Even partial addresses are valuable.\n"
            "12. If raw_address exists in address_signals, parse it into\n"
            "    streetAddress / addressLocality / addressRegion /\n"
            "    postalCode / addressCountry sub-fields.\n"
        )

    def _build_user_prompt(
        self,
        url: str,
        content_sample: str,
        detected_types: List[str],
        schema_type: str,
        is_auto: bool,
    ) -> str:

        all_types = ", ".join(ALL_SCHEMA_TYPES_FLAT)

        if not is_auto and schema_type:
            type_block = (
                f"## REQUESTED TYPE: {schema_type}\n"
                f"Generate ONLY `{schema_type}`. "
                f"Do not add other types to @graph.\n"
            )
        else:
            type_block = (
                f"## DETECTED TYPES (by confidence):\n"
                f"{', '.join(detected_types)}\n\n"
                "Generate ALL types from the list above that genuinely apply.\n"
                "Use every available signal to make each schema as rich as possible.\n"
            )

        return f"""Analyse the page data and generate the best Schema.org JSON-LD.

## ALL SUPPORTED TYPES:
{all_types}

{type_block}

## OUTPUT FORMAT:
{{
  "@context": "https://schema.org",
  "@graph": [ ...all nodes here... ]
}}

## PROPERTY GUIDELINES BY TYPE:

FAQPage → mainEntity array using ALL entries from faq_pairs:
  {{"@type":"Question","name":"...","acceptedAnswer":{{"@type":"Answer","text":"..."}}}}

BreadcrumbList → itemListElement from breadcrumbs, position starts at 1

Product → name, description, image, brand (Brand), sku, offers (Offer with
  price, priceCurrency, availability URL, url), aggregateRating if available

Article / BlogPosting / NewsArticle → headline, description, image (ImageObject),
  author (@type:Person, name, url), publisher (@type:Organization, name, logo as
  ImageObject), datePublished, dateModified, mainEntityOfPage (WebPage @id=url)

Organization / LocalBusiness → name, url, logo, description, address (PostalAddress
  with streetAddress, addressLocality, addressRegion, postalCode, addressCountry),
  telephone, email, openingHours, geo (GeoCoordinates), priceRange, sameAs array

Event → name, description, startDate, endDate, eventStatus (schema.org/EventScheduled),
  eventAttendanceMode, location (Place with address PostalAddress), organizer
  (Organization), performer, offers (Offer)

Recipe → name, description, image, author (Person), prepTime / cookTime / totalTime
  (ISO 8601 PT format e.g. PT30M), recipeYield, recipeIngredient (array),
  recipeInstructions (array of HowToStep with @type, name, text, url),
  aggregateRating, nutrition (NutritionInformation)

HowTo → name, description, totalTime, supply (array of HowToSupply),
  tool (array of HowToTool), estimatedCost (MonetaryAmount),
  step (array of HowToStep with name, text, image, url)

JobPosting → title, description, datePosted, validThrough, employmentType,
  hiringOrganization (Organization), jobLocation (Place), baseSalary
  (MonetaryAmount with currency + value), identifier

Course → name, description, provider (Organization), instructor (Person),
  hasCourseInstance (CourseInstance with courseMode, startDate, endDate),
  educationalLevel, teaches, offers

SoftwareApplication / MobileApplication → name, description, operatingSystem,
  applicationCategory, offers (Offer), softwareVersion, downloadUrl,
  screenshot (ImageObject), author (Organization)

VideoObject → name, description, thumbnailUrl (array), uploadDate,
  duration (ISO 8601 PT format), contentUrl, embedUrl

Person → name, jobTitle, description, image (ImageObject), worksFor
  (Organization), email, telephone, sameAs (array of profile URLs)

Review → itemReviewed, author (Person), datePublished, reviewRating (Rating
  with ratingValue and bestRating), reviewBody

AggregateRating → ratingValue, bestRating, worstRating, reviewCount,
  ratingCount, itemReviewed

MedicalCondition → name, description, alternateName, code (MedicalCode),
  symptom (array), possibleTreatment (array), drug (array)

Drug → name, description, activeIngredient, dosageSchedule,
  administrationRoute, prescriptionStatus, legalStatus

## PAGE URL: {url}

## PAGE DATA:
{content_sample}
"""

    # ==================================================================
    # CLAUDE API CALL
    # ==================================================================

    def _call_claude(self, system_prompt: str, user_prompt: str) -> str:
        message = self.client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return "".join(
            block.text for block in message.content if hasattr(block, "text")
        )

    # ==================================================================
    # POST-PROCESSING
    # ==================================================================

    def _safe_parse_json(self, raw: str) -> Dict[str, Any]:
        raw = (raw or "").strip()
        if not raw:
            raise ValueError("Empty Claude response")
        # Strip markdown fences
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I).strip()
        raw = re.sub(r"\s*```\s*$", "", raw).strip()
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        s, e = raw.find("{"), raw.rfind("}")
        if s != -1 and e > s:
            try:
                obj = json.loads(raw[s: e + 1])
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                pass
        raise ValueError(f"Cannot parse JSON: {raw[:200]}")

    def _faq_to_main_entity(
        self, pairs: List[Dict[str, str]]
    ) -> List[Dict[str, Any]]:
        return [
            {
                "@type": "Question",
                "name":  (p.get("question") or "").strip(),
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text":  (p.get("answer") or "").strip(),
                },
            }
            for p in pairs
            if (p.get("question") or "").strip()
            and (p.get("answer") or "").strip()
        ][:25]

    def _inject_faq(
        self,
        schema: Dict[str, Any],
        pairs: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        if not pairs or not isinstance(schema, dict):
            return schema
        me = self._faq_to_main_entity(pairs)
        if not me:
            return schema

        def _try_fill(node: Dict[str, Any]) -> None:
            if node.get("@type") == "FAQPage" and "mainEntity" not in node:
                node["mainEntity"] = me

        if schema.get("@type") == "FAQPage":
            _try_fill(schema)
        for node in (schema.get("@graph") or []):
            if isinstance(node, dict):
                _try_fill(node)
        return schema

    def _ensure_graph(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(schema, dict):
            return schema
        if isinstance(schema.get("@graph"), list):
            schema.setdefault("@context", "https://schema.org")
            return schema
        ctx = schema.pop("@context", "https://schema.org")
        return {"@context": ctx, "@graph": [schema]}

    # Types where a @type-only node is still meaningful (root/wrapper nodes)
    _KEEP_TYPE_ONLY = frozenset({
        "Organization", "LocalBusiness", "ProfessionalService",
        "Person", "Product", "WebPage", "WebSite",
        "Article", "BlogPosting", "Event", "Course",
    })

    def _clean_empty_fields(self, obj: Any, _parent_key: str = "") -> Any:
        """
        Recursively strip empty strings, empty lists, and empty dicts.

        Rules for dicts with @type:
        - Root-level schema nodes (Organization, Product etc.) — always kept
        - Nested helper nodes (PostalAddress, Brand, Offer, Rating etc.)
          are STRIPPED if they have only @type and no real sub-fields,
          because an empty PostalAddress is worse than no address at all.

        This means:
          {"@type": "PostalAddress"}              → stripped (useless)
          {"@type": "PostalAddress", "addressCountry": "US"} → kept
          {"@type": "Brand", "name": "Acme"}      → kept
          {"@type": "Brand"}                       → stripped
        """
        if isinstance(obj, dict):
            cleaned = {}
            for k, v in obj.items():
                cv = self._clean_empty_fields(v, _parent_key=k)
                # Always keep structural JSON-LD keys
                if k in ("@context", "@id", "@graph"):
                    cleaned[k] = cv
                    continue
                if k == "@type":
                    cleaned[k] = cv
                    continue
                if cv is None or cv == "" or cv == [] or cv == {}:
                    continue
                cleaned[k] = cv

            if not cleaned:
                return {}

            # Dict has only @type — decide whether to keep or strip
            if len(cleaned) == 1 and "@type" in cleaned:
                schema_type = str(cleaned.get("@type", ""))
                # Keep root-level nodes, strip empty helper nodes
                if schema_type in self._KEEP_TYPE_ONLY:
                    return cleaned
                # Strip empty nested helpers: PostalAddress, Brand,
                # Rating, Offer, ImageObject, etc.
                return {}

            return cleaned

        if isinstance(obj, list):
            items = [self._clean_empty_fields(i) for i in obj]
            return [
                i for i in items
                if i is not None and i != "" and i != [] and i != {}
            ]
        return obj

    def _primary_type(self, schema: Dict[str, Any]) -> str:
        if not isinstance(schema, dict):
            return "Unknown"
        t = schema.get("@type")
        if isinstance(t, str):
            return t
        for node in (schema.get("@graph") or []):
            if isinstance(node, dict):
                ft = node.get("@type")
                if isinstance(ft, str):
                    return ft
        return "Unknown"

    # ==================================================================
    # FAST-PATH RESULTS
    # ==================================================================

    def _fast_faqpage(
        self,
        pairs: List[Dict[str, str]],
        url: str,
        page_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        schema: Dict[str, Any] = {
            "@context":  "https://schema.org",
            "@type":     "FAQPage",
            "url":       url,
            "mainEntity": self._faq_to_main_entity(pairs),
        }
        title = (page_data.get("title") or "").strip()
        if title:
            schema["name"] = title
        return {
            "success":     True,
            "schema":      schema,
            "type":        "FAQPage",
            "schema_text": json.dumps(schema, indent=2, ensure_ascii=False),
            "rdfa_markup": "",
        }

    def _fast_breadcrumb(
        self, page_data: Dict[str, Any], url: str
    ) -> Dict[str, Any]:
        crumbs: List[Dict[str, str]] = page_data.get("breadcrumbs") or []
        items: List[Dict[str, Any]] = []
        for i, c in enumerate(crumbs[:20], 1):
            name = (c.get("name") or "").strip()
            href = (c.get("url") or "").strip()
            if name:
                entry: Dict[str, Any] = {
                    "@type":    "ListItem",
                    "position": i,
                    "name":     name,
                }
                if href:
                    entry["item"] = href
                items.append(entry)
        schema = {
            "@context":        "https://schema.org",
            "@type":           "BreadcrumbList",
            "itemListElement": items,
        }
        return {
            "success":     True,
            "schema":      schema,
            "type":        "BreadcrumbList",
            "schema_text": json.dumps(schema, indent=2, ensure_ascii=False),
            "rdfa_markup": "",
        }

    # ==================================================================
    # UTILITIES
    # ==================================================================

    def _txt(self, el) -> str:
        if el is None:
            return ""
        try:
            return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()
        except Exception:
            return ""

    def _dd_list(self, items: List[str], n: int = 100) -> List[str]:
        seen: set = set()
        out: List[str] = []
        for x in items:
            x = (x or "").strip()
            if x and x not in seen:
                seen.add(x)
                out.append(x)
            if len(out) >= n:
                break
        return out

    def _dd_by(
        self, key: str, items: List[Dict[str, Any]], n: int = 50
    ) -> List[Dict[str, Any]]:
        seen: set = set()
        out: List[Dict[str, Any]] = []
        for item in items:
            v = str(item.get(key) or "").strip()
            if v and v not in seen:
                seen.add(v)
                out.append(item)
            if len(out) >= n:
                break
        return out

    def _trim_page_data(
        self, data: Dict[str, Any], max_chars: int
    ) -> Tuple[str, Dict[str, Any]]:
        d = dict(data)

        def _dump() -> str:
            return json.dumps(d, ensure_ascii=False, indent=2)

        if len(_dump()) <= max_chars:
            return _dump(), d

        trim_plan = [
            ("links",           40), ("links",           15),
            ("images",          15), ("images",           5),
            ("paragraphs",      60), ("paragraphs",      25),
            ("headings",        40), ("headings",        15),
            ("nav_links",       20), ("nav_links",        5),
            ("lists",           10), ("lists",            3),
            ("existing_json_ld", 2), ("existing_json_ld", 1),
            ("microdata",        2), ("microdata",        1),
            ("review_signals",   3), ("review_signals",   1),
        ]
        for key, n in trim_plan:
            if isinstance(d.get(key), list):
                d[key] = d[key][:n]
            if len(_dump()) <= max_chars:
                return _dump(), d

        s = _dump()
        return s[:max_chars], d

    def _regex_clean(self, html: str) -> str:
        h = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
        h = re.sub(r"<style[\s\S]*?</style>",   "", h,    flags=re.I)
        h = re.sub(r"<[^>]+>", " ", h)
        return re.sub(r"\s+", " ", h).strip()

    @staticmethod
    def _err(error: str, message: str) -> Dict[str, Any]:
        return {
            "success": False,
            "error":   error,
            "message": message,
            "schema":  None,
        }