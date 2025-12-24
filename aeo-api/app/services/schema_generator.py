"""
Schema.org Markup Generator Service
Uses OpenAI GPT to generate appropriate schema markup for web pages
"""

import os
import json
import logging
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
    
    def generate_schema_with_ai(self, url: str, html: str, schema_type: str = 'auto') -> Dict[str, Any]:
        """Use OpenAI GPT to analyze website HTML and generate schema markup"""
        
        if not self.client:
            return {
                'error': 'OpenAI API not configured',
                'message': 'Please set OPENAI_API_KEY in your .env file',
                'schema': None
            }
        
        # Initialize model name
        model_name = "gpt-5.2-2025-12-11"
        response = None
        
        try:
            # Build prompt - pass HTML directly to GPT, let it analyze everything
            # Limit HTML to 50k chars to avoid token limits
            html_content = html[:50000]
            
            if schema_type and schema_type != 'auto':
                if schema_type == 'Organization':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE Organization schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and use your knowledge base extensively to find ALL available information about this organization.

You MUST generate a COMPLETE Organization schema with ALL these properties if available:
- @context: "https://schema.org"
- @type: "Organization"
- @id: URL with #organization fragment (e.g., "{url}#organization")
- name: company/brand name
- legalName: full legal company name (use knowledge base if not in HTML)
- url: website URL
- logo: ImageObject with url, width, height (extract logo dimensions from image or use standard sizes like 512x512)
- description: comprehensive company description
- foundingDate: founding year or date (YYYY or YYYY-MM-DD format)
- founder: Person object with name (if known)
- founders: array of Person objects (if multiple founders)
- contactPoint: array of ContactPoint objects with telephone, email, contactType, areaServed, availableLanguage
- address: array of PostalAddress objects (can have multiple addresses) with streetAddress, addressLocality, addressRegion, postalCode, addressCountry
- sameAs: array of social media URLs (LinkedIn, Facebook, Twitter, etc.)
- memberOf: Organization if applicable
- numberOfEmployees: if known
- keywords: relevant business keywords

CRITICAL: 
- Always include @id with #organization fragment
- Logo MUST be an ImageObject with url, width, and height properties
- Extract logo dimensions from image attributes, og:image:width/height, or use standard sizes (e.g., 512x512, 250x60)
- If logo dimensions are not available, use reasonable defaults based on logo type (square logos: 512x512, rectangular: 250x60)
- Use knowledge base to find information that's not in the HTML

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'LocalBusiness':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE LocalBusiness schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and use your knowledge base extensively to find ALL available information about this local business.

You MUST generate a COMPLETE LocalBusiness schema with ALL these properties if available:
- @context: "https://schema.org"
- @type: "LocalBusiness"
- @id: URL with #localbusiness fragment
- name: business name
- legalName: full legal business name (use knowledge base if not in HTML)
- url: website URL
- logo: logo URL
- image: business image URL
- description: comprehensive business description
- telephone: phone number (format: +XX-XXXXXXXXXX)
- email: contact email
- priceRange: price range if applicable (e.g., "$$")
- address: PostalAddress object with streetAddress, addressLocality, addressRegion, postalCode, addressCountry
- geo: GeoCoordinates object with latitude and longitude (if available)
- openingHoursSpecification: OpeningHoursSpecification object with dayOfWeek array, opens, closes
- sameAs: array of social media URLs (LinkedIn, Facebook, Twitter, etc.)
- founder: Person object with name (if known)
- foundingDate: founding year or date (YYYY or YYYY-MM-DD format)


Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'WebPage':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE WebPage schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract page information.

You MUST generate a COMPLETE WebPage schema with ALL these properties:
- @context: "https://schema.org"
- @type: "WebPage"
- @id: URL with #webpage fragment (e.g., "{url}#webpage")
- url: page URL
- name: page title/name
- description: page description/meta description
- inLanguage: language code (e.g., "en")
- isPartOf: WebSite object with @id pointing to "#website" (e.g., {{"@type": "WebSite", "@id": "{url}#website"}})
- about: Organization object with @id pointing to "#organization" (e.g., {{"@type": "Organization", "@id": "{url}#organization", "name": "Company Name"}})
- primaryImageOfPage: ImageObject with url (logo or main image)
- publisher: Organization object with @id pointing to "#organization", name, and logo (ImageObject with url)

