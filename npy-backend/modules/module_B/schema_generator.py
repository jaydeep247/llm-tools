"""
Schema.org Markup Generator Service
Uses OpenAI GPT to generate appropriate schema markup for web pages
"""

import os
import json
import logging
import re
from typing import Dict, Any

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    logging.warning("OpenAI not available for schema generation")


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
            
        # Remove scripts and styles
        cleaned = re.sub(r'<script[\s\S]*?</script>', '', html_content, flags=re.IGNORECASE)
        cleaned = re.sub(r'<style[\s\S]*?</style>', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'<noscript[\s\S]*?</noscript>', '', cleaned, flags=re.IGNORECASE)
        
        # Remove HTML tags (keep just text)
        cleaned = re.sub(r'<[^>]+>', ' ', cleaned)
        
        # Remove extra whitespace
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned
    # --- OUR ADDED CODE END ---

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
            
            Content:
            {content_sample}
            
            Return ONLY the valid JSON-LD code within a code block. Do not include explanations.
            """
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert SEO specialist and web developer proficient in Schema.org structured data."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
            )
            
            content = response.choices[0].message.content
            
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
