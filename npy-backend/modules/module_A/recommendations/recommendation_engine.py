"""
Recommendation Engine
Generates prioritized, actionable SEO recommendations for each crawled page.

Priority levels follow industry-standard SEO impact ordering:
  1 - Indexability   (critical — page invisible to Google until fixed)
  2 - Titles & Meta  (critical — SERP CTR impact)
  3 - Heading Struc. (critical — primary keyword signal)
  4 - Content        (high    — thin/duplicate content)
  5 - Structured Data(high    — rich result eligibility)
  6 - Page Speed     (medium  — Core Web Vitals ranking factor)
  7 - Open Graph     (medium  — social sharing CTR)
  8 - Security       (medium  — mixed content / viewport)
"""

from typing import Dict, Any, List


SEVERITY_CRITICAL = 'critical'
SEVERITY_WARNING = 'warning'
SEVERITY_INFO = 'info'

# Maps severity to a numeric weight for health score calculation
SEVERITY_WEIGHT = {
    SEVERITY_CRITICAL: 20,
    SEVERITY_WARNING:  8,
    SEVERITY_INFO:     3,
}


def _r(priority: int, category: str, severity: str, title: str,
        issue: str, fix: str, impact: str, fields: List[str]) -> Dict[str, Any]:
    """Build a single recommendation dict."""
    return {
        'priority': priority,
        'category': category,
        'severity': severity,
        'title': title,
        'issue': issue,
        'fix': fix,
        'impact': impact,
        'fields_affected': fields,
    }


# ---------------------------------------------------------------------------
# Individual rule functions — one per check
# ---------------------------------------------------------------------------

