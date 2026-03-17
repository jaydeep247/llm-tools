"""
Schema.org Markup Generator Service
Uses OpenAI GPT to generate appropriate schema markup for web pages
"""

import os
import json
import logging
import re
import hashlib
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logging.warning("OpenAI not available for schema generation")

try:
    from bs4 import BeautifulSoup
except Exception:
    BeautifulSoup = None


class SchemaGenerator:
    """Generate Schema.org markup using AI analysis"""
    GENERATOR_VERSION = "2026-03-17-graph-faq"
    
    def __init__(self):
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.client = None
        
        if OPENAI_AVAILABLE and self.api_key:
            try:
                self.client = OpenAI(api_key=self.api_key)
                logging.info("Schema Generator initialized with OpenAI")
            except Exception as e:
                logging.error(f"Failed to initialize OpenAI client: {e}")
    
    # --- OUR ADDED CODE START: Helper to save tokens ---
    def _clean_html(self, html_content: str) -> str:
        """
        Helper to clean HTML before sending to AI. 
        Removes scripts, styles, and extra whitespace to save tokens/cost.
        """
        if not html_content:
            return ""

        if BeautifulSoup is not None:
            try:
                soup = BeautifulSoup(html_content, "html.parser")
                for tag in soup(["script", "style", "noscript"]):
                    tag.decompose()

                parts = []
                for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd", "summary", "button"]):
                    text = el.get_text(" ", strip=True)
                    if text:
                        text = re.sub(r"\s+", " ", text).strip()
                        parts.append(text)

                if not parts:
                    text = soup.get_text(separator=" ", strip=True)
                    return re.sub(r"\s+", " ", text).strip()

                deduped_parts = []
                last = None
                for p in parts:
                    if p != last:
                        deduped_parts.append(p)
                    last = p
                return "\n".join(deduped_parts).strip()
            except Exception:
                pass

        cleaned = re.sub(r"<script[\s\S]*?</script>", "", html_content, flags=re.IGNORECASE)
        cleaned = re.sub(r"<style[\s\S]*?</style>", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<noscript[\s\S]*?</noscript>", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        return re.sub(r"\s+", " ", cleaned).strip()
    # --- OUR ADDED CODE END ---

    def _safe_get_text(self, el) -> str:
        try:
            text = el.get_text(" ", strip=True)
            return re.sub(r"\s+", " ", text).strip()
        except Exception:
            return ""

    def _dedupe_keep_order(self, items: List[str], max_items: Optional[int] = None) -> List[str]:
        out: List[str] = []
        seen = set()
        for x in items:
            x = (x or "").strip()
            if not x or x in seen:
                continue
            out.append(x)
            seen.add(x)
            if max_items is not None and len(out) >= max_items:
                break
        return out

    def _schema_description(self, schema_type: str) -> str:
        mapping = {
            "Organization": "company or brand information",
            "LocalBusiness": "physical store or local business",
            "WebPage": "generic webpage",
            "Article": "news article or editorial content",
            "BlogPosting": "blog article",
            "Product": "product sold online",
            "Service": "service offered by a business",
            "FAQPage": "frequently asked questions",
            "BreadcrumbList": "website navigation breadcrumbs",
            "Person": "person profile",
            "Event": "event or conference",
            "Recipe": "food recipe page",
            "HowTo": "step-by-step guide",
            "VideoObject": "video content",
            "ImageObject": "image media content",
            "Course": "educational course",
            "JobPosting": "job listing",
            "Review": "review or rating content",
        }

        return mapping.get((schema_type or "").strip(), "")

    def _extract_existing_json_ld(self, soup) -> List[Any]:
        out: List[Any] = []
        for tag in soup.find_all("script", attrs={"type": re.compile(r"application/ld\+json", re.I)}):
            raw = (tag.string or tag.get_text() or "").strip()
            if not raw:
                continue
            try:
                out.append(json.loads(raw))
            except Exception:
                out.append(raw[:5000])
            if len(out) >= 5:
                break
        return out

    def _extract_breadcrumbs(self, soup) -> List[Dict[str, str]]:
        breadcrumbs: List[Dict[str, str]] = []
        candidates = []
        for nav in soup.find_all(["nav", "ol", "ul"]):
            attrs = " ".join([str(nav.get("aria-label") or ""), str(nav.get("class") or ""), str(nav.get("id") or "")]).lower()
            if "breadcrumb" in attrs:
                candidates.append(nav)
        for root in candidates[:3]:
            for a in root.find_all("a"):
                name = self._safe_get_text(a)
                href = (a.get("href") or "").strip()
                if not name:
                    continue
                breadcrumbs.append({"name": name, "url": href})
                if len(breadcrumbs) >= 20:
                    return breadcrumbs
        return breadcrumbs

    def _extract_prices(self, soup) -> List[str]:
        prices: List[str] = []
        for meta in soup.find_all("meta"):
            prop = (meta.get("property") or meta.get("name") or "").lower()
            if "price" in prop or "product:price" in prop:
                val = (meta.get("content") or "").strip()
                if val:
                    prices.append(val)
        for el in soup.find_all(attrs={"itemprop": re.compile(r"price", re.I)}):
            val = (el.get("content") or self._safe_get_text(el) or "").strip()
            if val:
                prices.append(val)
        return self._dedupe_keep_order(prices, max_items=20)

    def _extract_meta(self, soup) -> Dict[str, str]:
        meta: Dict[str, str] = {}
        for m in soup.find_all("meta"):
            key = (m.get("name") or m.get("property") or "").strip()
            if not key:
                continue
            content = (m.get("content") or "").strip()
            if not content:
                continue
            lk = key.lower()
            if lk in {"description", "robots"} or lk.startswith("og:") or lk.startswith("twitter:") or "product" in lk:
                if key not in meta:
                    meta[key] = content
            if len(meta) >= 60:
                break
        return meta

    def _extract_microdata_items(self, soup) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for node in soup.find_all(attrs={"itemscope": True}):
            itemtype = (node.get("itemtype") or "").strip()
            if "schema.org" not in itemtype:
                continue
            props: Dict[str, str] = {}
            for prop_node in node.find_all(attrs={"itemprop": True}):
                prop = (prop_node.get("itemprop") or "").strip()
                if not prop:
                    continue
                val = (prop_node.get("content") or self._safe_get_text(prop_node) or "").strip()
                if not val:
                    continue
                if prop not in props:
                    props[prop] = val
                if len(props) >= 25:
                    break
            items.append({"itemtype": itemtype, "properties": props})
            if len(items) >= 5:
                break
        return items

    def _extract_faq_pairs(self, soup) -> List[Dict[str, str]]:
        faq: List[Dict[str, str]] = []

        def _norm_q(q: str) -> str:
            q = (q or "").strip()
            q = re.sub(r"^\s*(question|q)\s*\d*\s*[:.\-]\s*", "", q, flags=re.I)
            return re.sub(r"\s+", " ", q).strip()

        def _add_pair(question: str, answer: str) -> None:
            question = _norm_q(question)
            answer = re.sub(r"\s+", " ", (answer or "").strip())
            if not question or not answer:
                return
            faq.append({"question": question, "answer": answer[:800]})

        for li in soup.find_all("li"):
            strong = li.find(["strong", "b"])
            if not strong:
                continue
            q_text = self._safe_get_text(strong)
            if "?" not in q_text:
                continue
            p = li.find("p")
            if p:
                _add_pair(q_text, self._safe_get_text(p))
            if len(faq) >= 20:
                return faq[:20]

        for details in soup.find_all("details"):
            summary = details.find("summary")
            if not summary:
                continue
            q_text = self._safe_get_text(summary)
            if "?" not in q_text:
                continue
            summary.extract()
            a_text = self._safe_get_text(details)
            _add_pair(q_text, a_text)
            if len(faq) >= 20:
                return faq[:20]

        for q in soup.find_all(["h2", "h3", "h4"]):
            question = self._safe_get_text(q)
            if "?" not in question:
                continue

            answer = ""
            for sibling in q.next_siblings:
                name = getattr(sibling, "name", None)
                if name is None:
                    continue
                if name in {"h2", "h3", "h4"}:
                    break
                if name in {"script", "style", "noscript"}:
                    continue
                if name in {"p", "div", "span", "li"}:
                    answer = self._safe_get_text(sibling)
                    if answer:
                        break

            _add_pair(question, answer)

            if len(faq) >= 20:
                break

        seen: set = set()
        out: List[Dict[str, str]] = []
        for pair in faq:
            key = (pair.get("question") or "").strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(pair)
            if len(out) >= 20:
                break
        return out

    def _faq_pairs_to_main_entity(self, faq_pairs: Any) -> List[Dict[str, Any]]:
        pairs = faq_pairs if isinstance(faq_pairs, list) else []
        main_entity: List[Dict[str, Any]] = []
        for pair in pairs:
            if not isinstance(pair, dict):
                continue
            q = (pair.get("question") or "").strip()
            a = (pair.get("answer") or "").strip()
            if not q or not a:
                continue
            main_entity.append(
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
            )
            if len(main_entity) >= 20:
                break
        return main_entity

    def _inject_faq_main_entity(self, schema: Dict[str, Any], faq_pairs: Any) -> Dict[str, Any]:
        if not isinstance(schema, dict):
            return schema
        main_entity = self._faq_pairs_to_main_entity(faq_pairs)
        if not main_entity:
            return schema

        if schema.get("@type") == "FAQPage" and "mainEntity" not in schema:
            schema["mainEntity"] = main_entity
            return schema

        graph = schema.get("@graph")
        if isinstance(graph, list):
            for node in graph:
                if isinstance(node, dict) and node.get("@type") == "FAQPage" and "mainEntity" not in node:
                    node["mainEntity"] = main_entity
                    break
        return schema

    def _ensure_graph_output(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(schema, dict):
            return schema
        if isinstance(schema.get("@graph"), list):
            return schema

        context = schema.get("@context") or "https://schema.org"
        node = dict(schema)
        node.pop("@context", None)
        return {"@context": context, "@graph": [node]}

    def _extract_product_signals(self, soup) -> Dict[str, Any]:
        product: Dict[str, Any] = {}

        name = soup.find("h1")
        if name:
            n = self._safe_get_text(name)
            if n:
                product["name"] = n

        brand = soup.find(attrs={"itemprop": "brand"})
        if brand:
            b = self._safe_get_text(brand)
            if b:
                product["brand"] = b

        sku = soup.find(attrs={"itemprop": "sku"})
        if sku:
            s = self._safe_get_text(sku) or (sku.get("content") or "").strip()
            if s:
                product["sku"] = s

        availability = soup.find(attrs={"itemprop": "availability"})
        if availability:
            a = (availability.get("href") or availability.get("content") or self._safe_get_text(availability) or "").strip()
            if a:
                product["availability"] = a

        return product

    def _detect_page_type(self, url_path: str) -> str:
        path = (url_path or "").lower()
        if "/product" in path or "/products/" in path:
            return "Product"
        if "/blog" in path:
            return "Article"
        if "faq" in path:
            return "FAQPage"
        return "WebPage"

    def _extract_page_data(self, html: str, url: str) -> Dict[str, Any]:
        if not html:
            return {"url": url}
        if BeautifulSoup is None:
            return {"url": url, "text": self._clean_html(html)[:50000]}

        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception:
            return {"url": url, "text": self._clean_html(html)[:50000]}

        parsed_url = urlparse(url) if url else urlparse("")
        url_path = parsed_url.path or ""

        title = self._safe_get_text(soup.title) if soup.title else ""

        canonical = ""
        can = soup.find("link", rel=re.compile(r"canonical", re.I))
        if can:
            canonical = (can.get("href") or "").strip()

        headings: List[str] = []
        for h in soup.find_all(["h1", "h2", "h3"]):
            t = self._safe_get_text(h)
            if t:
                headings.append(t)

        paragraphs: List[str] = []
        for p in soup.find_all(["p", "li"]):
            t = self._safe_get_text(p)
            if len(t) >= 30:
                paragraphs.append(t)

        images: List[Dict[str, str]] = []
        for img in soup.find_all("img"):
            src = (img.get("src") or "").strip()
            if not src:
                continue
            alt = (img.get("alt") or "").strip()
            images.append({"src": src, "alt": alt})
            if len(images) >= 30:
                break

        links: List[Dict[str, str]] = []
        for a in soup.find_all("a"):
            href = (a.get("href") or "").strip()
            if not href or href.startswith("#"):
                continue
            text = self._safe_get_text(a)
            if not text:
                continue
            links.append({"text": text[:160], "href": href})
            if len(links) >= 50:
                break

        return {
            "url": url,
            "url_path": url_path,
            "url_host": parsed_url.netloc or "",
            "detected_page_type": self._detect_page_type(url_path),
            "title": title,
            "canonical": canonical,
            "meta": self._extract_meta(soup),
            "headings": self._dedupe_keep_order(headings, max_items=60),
            "paragraphs": self._dedupe_keep_order(paragraphs, max_items=120),
            "images": images,
            "links": links,
            "breadcrumbs": self._extract_breadcrumbs(soup),
            "faq_pairs": self._extract_faq_pairs(soup),
            "prices": self._extract_prices(soup),
            "product_signals": self._extract_product_signals(soup),
            "existing_json_ld": self._extract_existing_json_ld(soup),
            "microdata_items": self._extract_microdata_items(soup),
        }

    def _trim_page_data_for_prompt(self, page_data: Dict[str, Any], max_chars: int) -> Tuple[str, Dict[str, Any]]:
        data = dict(page_data or {})

        def _dump(d: Dict[str, Any]) -> str:
            return json.dumps(d, ensure_ascii=False, indent=2)

        content = _dump(data)
        if len(content) <= max_chars:
            return content, data

        trim_steps = [
            ("links", 30),
            ("links", 10),
            ("images", 15),
            ("images", 5),
            ("faq_pairs", 12),
            ("faq_pairs", 6),
            ("paragraphs", 80),
            ("paragraphs", 40),
            ("headings", 40),
            ("headings", 20),
            ("existing_json_ld", 2),
            ("existing_json_ld", 1),
            ("microdata_items", 2),
            ("microdata_items", 1),
        ]
        for key, n in trim_steps:
            if isinstance(data.get(key), list):
                data[key] = data[key][:n]
            content = _dump(data)
            if len(content) <= max_chars:
                return content, data

        return content[:max_chars], data

    def _safe_parse_json_object(self, raw: str) -> Dict[str, Any]:
        raw = (raw or "").strip()
        if not raw:
            raise ValueError("Empty response")
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
            raise ValueError("Response is not a JSON object")
        except Exception:
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1 and end > start:
                data = json.loads(raw[start:end + 1])
                if isinstance(data, dict):
                    return data
            raise

    def _primary_type_from_schema(self, schema: Dict[str, Any], fallback: str = "Unknown") -> str:
        if not isinstance(schema, dict):
            return fallback
        t = schema.get("@type")
        if isinstance(t, str) and t.strip():
            return t.strip()
        if isinstance(t, list) and t and isinstance(t[0], str):
            return t[0].strip()
        graph = schema.get("@graph")
        if isinstance(graph, list) and graph:
            first = graph[0]
            if isinstance(first, dict):
                gt = first.get("@type")
                if isinstance(gt, str) and gt.strip():
                    return gt.strip()
                if isinstance(gt, list) and gt and isinstance(gt[0], str):
                    return gt[0].strip()
        return fallback

    def _stable_seed(self, url: str, schema_type: str) -> int:
        raw = f"{url}::{schema_type}".encode("utf-8", errors="ignore")
        digest = hashlib.sha256(raw).digest()
        return int.from_bytes(digest[:4], "big", signed=False)

    def _call_openai_json(self, messages: list, seed: int) -> str:
        try:
            return self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0,
                top_p=1,
                presence_penalty=0,
                frequency_penalty=0,
                seed=seed,
                response_format={"type": "json_object"},
            ).choices[0].message.content
        except Exception:
            try:
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0,
                    top_p=1,
                    presence_penalty=0,
                    frequency_penalty=0,
                    seed=seed,
                ).choices[0].message.content
            except Exception:
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=0,
                    top_p=1,
                    presence_penalty=0,
                    frequency_penalty=0,
                ).choices[0].message.content

    def generate_schema_with_ai(self, url: str, html: str, schema_type: str = 'auto') -> Dict[str, Any]:
        """Use OpenAI GPT to analyze website HTML and generate schema markup"""
        
        if not self.client:
            return {
                'success': False,
                'error': 'OpenAI API not configured',
                'message': 'Please set OPENAI_API_KEY in your .env file',
                'schema': None
            }

        try:
            page_data = self._extract_page_data(html=html, url=url)
            max_chars = 50000
            content_sample, _ = self._trim_page_data_for_prompt(page_data, max_chars=max_chars)
            detected_page_type = (page_data.get("detected_page_type") or "").strip()
            faq_pairs = page_data.get("faq_pairs") or []
            if isinstance(faq_pairs, list) and faq_pairs:
                sample_qs = [str(x.get("question") or "")[:120] for x in faq_pairs[:3] if isinstance(x, dict)]
                logging.info(f"[SCHEMA] Extracted faq_pairs={len(faq_pairs)} sample_questions={sample_qs} url={url}")

            schema_desc = self._schema_description(schema_type)

            is_auto = not schema_type or schema_type.lower() == "auto"

            if schema_type and not is_auto:
                type_instruction = (
                    f'The user selected schema type: {schema_type}\n\n'
                    f'This schema describes: {schema_desc}\n\n'
                    f'Generate ONLY this schema type.\n'
                    f'Do not output any other types in @graph.\n\n'
                    f'Example:\n'
                    f'{{\n'
                    f'  "@context": "https://schema.org",\n'
                    f'  "@type": "{schema_type}"\n'
                    f'}}'
                )
            else:
                type_instruction = (
                    'Generate ALL applicable schemas for the page.\n'
                    'Output JSON-LD with "@context": "https://schema.org" and "@graph": [...].\n'
                    'Include every schema that applies.\n'
                )
                
            prompt = f"""
You are a Schema.org structured data expert.

Analyze the page data and generate ALL applicable schemas.

Possible schemas include:
Organization
LocalBusiness
WebPage
Article
BlogPosting
Product
Service
FAQPage
BreadcrumbList
Person
Event
Recipe
HowTo
VideoObject
ImageObject
Course
JobPosting
Review

Rules:
- Use ONLY information in the page data
- Do NOT invent information
- If data is missing omit the field
- Always include "@context": "https://schema.org"
- Return valid JSON only

FAQPage instructions:
If Page Data contains "faq_pairs", convert them to:
"mainEntity": [
  {{
    "@type": "Question",
    "name": "question text",
    "acceptedAnswer": {{
      "@type": "Answer",
      "text": "answer text"
    }}
  }}
]

Example FAQPage:
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {{
      "@type": "Question",
      "name": "What is delivery time?",
      "acceptedAnswer": {{
        "@type": "Answer",
        "text": "Delivery takes 5-7 days."
      }}
    }}
  ]
}}

Instructions:
Generate all schemas that apply to this page.

Examples:
Product page:
Product
BreadcrumbList
FAQPage
Organization

Blog article:
Article or BlogPosting
BreadcrumbList
Organization

Service page:
Service
FAQPage
Organization

Output format:
- If multiple schemas exist return them in "@graph"
- If only one schema applies, still return it inside "@graph" with a single node
- If the user selected a specific schema type, generate ONLY that schema type (do not include other types in @graph)

Page URL:
{url}

URL path may indicate schema type (examples: "/products/" → Product, "/blog/" → Article/BlogPosting, "/faq" → FAQPage).

Detected Page Type:
{detected_page_type}

{type_instruction}

Page Data:
{content_sample}
""".strip()

            messages = [
                {"role": "system", "content": "You are a Schema.org expert. Output strictly valid JSON only."},
                {"role": "user", "content": prompt},
            ]

            seed = self._stable_seed(url, schema_type or "auto")
            content = ""
            last_exc: Optional[Exception] = None
            for model in ["gpt-4.1-mini", "gpt-4o"]:
                try:
                    self.model = model
                    content = self._call_openai_json(messages, seed=seed)
                    break
                except Exception as e:
                    last_exc = e
                    content = ""

            if not content and last_exc:
                raise last_exc

            try:
                data = self._safe_parse_json_object(content)
                data = self._inject_faq_main_entity(data, faq_pairs)
                data = self._ensure_graph_output(data)
                primary_type = schema_type if (schema_type and schema_type.lower() != "auto") else self._primary_type_from_schema(data)
                return {
                    'success': True,
                    'schema': data,
                    'type': primary_type,
                    'schema_text': json.dumps(data, indent=2, ensure_ascii=False),
                    'rdfa_markup': ''
                }
            except Exception as e:
                logging.error(f"ERROR: Failed to parse JSON-LD: {e}")
                logging.debug(f"DEBUG: Raw content: {content[:500]}...") 
                return {
                    'success': False,
                    'error': 'Failed to parse AI response',
                    'message': f'Invalid JSON received from AI: {str(e)}'
                }
                
        except Exception as e:
            logging.error(f"ERROR: OpenAI API call failed: {e}")
            return {
                'success': False,
                'error': 'AI generation failed',
                'message': str(e)
            }


    def generate_schema(self, html: str, url: str, schema_type: str = 'auto') -> Dict[str, Any]:
        """Main method to generate schema markup - GPT analyzes HTML directly"""
        
        try:
            # Pass HTML directly to GPT - no extraction, let GPT analyze everything
            if self.client:
                result = self.generate_schema_with_ai(url, html, schema_type)
                if result.get('success'):
                    return result
                else:
                    # AI failed
                    logging.warning(f"AI schema generation failed: {result.get('message')}")
                    return {
                        'success': False,
                        'error': 'Schema generation failed',
                        'message': result.get('message', 'Failed to generate schema')
                    }
            else:
                # No AI available
                return {
                    'success': False,
                    'error': 'OpenAI API not configured',
                    'message': 'Please set OPENAI_API_KEY in your .env file'
                }
                
        except Exception as e:
            logging.error(f"Schema generation error: {e}")
            return {
                'success': False,
                'error': 'Schema generation failed',
                'message': str(e)
            }
    
    def validate_schema(self, schema_json: Dict[str, Any]) -> Dict[str, Any]:
        """Validate schema markup"""
        
        issues = []
        
        if '@context' not in schema_json:
            issues.append("Missing @context property")
        
        has_type = False
        if schema_json.get('@type'):
            has_type = True
        if isinstance(schema_json.get('@graph'), list):
            has_type = any(
                isinstance(n, dict) and n.get('@type')
                for n in schema_json['@graph']
            )

        if not has_type:
            issues.append("Missing @type property")
        
        return {
            'valid': len(issues) == 0,
            'issues': issues,
            'warnings': []
        }