CRITICAL: 
- Extract page title from <title> tag or H1
- Extract description from meta description tag
- Use the website's logo/image for primaryImageOfPage and publisher.logo
- Set @id fragments correctly (#webpage, #website, #organization)
- Keep it simple - only include these fields, no additional properties

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'Article':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE Article schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract article information.

You MUST generate a COMPLETE Article schema with ALL these properties:
- @context: "https://schema.org"
- @type: "Article"
- @id: URL with #article fragment (e.g., "{url}#article")
- mainEntityOfPage: WebPage object with @type "WebPage" and @id pointing to the page URL
- headline: article title/headline
- description: article description/excerpt
- image: ImageObject with url, width, height (featured image)
- author: Person object with name and url (if available)
- publisher: Organization object with name and logo (ImageObject with url)
- datePublished: publication date (YYYY-MM-DD format)
- dateModified: modification date (YYYY-MM-DD format, can be same as datePublished)
- articleSection: section/category name (e.g., "Digital Marketing", "SEO", etc.)
- keywords: array of relevant keywords/tags
- inLanguage: language code (e.g., "en")

CRITICAL: 
- Extract headline from <title> tag or H1
- Extract description from meta description or article excerpt
- Extract dates from <time> tags, meta tags (article:published_time, article:modified_time), or article content
- Extract author from meta author tag, byline, or article header
- Extract image from og:image, featured image, or first article image
- Extract articleSection from category tags, breadcrumbs, or article metadata
- Extract keywords from meta keywords, tags, or article topics
- Use knowledge base for publisher organization name and logo if not in HTML

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'VideoObject':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE VideoObject schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract video information.

You MUST generate a COMPLETE VideoObject schema with ALL these properties:
- @context: "https://schema.org"
- @type: "VideoObject"
- @id: URL with #video fragment (e.g., "{url}#video")
- name: video title/name
- description: video description
- thumbnailUrl: array of thumbnail image URLs
- uploadDate: upload/release date (YYYY-MM-DD format)
- duration: video duration in ISO 8601 duration format (e.g., "PT2M30S" for 2 minutes 30 seconds, "PT1H15M" for 1 hour 15 minutes)
- contentUrl: direct video file URL (mp4, webm, etc.)
- embedUrl: embeddable video player URL (YouTube embed, Vimeo player, etc.)
- publisher: Organization object with name and logo (ImageObject with url, width, height)
- inLanguage: language code (e.g., "en")
- interactionStatistic: InteractionCounter object with interactionType (WatchAction) and userInteractionCount (if available)

CRITICAL: 
- Extract video title from <title> tag, H1, or og:video:title
- Extract description from meta description or video description
- Extract thumbnailUrl from og:image, video poster, thumbnail meta tags, or video element poster attribute
- Extract uploadDate from video:release_date meta tag, time tag, or video metadata
- Extract duration from video element duration attribute, video:duration meta tag, or video metadata (convert to ISO 8601 format: PT#H#M#S)
- Extract contentUrl from video element src, og:video:url, or direct video file links
- Extract embedUrl from iframe src (YouTube, Vimeo embeds), og:video:secure_url, or embeddable player URLs
- Extract view count/interactionStatistic from video metadata if available
- Use knowledge base for publisher organization name and logo if not in HTML

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'Review':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE Review schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract review information.

You MUST generate a COMPLETE Review schema with ALL these properties:
- @context: "https://schema.org"
- @type: "Review"
- @id: URL with #review fragment (e.g., "{url}#review-1" or "{url}#review")
- itemReviewed: object with @type (LocalBusiness, Product, Service, etc.), @id, and name (the item being reviewed)
- author: Person object with name (reviewer name)
- reviewRating: Rating object with ratingValue (1-5 or other scale) and bestRating (maximum rating, usually 5)
- reviewBody: the review text/content
- datePublished: publication date of the review (YYYY-MM-DD format)

CRITICAL: 
- Extract review text from review sections, testimonial blocks, or review content
- Extract rating from star ratings, rating elements, or review metadata
- Extract author name from reviewer name, author tag, or review header
- Extract datePublished from time tags, review date, or review metadata
- Determine itemReviewed type (LocalBusiness, Product, Service, etc.) based on what's being reviewed
- Set @id for itemReviewed pointing to the appropriate schema (e.g., "#localbusiness", "#product")
- If multiple reviews exist, use unique @id for each (e.g., "#review-1", "#review-2")
- Use knowledge base for business/organization name if reviewing a business

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'BreadcrumbList':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE BreadcrumbList schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract breadcrumb navigation information.

You MUST generate a COMPLETE BreadcrumbList schema with ALL these properties:
- @context: "https://schema.org"
- @type: "BreadcrumbList"
- @id: URL with #breadcrumb fragment (e.g., "{url}#breadcrumb")
- itemListElement: array of ListItem objects, each with:
  - @type: "ListItem"
  - position: sequential number starting from 1
  - name: breadcrumb label/text
  - item: URL for that breadcrumb level (optional for last item which is current page)

CRITICAL: 
- Extract breadcrumb navigation from nav elements with "breadcrumb" class/aria-label, or parse from URL path
- Each ListItem must have position (1, 2, 3, etc.), name, and item (URL)
- First item is usually "Home" pointing to root URL (e.g., "{url.split('/')[0]}//{url.split('/')[2]}/")
- Last item is the current page (can omit item URL for last item, or use current page URL)
- Parse URL path segments if no explicit breadcrumb found in HTML
- Extract breadcrumb names from link text, aria-labels, or URL path segments
- Build full URLs for each breadcrumb level based on the current page URL structure
- Use proper URL structure: root domain for Home, then build paths incrementally

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'FAQPage':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE FAQPage schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract FAQ (Frequently Asked Questions) information.

You MUST generate a COMPLETE FAQPage schema with ALL these properties:
- @context: "https://schema.org"
- @type: "FAQPage"
- @id: URL with #faq fragment (e.g., "{url}#faq")
- mainEntity: array of Question objects, each with:
  - @type: "Question"
  - name: the question text
  - acceptedAnswer: Answer object with:
    - @type: "Answer"
    - text: the answer text

CRITICAL: 
- Extract FAQ questions and answers from FAQ sections, accordion items, details/summary elements, or Q&A content
- Look for elements with classes/ids containing: faq, question, answer, accordion, qa
- Each Question object must have name (question) and acceptedAnswer (Answer object with text)
- Include ALL questions and answers found on the page (minimum 3-5, or as many as available)
- Extract questions from headings (H2, H3, H4) that contain "?" or question words (what, how, why, when, where, who)
- Extract answers from content following questions, accordion content, or answer sections
- Questions should be complete sentences ending with "?"
- Answers should be comprehensive and informative

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'Person':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE Person schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract person information.

You MUST generate a COMPLETE Person schema with ALL these properties:
- @context: "https://schema.org"
- @type: "Person"
- @id: URL with #person fragment (e.g., "{url}#person-gaurav-sharma" or "{url}#person")
- name: person's full name
- jobTitle: job title/position (e.g., "Founder & CEO", "Director", etc.)
- url: person's profile/about page URL
- image: person's photo/image URL
- worksFor: Organization object with @type "Organization", @id pointing to "#organization", name, and url
- description: person's bio/description
- sameAs: array of social media profile URLs (LinkedIn, Twitter, Facebook, etc.)
- knowsAbout: array of topics/expertise areas (e.g., ["SEO", "Digital Marketing", "Content Marketing"])

CRITICAL: 
- Extract person name from H1, title, or page heading
- Extract jobTitle from headings, meta tags, or bio sections
- Extract description from about/bio sections, meta description, or page content
- Extract image from profile photo, og:image, or person image elements
- Extract worksFor organization information from page content or use knowledge base
- Extract sameAs social media URLs from social links, profile sections, or footer
- Extract knowsAbout from expertise sections, skills, or areas of focus mentioned on the page
- Use knowledge base for known persons to find additional information like social profiles and expertise
- Set @id with person name if available (e.g., "#person-gaurav-sharma") or just "#person"

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'Service':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE Service schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract service information.

You MUST generate a COMPLETE Service schema with ALL these properties:
- @context: "https://schema.org"
- @type: "Service"
- @id: URL with #service fragment (e.g., "{url}#service")
- name: service name/title
- serviceType: type of service (e.g., "Search Engine Optimization", "Digital Marketing", "Web Design", etc.)
- url: service page URL
- description: comprehensive service description
- provider: LocalBusiness or Organization object with @type, @id pointing to "#localbusiness" or "#organization", name, and url
- areaServed: AdministrativeArea object with name (e.g., "Worldwide", "United States", "India", etc.) or array of areas
- availableChannel: ServiceChannel object with serviceLocation (Place object with name, e.g., "Online", "In-Person", etc.)
- hasOfferCatalog: OfferCatalog object (optional) with name and itemListElement array of Offer objects, each with itemOffered (Service object with name)

CRITICAL: 
- Extract service name from page title, H1, or service heading
- Extract serviceType from service category, page content, or service description
- Extract description from service description, meta description, or page content
- Extract provider information from page content or use knowledge base (should reference the business/organization)
- Set @id for provider pointing to "#localbusiness" or "#organization" based on what's available
- Extract areaServed from service coverage information, "Serving" sections, or use "Worldwide" if global
- Extract availableChannel from service delivery method (online, in-person, etc.)
- Extract hasOfferCatalog from service packages, pricing sections, or service offerings listed on the page
- Use knowledge base for provider organization information if not in HTML

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                elif schema_type == 'Product':
                    prompt = f"""Analyze this website HTML and generate a COMPREHENSIVE Product schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and extract product information.

You MUST generate a COMPLETE Product schema with ALL these properties:
- @context: "https://schema.org"
- @type: "Product"
- @id: URL with #product fragment (e.g., "{url}#product")
- name: product name/title
- description: comprehensive product description
- brand: Brand object with name (company/brand name)
- image: product image URL (array or single URL)
- sku: product SKU/identifier (if available)
- offers: Offer object with:
  - @type: "Offer"
  - url: product page URL
  - priceCurrency: currency code (e.g., "USD", "EUR", "INR")
  - price: product price (as string, e.g., "499", "99.99")
  - priceValidUntil: price validity date (YYYY-MM-DD format, e.g., "2025-12-31")
  - availability: availability status (e.g., "https://schema.org/InStock", "https://schema.org/OutOfStock", "https://schema.org/PreOrder")
  - seller: Organization object with @type "Organization", @id pointing to "#organization", and name

CRITICAL: 
- Extract product name from page title, H1, or product heading
- Extract description from product description, meta description, or page content
- Extract brand name from company name, brand section, or use knowledge base
- Extract image from product image, og:image, or featured image
- Extract SKU from product identifier, SKU field, or product code if available
- Extract price from pricing section, price element, or product metadata
- Extract priceCurrency from currency symbol, price format, or page content
- Extract priceValidUntil from sale end date, offer expiration, or use a reasonable future date (e.g., 1 year from now)
- Extract availability from stock status, availability indicator, or use "InStock" if not specified
- Extract seller information from page content or use knowledge base (should reference the business/organization)
- Set @id for seller pointing to "#organization"
- Use knowledge base for seller organization information if not in HTML

Return ONLY the JSON object, no markdown code blocks, no script tags, no explanations."""
                else:
                    prompt = f"""Analyze this website HTML and generate a comprehensive {schema_type} schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and use your knowledge base to find all available information about this business/organization.

For {schema_type} schema, include ALL relevant properties:
- If Service: name, description, provider, serviceType, areaServed, etc.
- Include all details you can find from the HTML and your knowledge base.

Return ONLY the JSON-LD schema, no explanations or markdown."""
            else:
                prompt = f"""Analyze this website HTML and generate the most appropriate schema.org JSON-LD markup.

URL: {url}

HTML Content:
{html_content}

Analyze the HTML content above and determine the best schema type (Organization, LocalBusiness, Article, Product, Service, etc.).

Use your knowledge base for known entities to find comprehensive information like:
- Legal company name, founding date, founders
- Complete business address
- Contact information
- Social media profiles
- Services, products, or other relevant details

Generate comprehensive markup with all available properties for the determined schema type.

Return ONLY the JSON-LD schema, no explanations or markdown."""
            
            # System prompt based on schema type
            if schema_type == 'Organization':
                system_content = "You are an SEO expert that generates comprehensive Organization Schema.org JSON-LD markup. Use your knowledge base extensively for known companies. For Organization schema, include ALL available properties: @id with #organization fragment, legalName, foundingDate, founders, contactPoint, address (can be array), sameAs, description, etc. IMPORTANT: logo MUST be an ImageObject with url, width, and height properties (not just a URL string). Return only valid JSON without markdown formatting."
            elif schema_type == 'LocalBusiness':
                system_content = "You are an SEO expert that generates comprehensive LocalBusiness Schema.org JSON-LD markup. Use your knowledge base extensively for known businesses. For LocalBusiness schema, include ALL available properties: legalName, address, telephone, email, geo (coordinates), openingHoursSpecification, sameAs, founder, foundingDate, priceRange, etc. Return only valid JSON without markdown formatting."
            elif schema_type == 'WebPage':
                system_content = "You are an SEO expert that generates WebPage Schema.org JSON-LD markup. For WebPage schema, include ONLY these fields: @context, @type, @id, url, name, description, inLanguage, isPartOf (WebSite), about (Organization), primaryImageOfPage (ImageObject), publisher (Organization with logo). Keep it simple and focused. Return only valid JSON without markdown formatting."
            elif schema_type == 'Article':
                system_content = "You are an SEO expert that generates Article Schema.org JSON-LD markup. For Article schema, include these fields: @context, @type, @id, mainEntityOfPage (WebPage), headline, description, image (ImageObject with width/height), author (Person), publisher (Organization with logo), datePublished, dateModified, articleSection, keywords (array), inLanguage. Extract dates, author, and image from HTML. Return only valid JSON without markdown formatting."
            elif schema_type == 'VideoObject':
                system_content = "You are an SEO expert that generates VideoObject Schema.org JSON-LD markup. For VideoObject schema, include these fields: @context, @type, @id, name, description, thumbnailUrl (array), uploadDate, duration (ISO 8601 format like PT2M30S), contentUrl, embedUrl, publisher (Organization with logo including width/height), inLanguage, interactionStatistic (if available). Extract video metadata from HTML. Return only valid JSON without markdown formatting."
            elif schema_type == 'Review':
                system_content = "You are an SEO expert that generates Review Schema.org JSON-LD markup. For Review schema, include these fields: @context, @type, @id, itemReviewed (with @type, @id, name), author (Person with name), reviewRating (Rating with ratingValue and bestRating), reviewBody, datePublished. Extract review content, rating, author, and date from HTML. Return only valid JSON without markdown formatting."
            elif schema_type == 'BreadcrumbList':
                system_content = "You are an SEO expert that generates BreadcrumbList Schema.org JSON-LD markup. For BreadcrumbList schema, include these fields: @context, @type, @id, itemListElement (array of ListItem objects with @type, position, name, item). Extract breadcrumb navigation from HTML or parse from URL path. Last item can omit item URL. Return only valid JSON without markdown formatting."
            elif schema_type == 'FAQPage':
                system_content = "You are an SEO expert that generates FAQPage Schema.org JSON-LD markup. For FAQPage schema, include these fields: @context, @type, @id, mainEntity (array of Question objects with @type, name, and acceptedAnswer containing Answer object with @type and text). Extract questions and answers from FAQ sections, accordion items, or Q&A content. Include all available Q&A pairs. Return only valid JSON without markdown formatting."
            elif schema_type == 'Person':
                system_content = "You are an SEO expert that generates Person Schema.org JSON-LD markup. For Person schema, include these fields: @context, @type, @id, name, jobTitle, url, image, worksFor (Organization with @id, name, url), description, sameAs (array of social media URLs), knowsAbout (array of expertise topics). Extract person information from bio/about sections. Use knowledge base for known persons. Return only valid JSON without markdown formatting."
            elif schema_type == 'Service':
                system_content = "You are an SEO expert that generates Service Schema.org JSON-LD markup. For Service schema, include these fields: @context, @type, @id, name, serviceType, url, description, provider (LocalBusiness or Organization with @id, name, url), areaServed (AdministrativeArea with name), availableChannel (ServiceChannel with serviceLocation), hasOfferCatalog (OfferCatalog with itemListElement array of Offers). Extract service information from service pages. Use knowledge base for provider organization. Return only valid JSON without markdown formatting."
            elif schema_type == 'Product':
                system_content = "You are an SEO expert that generates Product Schema.org JSON-LD markup. For Product schema, include these fields: @context, @type, @id, name, description, brand (Brand with name), image, sku (if available), offers (Offer with url, priceCurrency, price, priceValidUntil, availability, seller Organization with @id and name). Extract product information from product pages. Use knowledge base for seller organization. Return only valid JSON without markdown formatting."
            else:
                system_content = "You are an SEO expert that generates comprehensive Schema.org JSON-LD markup. Analyze websites directly and use your knowledge base extensively for known entities. Return only valid JSON without markdown formatting."
            
            # Try gpt-5.2-2025-12-11 first, fallback to gpt-4o
            try:
                response = self.client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": system_content
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    temperature=0.3,
                    max_completion_tokens=4000
                )
            except Exception as model_error:
                # If model doesn't exist, fallback to gpt-4o
                error_str = str(model_error).lower()
                if any(keyword in error_str for keyword in ["model", "not found", "invalid", "does not exist", "not available"]):
                    logging.warning(f"Model {model_name} not available, falling back to gpt-4o")
                    model_name = "gpt-4o"
                    response = self.client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {
                                "role": "system",
                                "content": system_content
                            },
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        temperature=0.3,
                        max_completion_tokens=4000
                    )
                else:
                    raise ValueError("Model not available")
            
            # Extract and clean the response
            if not response or not response.choices or not response.choices[0].message.content:
                raise ValueError("GPT returned empty response")
            
            schema_text = response.choices[0].message.content.strip()
            
            if not schema_text:
                raise ValueError("GPT returned empty response after stripping")
            
            # Log raw response for debugging (first 500 chars)
            logging.info(f"Raw GPT response (first 500 chars): {schema_text[:500]}")
            
            # Remove markdown code blocks if present
            if '```json' in schema_text:
                start_idx = schema_text.find('```json')
                end_idx = schema_text.find('```', start_idx + 7)
                if start_idx != -1 and end_idx != -1:
                    schema_text = schema_text[start_idx + 7:end_idx].strip()
            elif '```' in schema_text:
                start_idx = schema_text.find('```')
                end_idx = schema_text.rfind('```')
                if start_idx < end_idx:
                    schema_text = schema_text[start_idx:end_idx]
                lines = schema_text.split('\n')
                if lines and lines[0].startswith('```'):
                    lines = lines[1:]
                schema_text = '\n'.join(lines).strip()
            
            # Extract JSON object
            start_brace = schema_text.find('{')
            if start_brace == -1:
                logging.error(f"No JSON found. Response: {schema_text[:1000]}")
                raise ValueError("No JSON object found in GPT response")
            
            # Find matching closing brace
            brace_count = 0
            end_brace = -1
            for i in range(start_brace, len(schema_text)):
                if schema_text[i] == '{':
                    brace_count += 1
                elif schema_text[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_brace = i
                        break
            
            if end_brace == -1:
                logging.error(f"Unmatched braces. Response: {schema_text[:1000]}")
                raise ValueError("Invalid JSON structure - unmatched braces")
            
            schema_text = schema_text[start_brace:end_brace + 1]
            
            if not schema_text.strip():
                logging.error(f"Empty JSON after extraction. Original: {response.choices[0].message.content[:1000]}")
                raise ValueError("Empty JSON after extraction")
            
            # Parse JSON
            schema_json = json.loads(schema_text)
            
            # Get schema types
            schema_types = []
            if isinstance(schema_json, dict) and '@type' in schema_json:
                st = schema_json['@type']
                schema_types = st if isinstance(st, list) else [st]
            
            return {
                'success': True,
                'schema': schema_json,
                'schema_text': json.dumps(schema_json, indent=2),
                'rdfa_markup': '',
                'schema_types': schema_types,
                'model_used': model_name,
                'tokens_used': response.usage.total_tokens if hasattr(response, 'usage') else 0
            }
            
        except json.JSONDecodeError as e:
            raw_resp = response.choices[0].message.content if 'response' in locals() and response else "N/A"
            logging.error(f"Failed to parse generated schema as JSON: {e}")
            logging.error(f"Raw response (first 1000 chars): {raw_resp[:1000] if isinstance(raw_resp, str) else str(raw_resp)[:1000]}")
            return {
                'error': 'Invalid JSON generated',
                'message': f'The AI generated invalid JSON: {str(e)}. Check logs for raw response.',
                'schema': None
            }
        except ValueError as e:
            raw_resp = response.choices[0].message.content if 'response' in locals() and response else "N/A"
            logging.error(f"Value error in schema generation: {e}")
            logging.error(f"Raw response (first 1000 chars): {raw_resp[:1000] if isinstance(raw_resp, str) else str(raw_resp)[:1000]}")
            return {
                'error': 'Schema generation failed',
                'message': f'{str(e)}. Check logs for raw response.',
                'schema': None
            }
        except Exception as e:
            raw_resp = response.choices[0].message.content if 'response' in locals() and response else "N/A"
            logging.error(f"Error generating schema with AI: {e}")
            logging.error(f"Raw response (first 1000 chars): {raw_resp[:1000] if isinstance(raw_resp, str) else str(raw_resp)[:1000]}")
            return {
                'error': 'Schema generation failed',
                'message': f'{str(e)}. Check logs for raw response.',
                'schema': None
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