def _check_indexability(page: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    status_code = page.get('status_code', 200)
    indexable = page.get('indexable', True)
    indexability_status = page.get('indexability_status', '')
    meta_robots = (page.get('meta_robots') or '').lower()
    x_robots = (page.get('x_robots_tag') or '').lower()
    canonical_url = page.get('canonical_url') or ''
    url = page.get('url', '')

    if status_code in (404, 410):
        recs.append(_r(
            1, 'Indexability', SEVERITY_CRITICAL,
            f'Page returns {status_code}',
            f'This page returns HTTP {status_code} but is linked internally, '
            'wasting crawl budget and creating a broken user experience.',
            'Remove or update all internal links pointing to this URL. '
            'If the content moved, set up a 301 redirect to the new location.',
            'Eliminates crawl budget waste and fixes broken user journeys.',
            ['status_code', 'indexable'],
        ))

    elif status_code >= 500:
        recs.append(_r(
            1, 'Indexability', SEVERITY_CRITICAL,
            f'Server error ({status_code}) on this page',
            f'This page returns HTTP {status_code}. Google will not index it '
            'and may de-prioritize the domain if server errors are frequent.',
            'Investigate server logs for the root cause. Fix the application '
            'error causing this response.',
            'Page becomes crawlable and indexable again.',
            ['status_code'],
        ))

    if 'noindex' in meta_robots or 'noindex' in x_robots:
        source = 'X-Robots-Tag header' if 'noindex' in x_robots else '<meta name="robots">'
        recs.append(_r(
            1, 'Indexability', SEVERITY_CRITICAL,
            'Page is blocked from indexing (noindex)',
            f'This page has noindex set via {source}. Google cannot rank it '
            'regardless of its content quality or backlink profile.',
            f'If this page should rank, remove the noindex directive from the '
            f'{source}. If it should stay hidden, verify this is intentional.',
            'Page becomes eligible to appear in Google search results.',
            ['meta_robots', 'x_robots_tag', 'indexable'],
        ))

    if canonical_url and canonical_url.rstrip('/') != url.rstrip('/'):
        recs.append(_r(
            1, 'Indexability', SEVERITY_CRITICAL,
            'Page is canonicalized to a different URL',
            f'The canonical tag points to "{canonical_url}" instead of this '
            'page. Google will credit all ranking signals (links, content) to '
            'the canonical URL, not this one.',
            'If this is the preferred version, change the canonical to '
            'point to itself. If the other URL is preferred, ensure it returns '
            '200 and consolidate content there.',
            'All SEO authority flows to the intended page.',
            ['canonical_url', 'indexability_status'],
        ))

    return recs


def _check_titles(page: Dict[str, Any], fields: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    title = page.get('title') or ''
    title_len = page.get('title_length', len(title))
    wc = (fields.get('website_crawler') or {})
    title_px = wc.get('title_pixel_width', 0) or 0
    pm = (fields.get('page_matrix') or {})
    pm_title_validation = pm.get('titleValidation') or {}

    if not title:
        recs.append(_r(
            2, 'Titles & Meta', SEVERITY_CRITICAL,
            'Page is missing a title tag',
            'There is no <title> tag on this page. Google uses the title as '
            'the primary headline in search results.',
            'Add a unique, descriptive <title> tag between 30–60 characters '
            'containing the primary keyword for this page.',
            'Page gets a SERP headline; CTR typically improves 20–40% vs '
            'pages with missing or auto-generated titles.',
            ['title', 'title_length'],
        ))
    elif title_px > 600:
        recs.append(_r(
            2, 'Titles & Meta', SEVERITY_WARNING,
            f'Title is too long ({title_len} chars, ~{title_px}px)',
            f'Your title "{title[:60]}..." exceeds Google\'s ~600px display '
            'limit and will be truncated in search results with "..."',
            f'Shorten the title to under 60 characters / 600px. Move the '
            'brand name to the end or remove filler words.',
            'Full title shown in SERP — users see your intended message '
            'before clicking.',
            ['title', 'title_length'],
        ))
    elif title_len < 30:
        recs.append(_r(
            2, 'Titles & Meta', SEVERITY_INFO,
            f'Title is very short ({title_len} chars)',
            f'Your title "{title}" is only {title_len} characters. '
            'Short titles miss keyword opportunities and fill less SERP space.',
            'Expand to 40–60 characters. Add the primary keyword if missing, '
            'and a secondary benefit or brand name.',
            'Better keyword coverage and more visible SERP presence.',
            ['title', 'title_length'],
        ))

    # Meta description
    meta_desc = page.get('meta_description') or ''
    desc_len = page.get('description_length', len(meta_desc))
    desc_px = wc.get('meta_description_pixel_width', 0) or 0

    if not meta_desc:
        recs.append(_r(
            2, 'Titles & Meta', SEVERITY_CRITICAL,
            'Missing meta description',
            'There is no meta description on this page. Google will auto-generate '
            'a snippet from random page text, which rarely communicates your '
            'intended value proposition.',
            'Write a compelling meta description of 120–155 characters that '
            'summarises the page value and includes a call to action.',
            'You control what users read before clicking. Directly impacts CTR.',
            ['meta_description', 'description_length'],
        ))
    elif desc_px > 920 or desc_len > 155:
        recs.append(_r(
            2, 'Titles & Meta', SEVERITY_WARNING,
            f'Meta description too long ({desc_len} chars)',
            'Your meta description will be truncated by Google before the end '
            f'of your message (limit ~155 chars / 920px).',
            'Trim to under 155 characters. Put the most important callout '
            'in the first 120 characters.',
            'Full description shown — your CTA reaches users before they click.',
            ['meta_description', 'description_length'],
        ))

    return recs


def _check_headings(page: Dict[str, Any], fields: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    h1_tags = page.get('h1_tags') or []
    pm = fields.get('page_matrix') or {}
    header_issues = pm.get('headerIssues') or []

    if len(h1_tags) == 0:
        recs.append(_r(
            3, 'Heading Structure', SEVERITY_CRITICAL,
            'Page has no H1 heading',
            'There is no H1 tag on this page. The H1 is the strongest '
            'on-page signal Google uses to understand what the page is about.',
            'Add exactly one H1 tag at the top of the main content area, '
            'containing the primary keyword for this page.',
            'Google has a clear content signal; page relevance for target '
            'keywords improves.',
            ['h1_tags'],
        ))
    elif len(h1_tags) > 1:
        h1_sample = ', '.join("'" + t[:30].replace('\n', ' ') + "'" for t in h1_tags[:3])
        recs.append(_r(
            3, 'Heading Structure', SEVERITY_WARNING,
            f'Page has {len(h1_tags)} H1 headings (should be exactly 1)',
            f'Multiple H1 tags ({h1_sample}) '
            'dilute the keyword signal. Google expects one primary topic per page.',
            'Keep only the most important H1 (your primary keyword phrase). '
            'Convert the others to H2 or H3.',
            'Single, clear content topic — better keyword relevance.',
            ['h1_tags'],
        ))

    # Surface explicit header issues from pagematrix
    skipped_levels = [i for i in header_issues if 'skipped' in i.lower() or 'skip' in i.lower()]
    empty_headings = [i for i in header_issues if 'empty' in i.lower()]

    if skipped_levels:
        recs.append(_r(
            3, 'Heading Structure', SEVERITY_INFO,
            'Heading levels are skipped (e.g. H1 → H3)',
            'The heading hierarchy has gaps (e.g. H1 directly to H3 with no H2). '
            'This breaks the page outline and can confuse both Google and '
            'screen readers.',
            'Ensure headings follow sequential order: H1 → H2 → H3. '
            'Do not skip levels.',
            'Clean heading structure improves accessibility and content clarity.',
            ['heading_structure'],
        ))

    if empty_headings:
        recs.append(_r(
            3, 'Heading Structure', SEVERITY_WARNING,
            'Empty heading tags found',
            'One or more heading tags contain no text. Empty headings confuse '
            'content structure and waste keyword placement opportunities.',
            'Remove empty heading tags or add meaningful text to them.',
            'Cleaner content structure.',
            ['heading_structure'],
        ))

    return recs


def _check_content(page: Dict[str, Any], fields: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    word_count = page.get('word_count', 0) or 0
    wc_analysis = fields.get('Wordcount_analysis') or {}
    visible_wc = wc_analysis.get('visibleWordCount', word_count) or word_count
    thin = wc_analysis.get('thinContent', False)
    thin_reason = wc_analysis.get('thinContentReason', '')
    near_dup = page.get('near_duplicate_count', 0) or 0
    closest_dup = page.get('closest_duplicate_url') or ''
    dup_sim = page.get('closest_duplicate_similarity', 0) or 0

    wc_data = (fields.get('website_crawler') or {})
    flesch = wc_data.get('flesch_reading_ease_score', 70) or 70

    if thin or visible_wc < 250:
        reason_txt = f' ({thin_reason})' if thin_reason else ''
        recs.append(_r(
            4, 'Content Quality', SEVERITY_WARNING,
            f'Thin content — only {visible_wc} visible words{reason_txt}',
            f'This page has {visible_wc} visible words, which Google considers '
            'thin content. Thin pages are typically de-ranked or excluded from '
            'the index. They also drag down the domain\'s overall quality score.',
            'Expand the page to at least 400–600 words of unique, useful content. '
            'Add a "What\'s included" section, customer use cases, or an FAQ block.',
            'Page moves from "thin" to substantive — eligible for ranking '
            'on competitive keywords. Site-wide quality score improves.',
            ['word_count', 'thinContent', 'visibleWordCount'],
        ))

    if near_dup > 0 and closest_dup:
        sim_pct = int(dup_sim * 100) if dup_sim <= 1 else int(dup_sim)
        recs.append(_r(
            4, 'Content Quality', SEVERITY_WARNING,
            f'Near-duplicate content ({sim_pct}% similar to another page)',
            f'This page is {sim_pct}% similar to "{closest_dup}". Google splits '
            'ranking signals between them. Neither page ranks as strongly as '
            'a single consolidated page would.',
            'Option A: Merge the two pages into one authoritative page and '
            '301-redirect the weaker URL. '
            'Option B: Differentiate them — different audience, depth, or angle.',
            'Ranking positions typically improve 4–8 spots after consolidation.',
            ['near_duplicate_count', 'closest_duplicate_url', 'content_hash'],
        ))

    if flesch < 30:
        recs.append(_r(
            4, 'Content Quality', SEVERITY_INFO,
            f'Content is very hard to read (Flesch score: {flesch:.0f})',
            f'Flesch Reading Ease score of {flesch:.0f} means professional or '
            'academic reading level. If your audience is general consumers, '
            'this increases bounce rate and reduces engagement.',
            'Break long sentences into shorter ones (target: 15–20 words). '
            'Replace jargon with plain language. Use bullet points and subheadings.',
            'Lower bounce rate, longer dwell time — both positive ranking signals.',
            ['flesch_reading_ease_score', 'readabilityLevel'],
        ))

    spelling = wc_data.get('spelling_errors', 0) or 0
    grammar = wc_data.get('grammar_errors', 0) or 0
    if spelling + grammar > 5:
        recs.append(_r(
            4, 'Content Quality', SEVERITY_INFO,
            f'{spelling} spelling and {grammar} grammar errors detected',
            'A high error count signals low content quality to users and '
            'reduces trust. Google\'s quality rater guidelines explicitly '
            'penalise poor writing quality.',
            'Run the page content through a grammar checking tool (e.g. '
            'Grammarly) and correct the flagged issues.',
            'Improved trust and content quality signals.',
            ['spelling_errors', 'grammar_errors'],
        ))

    return recs


def _check_structured_data(page: Dict[str, Any], fields: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    has_sd = page.get('has_structured_data', False)
    sd_types = page.get('structured_data_types') or []
    has_faq = page.get('has_faq', False)
    pm = fields.get('page_matrix') or {}
    pm_sd = pm.get('structuredDataDetection') or {}
    faq_schema_present = (pm.get('faqs') or {}).get('faqSchemaPresent', False)

    content_type = (page.get('content_type') or '').lower()

    if not has_sd:
        recs.append(_r(
            5, 'Structured Data', SEVERITY_WARNING,
            'No structured data (JSON-LD schema) found',
            'This page has no JSON-LD schema markup. Structured data helps '
            'Google understand your content and unlocks rich results '
            '(star ratings, FAQ dropdowns, breadcrumbs) in SERP.',
            'Add the appropriate JSON-LD schema for this page type: '
            'Article for blog posts, Product for product pages, '
            'FAQPage for FAQ content, Organization for the homepage.',
            'Eligibility for rich results — +20–30% CTR on average for '
            'pages earning rich snippets.',
            ['has_structured_data', 'structured_data_types'],
        ))
    elif has_faq and not faq_schema_present:
        recs.append(_r(
            5, 'Structured Data', SEVERITY_WARNING,
            'FAQ content found but FAQPage schema is missing',
            'This page contains FAQ-style content (detected via HTML patterns or '
            'heading structure) but has no FAQPage JSON-LD schema. You\'re leaving '
            'FAQ rich results (expandable Q&A in Google SERP) on the table.',
            'Add FAQPage JSON-LD schema wrapping your Q&A pairs. Each question '
            'needs a "Question" and "acceptedAnswer" entry.',
            'FAQ rich results double your SERP footprint without any ranking '
            'improvement needed.',
            ['has_faq', 'faq_count', 'structured_data_types'],
        ))

    return recs


def _check_performance(page: Dict[str, Any], fields: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    response_time = page.get('response_time', 0) or 0
    size_bytes = page.get('page_size_bytes', 0) or 0
    wc_data = fields.get('website_crawler') or {}
    carbon_rating = wc_data.get('carbon_rating', 'A') or 'A'
    transferred = wc_data.get('transferred_bytes', 0) or 0

    if response_time > 1.5:
        recs.append(_r(
            6, 'Page Speed', SEVERITY_WARNING,
            f'Slow server response time ({response_time:.2f}s)',
            f'Server responded in {response_time:.2f}s. Google\'s threshold '
            'for "fast" is under 0.8s (TTFB). Slow TTFB directly reduces '
            'Core Web Vitals scores, which are a confirmed ranking factor.',
            'Investigate server-side bottlenecks: slow database queries, '
            'missing caching, or under-resourced hosting. Enable server-side '
            'caching (Redis/Varnish) and a CDN for static assets.',
            'Each 100ms improvement correlates with ~1% more conversions '
            '(Google/Deloitte). Core Web Vitals score improves.',
            ['response_time'],
        ))

    if size_bytes > 1_500_000:
        size_kb = size_bytes // 1024
        recs.append(_r(
            6, 'Page Speed', SEVERITY_WARNING,
            f'Page HTML is very large ({size_kb:,} KB)',
            f'The uncompressed HTML is {size_kb:,} KB. Large HTML causes slow '
            'parsing and delayed rendering, especially on mobile.',
            'Remove unused HTML, inline styles and scripts. Minify HTML. '
            'Move large inline SVGs to external files.',
            'Faster Time-to-Interactive, better Largest Contentful Paint (LCP).',
            ['page_size_bytes', 'html_size_bytes'],
        ))

    if carbon_rating in ('D', 'E', 'F'):
        recs.append(_r(
            6, 'Page Speed', SEVERITY_INFO,
            f'Poor carbon efficiency rating ({carbon_rating})',
            f'This page has a carbon rating of {carbon_rating}, indicating '
            'high energy use per page visit. This correlates with page bloat '
            'and slow load times.',
            'Enable Brotli or gzip compression on your server. Compress images. '
            'Reduce transferred payload size.',
            f'Carbon rating improves. Transferred size typically drops 60–70% '
            'with Brotli, directly improving load speed.',
            ['co2_mg', 'carbon_rating', 'transferred_bytes'],
        ))

    return recs


def _check_open_graph(page: Dict[str, Any], fields: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    wc_data = fields.get('website_crawler') or {}
    og_title = wc_data.get('og_title') or page.get('og_title') or ''
    og_desc = wc_data.get('og_description') or page.get('og_description') or ''
    og_image = wc_data.get('og_image') or page.get('og_image') or ''

    missing = []
    if not og_title:
        missing.append('og:title')
    if not og_desc:
        missing.append('og:description')
    if not og_image:
        missing.append('og:image')

    if missing:
        recs.append(_r(
            7, 'Open Graph', SEVERITY_INFO,
            f'Missing Open Graph tags: {", ".join(missing)}',
            'When this page is shared on LinkedIn, Twitter, Slack or Facebook, '
            'it will show a blank/generic card — drastically reducing click-through '
            'from social platforms.',
            'Add the missing OG tags to the <head>. '
            'og:image should be 1200×630px for best cross-platform display. '
            'og:title and og:description should be tailored for social context.',
            'Branded social share cards can increase social link CTR 3–5×.',
            ['og_title', 'og_description', 'og_image'],
        ))
    elif not og_image:
        recs.append(_r(
            7, 'Open Graph', SEVERITY_INFO,
            'Missing og:image — social shares will show no image',
            'og:title and og:description are present but og:image is missing. '
            'Image cards receive dramatically more engagement than text-only cards.',
            'Add og:image with a 1200×630px branded image relevant to this page.',
            'Social shares show a visual card — significantly boosts engagement.',
            ['og_image'],
        ))

    return recs


def _check_security_mobile(page: Dict[str, Any]) -> List[Dict[str, Any]]:
    recs = []
    has_mixed = page.get('has_mixed_content', False)
    mixed_urls = page.get('mixed_content_urls') or []
    viewport = page.get('viewport') or ''

    if has_mixed:
        examples = mixed_urls[:2]
        example_txt = f' (e.g. {examples[0]})' if examples else ''
        recs.append(_r(
            8, 'Security & Mobile', SEVERITY_WARNING,
            f'Mixed content detected ({len(mixed_urls)} HTTP resources on HTTPS page)',
            f'This HTTPS page loads {len(mixed_urls)} resource(s) over HTTP'
            f'{example_txt}. Browsers block active mixed content (scripts, '
            'iframes) silently, breaking functionality. Users see a security '
            'warning in the address bar.',
            'Update all resource URLs from http:// to https://. '
            'Check images, scripts, stylesheets, and iframes.',
            'Security warnings disappear. Blocked scripts start executing. '
            'User trust improves.',
            ['has_mixed_content', 'mixed_content_urls'],
        ))

    if not viewport:
        recs.append(_r(
            8, 'Security & Mobile', SEVERITY_CRITICAL,
            'Missing viewport meta tag — page will not render correctly on mobile',
            'There is no <meta name="viewport"> tag. Mobile browsers will render '
            'this page at desktop width and scale it down — tiny text, broken '
            'layout. Google mobile-first indexing means this hurts rankings '
            'for ALL users, not just mobile.',
            'Add <meta name="viewport" content="width=device-width, initial-scale=1"> '
            'to the <head> section.',
            'Page renders correctly on mobile. Mobile-first indexing works '
            'properly. Significant ranking improvement expected.',
            ['viewport', 'viewportPresent'],
        ))

    return recs


# ---------------------------------------------------------------------------
# Health Score Calculation
# ---------------------------------------------------------------------------

def _calculate_health_score(recommendations: List[Dict[str, Any]]) -> int:
    """
    Score from 0–100:
    - Start at 100
    - Deduct points per issue weighted by severity
    - Never below 0
    """
    deduction = sum(SEVERITY_WEIGHT[r['severity']] for r in recommendations)
    return max(0, 100 - deduction)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_recommendations(page_item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Given a fully-assembled page_item (after all extractors and module A
    post-processing but before yield), generate a recommendations document.

    Args:
        page_item: The assembled Scrapy PageItem dict. Must include a
                   'fields' key containing the enriched module A data.

    Returns:
        Dict with keys:
            recommendations  — list of recommendation dicts (sorted by priority)
            health_score     — int 0–100
            summary          — counts by severity and category
    """
    fields = page_item.get('fields') or {}

    all_recs: List[Dict[str, Any]] = []
    all_recs.extend(_check_indexability(page_item))
    all_recs.extend(_check_titles(page_item, fields))
    all_recs.extend(_check_headings(page_item, fields))
    all_recs.extend(_check_content(page_item, fields))
    all_recs.extend(_check_structured_data(page_item, fields))
    all_recs.extend(_check_performance(page_item, fields))
    all_recs.extend(_check_open_graph(page_item, fields))
    all_recs.extend(_check_security_mobile(page_item))

    # Sort by priority ascending, then severity (critical first within same priority)
    severity_order = {SEVERITY_CRITICAL: 0, SEVERITY_WARNING: 1, SEVERITY_INFO: 2}
    all_recs.sort(key=lambda r: (r['priority'], severity_order[r['severity']]))

    health_score = _calculate_health_score(all_recs)

    summary = {
        'total': len(all_recs),
        'critical': sum(1 for r in all_recs if r['severity'] == SEVERITY_CRITICAL),
        'warning': sum(1 for r in all_recs if r['severity'] == SEVERITY_WARNING),
        'info': sum(1 for r in all_recs if r['severity'] == SEVERITY_INFO),
        'by_category': {},
    }
    for rec in all_recs:
        cat = rec['category']
        summary['by_category'][cat] = summary['by_category'].get(cat, 0) + 1

    return {
        'recommendations': all_recs,
        'health_score': health_score,
        'summary': summary,
    }
