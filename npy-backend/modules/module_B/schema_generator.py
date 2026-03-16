"""
Schema.org Markup Generator Service
Uses OpenAI GPT to generate appropriate schema markup for web pages
"""

import os
import json
import logging
import re
import hashlib
from typing import Dict, Any

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
            self.model = "gpt-4o"
            
            # --- UPDATED: Use our _clean_html function first ---
            # This saves tokens by removing junk BEFORE we truncate
            clean_content = self._clean_html(html)
            
            # Truncate to avoid token limits (GPT-4o context)
            max_chars = 15000
            if len(clean_content) > max_chars:
                content_sample = clean_content[:max_chars]
            else:
                content_sample = clean_content
            # ----------------------------------------------------

            if schema_type and schema_type.lower() != "auto":
                type_instruction = (
                    f"The primary Schema.org type MUST be exactly \"{schema_type}\". "
                    f"Set \"@type\": \"{schema_type}\" on the main object (or main node in @graph). "
                    "Do not choose a different primary type."
                )
            else:
                type_instruction = (
                    "Determine the most appropriate Schema.org type automatically based on the content."
                )
                
            prompt = f"""
Generate Schema.org JSON-LD markup for the following webpage content.
URL: {url}

{type_instruction}

Rules:
- Use ONLY facts explicitly present in the provided content. Do NOT guess or invent founding dates, addresses, phone numbers, emails, ratings, prices, or social links.
- If a field is not present, omit it rather than filling with a placeholder.
- Output MUST be a single valid JSON object (no markdown, no code fences, no extra text).
- Always include "@context": "https://schema.org".

Content:
{content_sample}
""".strip()

            messages = [
                {"role": "system", "content": "You generate Schema.org JSON-LD deterministically and output strict JSON only."},
                {"role": "user", "content": prompt},
            ]

            content = self._call_openai_json(messages, seed=self._stable_seed(url, schema_type or "auto"))
            
            # Extract JSON from code block (Other Developer's Regex Logic - PRESERVED)
            json_match = re.search(r'```json\n(.*?)\n```', content, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try finding just brace-enclosed content
                json_match = re.search(r'(\{.*\})', content, re.DOTALL)
                json_str = json_match.group(1) if json_match else content

            try:
                data = json.loads(json_str)
                return {
                    'success': True,
                    'schema': data,
                    'type': data.get('@type', 'Unknown'),
                    'schema_text': json.dumps(data, indent=2),
                    'rdfa_markup': ''
                }
            except json.JSONDecodeError as e:
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
        
        if '@type' not in schema_json:
            issues.append("Missing @type property")
        
        return {
            'valid': len(issues) == 0,
            'issues': issues,
            'warnings': []
        }
