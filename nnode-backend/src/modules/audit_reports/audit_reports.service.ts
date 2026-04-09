import { connectToMongo } from '../../config/mongo';
import { JobRepository } from '../job/job.repository';
import { logger } from '../../shared/logger/logger';
import type { AuditCategory, AuditIssue, AuditReport, AuditReportResponse, AuditSeverity } from './audit_reports.types';

const TOP_URL_LIMIT = 5;
// Reports younger than 30 minutes are served from cache
const CACHE_TTL_MS = 30 * 60 * 1000;

// ─── helpers ────────────────────────────────────────────────────────────────

function makeIssue(
  id: string,
  category: AuditCategory,
  severity: AuditSeverity,
  title: string,
  description: string,
  fix: string,
  urls: string[],
): AuditIssue {
  return {
    id,
    category,
    severity,
    title,
    description,
    affected_count: urls.length,
    example_urls: urls.slice(0, TOP_URL_LIMIT),
    fix,
  };
}

// ─── Issue detectors ─────────────────────────────────────────────────────────

function detectTechnicalIssues(pages: any[], fieldsMap: Map<string, any>): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // 1. Broken pages (4xx / 5xx)
  const brokenPages = pages.filter((p) => {
    const code = p.status_code ?? p.statusCode ?? 0;
    return code >= 400;
  });
  if (brokenPages.length > 0) {
    const critical4xx = brokenPages.filter((p) => {
      const code = p.status_code ?? p.statusCode ?? 0;
      return code >= 400 && code < 500;
    });
    const server5xx = brokenPages.filter((p) => {
      const code = p.status_code ?? p.statusCode ?? 0;
      return code >= 500;
    });
    if (critical4xx.length > 0) {
      issues.push(makeIssue(
        'broken_pages_4xx', 'technical', 'critical',
        'Broken Pages (4xx Errors)',
        `${critical4xx.length} page(s) returned 4xx errors. These damage user experience, waste crawl budget, and signal poor site health to search engines.`,
        'Restore missing content, implement proper 301 redirects to relevant replacement pages, or remove internal links pointing to these URLs.',
        critical4xx.map((p) => p.url),
      ));
    }
    if (server5xx.length > 0) {
      issues.push(makeIssue(
        'broken_pages_5xx', 'technical', 'critical',
        'Server Error Pages (5xx)',
        `${server5xx.length} page(s) returned server errors. This indicates backend or infrastructure issues that must be resolved immediately.`,
        'Investigate server logs, database connections, and application errors. These pages must be stabilized or redirected.',
        server5xx.map((p) => p.url),
      ));
    }
  }

  // 2. Missing title tags
  const missingTitle = pages.filter((p) => {
    const len = p.title_length ?? p.titleLength ?? 0;
    const title = p.title ?? '';
    return len === 0 || !title;
  });
  if (missingTitle.length > 0) {
    issues.push(makeIssue(
      'missing_title', 'technical', 'critical',
      'Missing Title Tags',
      `${missingTitle.length} page(s) are missing <title> tags. Title tags are the single most important on-page SEO element and are displayed directly in search results.`,
      'Add unique, descriptive title tags (50–60 characters) to every page. Include the primary keyword near the start.',
      missingTitle.map((p) => p.url),
    ));
  }

  // 3. Missing meta descriptions
  const missingMeta = pages.filter((p) => {
    const len = p.description_length ?? p.descriptionLength ?? 0;
    return len === 0;
  });
  if (missingMeta.length > 0) {
    issues.push(makeIssue(
      'missing_meta_description', 'technical', 'warning',
      'Missing Meta Descriptions',
      `${missingMeta.length} page(s) lack meta descriptions. While not a direct ranking factor, missing descriptions reduce click-through rates from search results.`,
      'Write compelling meta descriptions (150–160 characters) for all indexable pages. Focus on the page value proposition.',
      missingMeta.map((p) => p.url),
    ));
  }

  // 4. Duplicate title tags
  const titleGroups: Record<string, string[]> = {};
  pages.forEach((p) => {
    const t = (p.title ?? '').trim().toLowerCase();
    if (t) {
      if (!titleGroups[t]) titleGroups[t] = [];
      titleGroups[t].push(p.url);
    }
  });
  const duplicateTitleUrls = Object.values(titleGroups)
    .filter((g) => g.length > 1)
    .flat();
  if (duplicateTitleUrls.length > 0) {
    issues.push(makeIssue(
      'duplicate_titles', 'technical', 'warning',
      'Duplicate Title Tags',
      `${duplicateTitleUrls.length} page(s) share identical title tags. Duplicate titles confuse search engines about which page to rank for a query.`,
      'Ensure every page has a unique, descriptive title tag that accurately reflects its specific content.',
      duplicateTitleUrls,
    ));
  }

  // 5. Missing canonical URL
  const missingCanonical = pages.filter((p) => {
    const canon = p.canonical_url ?? p.canonicalUrl ?? '';
    return !canon;
  });
  if (missingCanonical.length > 0) {
    issues.push(makeIssue(
      'missing_canonical', 'technical', 'warning',
      'Missing Canonical Tags',
      `${missingCanonical.length} page(s) are missing canonical URL declarations. Without canonicals, search engines may index multiple URL variations as duplicate content.`,
      'Add a self-referencing <link rel="canonical"> tag to every page to consolidate ranking signals.',
      missingCanonical.map((p) => p.url),
    ));
  }

  // 6. Redirect pages (3xx)
  const redirectPages = pages.filter((p) => {
    const code = p.status_code ?? p.statusCode ?? 0;
    return code >= 300 && code < 400;
  });
  if (redirectPages.length > 0) {
    issues.push(makeIssue(
      'redirect_pages', 'technical', 'warning',
      'Pages with Redirects',
      `${redirectPages.length} URL(s) return redirect responses (3xx). Redirect chains pass less link equity and waste crawl budget. Internal links should target the final destination directly.`,
      'Update internal links to point directly to the final destination URL. Avoid redirect chains longer than one hop.',
      redirectPages.map((p) => p.url),
    ));
  }

  // 7. Noindex pages
  const noindexPages = pages.filter((p) => {
    const robots = (p.meta_robots ?? p.metaRobots ?? '').toLowerCase();
    const xRobots = (p.x_robots_tag ?? p.xRobotsTag ?? '').toLowerCase();
    const indexable = p.indexable;
    return robots.includes('noindex') || xRobots.includes('noindex') || indexable === false;
  });
  if (noindexPages.length > 0) {
    issues.push(makeIssue(
      'noindex_pages', 'technical', 'info',
      'Noindex Pages',
      `${noindexPages.length} page(s) are excluded from search engine indexing via noindex directives. Review to confirm these exclusions are intentional.`,
      'Audit each noindex page. Remove the directive for pages you want indexed. Keep it for admin, staging, or duplicate utility pages.',
      noindexPages.map((p) => p.url),
    ));
  }

  // 8. Slow pages (response_time > 3000ms)
  const slowPages = pages.filter((p) => {
    const rt = p.response_time ?? p.responseTime ?? 0;
    return rt > 3000;
  });
  if (slowPages.length > 0) {
    issues.push(makeIssue(
      'slow_pages', 'technical', 'warning',
      'Slow Server Response Time (> 3s)',
      `${slowPages.length} page(s) took over 3 seconds to respond. Slow TTFB is a Core Web Vitals signal and directly impacts rankings and user experience.`,
      'Optimize server response time: enable HTTP/2, use a CDN, implement server-side caching, and review database query performance.',
      slowPages.map((p) => p.url),
    ));
  }

  // 9. Large pages (> 1MB)
  const largePages = pages.filter((p) => {
    const size = p.page_size_bytes ?? p.sizeBytes ?? 0;
    return size > 1_000_000;
  });
  if (largePages.length > 0) {
    issues.push(makeIssue(
      'large_pages', 'technical', 'warning',
      'Oversized Page Weight (> 1MB)',
      `${largePages.length} page(s) exceed 1MB in transfer size. Large pages significantly slow load times, especially on mobile connections.`,
      'Compress images with WebP/AVIF, minify CSS and JavaScript, remove unused scripts, and implement lazy loading.',
      largePages.map((p) => p.url),
    ));
  }

  // 10. Missing viewport (from fields page_matrix)
  const missingViewport: string[] = [];
  const mixedContentPages: string[] = [];
  const missingH1Pages: string[] = [];

  for (const page of pages) {
    const fieldDoc = fieldsMap.get(page.url);
    if (!fieldDoc) continue;
    const fieldData = fieldDoc.fields ?? fieldDoc;
    const pageMatrix = fieldData.page_matrix ?? {};
    const crawlerData = fieldData.website_crawler ?? {};

    // Viewport
    const vpData = pageMatrix.viewport ?? {};
    if (vpData.hasViewport === false) {
      missingViewport.push(page.url);
    }

    // Mixed content
    const mcData = pageMatrix.mixedContent ?? {};
    if (mcData.hasMixedContent === true) {
      mixedContentPages.push(page.url);
    }

    // Missing H1
    const headings: Array<{ level: number }> = crawlerData.heading_structure ?? [];
    const hasH1 = headings.some((h) => h.level === 1);
    if (!hasH1 && headings.length === 0 && !page.has_h1) {
      // Only flag if we have heading structure data to avoid false positives
    } else if (!hasH1 && headings.length > 0) {
      missingH1Pages.push(page.url);
    }
  }

  if (missingViewport.length > 0) {
    issues.push(makeIssue(
      'missing_viewport', 'technical', 'warning',
      'Missing Viewport Meta Tag',
      `${missingViewport.length} page(s) are missing the viewport meta tag, breaking mobile rendering. This is a mobile-friendliness ranking factor.`,
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head> of every page.',
      missingViewport,
    ));
  }

  if (mixedContentPages.length > 0) {
    issues.push(makeIssue(
      'mixed_content', 'technical', 'warning',
      'Mixed Content (HTTP on HTTPS Pages)',
      `${mixedContentPages.length} HTTPS page(s) load insecure HTTP resources. Browsers block mixed content, causing broken images, scripts, and styles plus security warnings.`,
      'Update all embedded resource URLs (images, scripts, stylesheets, iframes) to use HTTPS.',
      mixedContentPages,
    ));
  }

  if (missingH1Pages.length > 0) {
    issues.push(makeIssue(
      'missing_h1', 'technical', 'warning',
      'Missing H1 Heading',
      `${missingH1Pages.length} page(s) are missing an H1 heading. The H1 is the primary on-page signal for topic relevance to search engines and screen readers.`,
      'Add a single, descriptive H1 heading to each page that clearly reflects the page topic and includes the primary keyword.',
      missingH1Pages,
    ));
  }

  return issues.filter((i) => i.affected_count > 0);
}

function detectContentIssues(pages: any[], fieldsMap: Map<string, any>): AuditIssue[] {
  const issues: AuditIssue[] = [];

  const thinContentUrls: string[] = [];
  const dupContentUrls: string[] = [];
  const lowReadabilityUrls: string[] = [];
  const grammarErrorUrls: string[] = [];
  const missingOgUrls: string[] = [];

  for (const page of pages) {
    const wordCount = page.word_count ?? page.wordCount ?? 0;
    const ogTitle = page.og_title ?? '';
    const statusCode = page.status_code ?? page.statusCode ?? 0;
    // Only audit indexable HTML pages
    if (statusCode >= 400) continue;

    // Missing OG tags
    if (!ogTitle) missingOgUrls.push(page.url);

    const fieldDoc = fieldsMap.get(page.url);
    if (!fieldDoc) {
      // Fall back to raw page data
      if (wordCount > 0 && wordCount < 300) thinContentUrls.push(page.url);
      continue;
    }

    const fieldData = fieldDoc.fields ?? fieldDoc;
    const crawlerData = fieldData.website_crawler ?? {};
    const wordCountData = fieldData.Wordcount_analysis ?? {};

    // Thin content
    const isThin = wordCountData.thinContent === true ||
      (wordCountData.totalWordCount ?? wordCount) < 300;
    if (isThin) thinContentUrls.push(page.url);

    // Duplicate / near-duplicate content
    const isDup = wordCountData.duplicateContent === true ||
      (crawlerData.no_near_duplicates ?? 0) > 0;
    if (isDup) dupContentUrls.push(page.url);

    // Low readability
    const flesch = crawlerData.flesch_reading_ease_score ?? 0;
    if (flesch > 0 && flesch < 30) lowReadabilityUrls.push(page.url);

    // Grammar / spelling errors
    const grammarErrs = crawlerData.grammar_errors ?? 0;
    const spellingErrs = crawlerData.spelling_errors ?? 0;
    if (grammarErrs > 0 || spellingErrs > 0) grammarErrorUrls.push(page.url);
  }

  if (thinContentUrls.length > 0) {
    issues.push(makeIssue(
      'thin_content', 'content', 'warning',
      'Thin Content Pages (< 300 words)',
      `${thinContentUrls.length} page(s) contain fewer than 300 words. Thin content rarely earns organic rankings or AI citations, and excess thin pages dilute overall domain quality.`,
      'Expand content depth: add authoritative detail, expert insights, or supplementary media. Merge very thin pages into a single comprehensive resource, or noindex utility pages.',
      thinContentUrls,
    ));
  }

  if (dupContentUrls.length > 0) {
    issues.push(makeIssue(
      'duplicate_content', 'content', 'warning',
      'Duplicate / Near-Duplicate Content',
      `${dupContentUrls.length} page(s) share highly similar content with other pages. Duplicate content prevents clear signal consolidation and can trigger quality filters.`,
      'Canonicalize duplicates to the primary version. Consolidate near-duplicates into a single comprehensive resource, or differentiate them with unique angles.',
      dupContentUrls,
    ));
  }

  if (lowReadabilityUrls.length > 0) {
    issues.push(makeIssue(
      'low_readability', 'content', 'info',
      'Low Readability Score (Flesch < 30)',
      `${lowReadabilityUrls.length} page(s) score below 30 on the Flesch Reading Ease scale — classified as "Very Difficult." AI engines favour clear, comprehensible content that can be cited as answers.`,
      'Simplify sentences (target average 15–20 words), break long paragraphs, use bullet points for lists, and define technical terms inline.',
      lowReadabilityUrls,
    ));
  }

  if (grammarErrorUrls.length > 0) {
    issues.push(makeIssue(
      'grammar_errors', 'content', 'info',
      'Grammar / Spelling Errors Detected',
      `${grammarErrorUrls.length} page(s) contain detectable grammar or spelling errors. Errors undermine E-E-A-T (Experience, Expertise, Authoritativeness, Trust) signals.`,
      'Proofread and correct errors on all affected pages. Use a grammar tool (Grammarly, LanguageTool) as part of your content publishing workflow.',
      grammarErrorUrls,
    ));
  }

  if (missingOgUrls.length > 0) {
    issues.push(makeIssue(
      'missing_og_tags', 'content', 'info',
      'Missing Open Graph Tags',
      `${missingOgUrls.length} page(s) lack og:title or og:description. Missing OG data causes poor-quality social media previews, reducing click-through from shares.`,
      'Add og:title, og:description, og:image, and og:url to all key pages using your CMS or a plugin.',
      missingOgUrls,
    ));
  }

  return issues.filter((i) => i.affected_count > 0);
}

async function detectStructuredDataIssues(
  db: any,
  jobId: string,
  pages: any[],
  fieldsMap: Map<string, any>,
): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];

  // Pages without any schema markup
  const noSchemaPages: string[] = [];
  const faqPagesNoSchema: string[] = [];

  for (const page of pages) {
    const code = page.status_code ?? page.statusCode ?? 0;
    if (code >= 400) continue;

    const fieldDoc = fieldsMap.get(page.url);
    const fieldData = fieldDoc ? (fieldDoc.fields ?? fieldDoc) : {};
    const pageMatrix = fieldData.page_matrix ?? {};
    const sdDetection = pageMatrix.structuredDataDetection ?? {};
    const hasSD = sdDetection.hasStructuredData ?? page.has_structured_data ?? false;

    if (!hasSD) {
      noSchemaPages.push(page.url);
    }

    // FAQ pages with no schema
    const faqData = pageMatrix.faqs ?? {};
    const sdItems: any[] = sdDetection.items ?? [];
    const hasFaqSchema = sdItems.some((i: any) =>
      (i.type ?? i.schemaType ?? '').toLowerCase().includes('faq'),
    );
    if (faqData.hasFaqs === true && !hasFaqSchema) {
      faqPagesNoSchema.push(page.url);
    }
  }

  if (noSchemaPages.length > 0) {
    issues.push(makeIssue(
      'missing_schema', 'structured_data', 'warning',
      'Pages Without Structured Data Markup',
      `${noSchemaPages.length} page(s) have no schema.org JSON-LD markup. Structured data enables rich results, improves AI engine comprehension, and increases citation eligibility.`,
      'Implement appropriate JSON-LD schema types per page template: Article for blog posts, Product for e-commerce, Organization for the homepage, FAQ for Q&A sections.',
      noSchemaPages,
    ));
  }

  if (faqPagesNoSchema.length > 0) {
    issues.push(makeIssue(
      'missing_faq_schema', 'structured_data', 'info',
      'FAQ Content Without FAQPage Schema',
      `${faqPagesNoSchema.length} page(s) contain FAQ-style content but lack FAQPage JSON-LD markup. FAQPage schema enables rich accordion results in Google and signals answer-readiness to AI engines.`,
      'Add FAQPage JSON-LD with Question/Answer pairs matching the on-page FAQ content. Keep questions identical to the visible text.',
      faqPagesNoSchema,
    ));
  }

  // Schema validation errors from the schemas collection
  try {
    const schemaErrors = await db
      .collection('schemas')
      .find({ jobId, error_count: { $gt: 0 } })
      .limit(200)
      .toArray();

    if (schemaErrors.length > 0) {
      const errorUrls: string[] = schemaErrors
        .map((s: any) => s.url)
        .filter(Boolean);
      issues.push(makeIssue(
        'schema_validation_errors', 'structured_data', 'critical',
        'Schema Validation Errors',
        `${errorUrls.length} page(s) contain schema markup with validation errors. Invalid structured data is ignored by search engines and may be penalised in rich-result eligibility.`,
        'Open each URL in Google\'s Rich Results Test tool. Fix all required property violations and type mismatches. Validate corrected markup before re-deploying.',
        errorUrls,
      ));
    }
  } catch (err: any) {
    logger.warn(`[AUDIT_REPORT] schema error query failed: ${err.message}`);
  }

  // Check for llms.txt presence
  try {
    const llmsTxtPage = await db
      .collection('pages')
      .findOne({ jobId, url: /\/llms\.txt$/i });
    if (!llmsTxtPage) {
      issues.push({
        id: 'missing_llms_txt',
        category: 'structured_data',
        severity: 'info',
        title: 'No llms.txt File Detected',
        description:
          'Your site does not appear to serve an /llms.txt file. This emerging standard lets site owners declare which content AI crawlers may use for training and citation.',
        affected_count: 1,
        example_urls: [],
        fix: 'Create /llms.txt at your root domain following the llms-txt.org specification. Declare your content licensing preferences and key reference URLs.',
      });
    }
  } catch (err: any) {
    logger.warn(`[AUDIT_REPORT] llms.txt check failed: ${err.message}`);
  }

  return issues.filter((i) => i.affected_count > 0);
}

// ─── Diff vs prior report ────────────────────────────────────────────────────

async function computeResolvedCount(
  db: any,
  projectId: string,
  currentIssueIds: Set<string>,
): Promise<number> {
  try {
    const prior = await db
      .collection('audit_reports')
      .find({ projectId })
      .sort({ generated_at: -1 })
      .limit(1)
      .next();

    if (!prior || !Array.isArray(prior.issues)) return 0;

    const priorIssueIds = new Set<string>(
      prior.issues.filter((i: any) => (i.affected_count ?? 0) > 0).map((i: any) => i.id),
    );

    let resolved = 0;
    for (const prevId of priorIssueIds) {
      if (!currentIssueIds.has(prevId)) resolved++;
    }
    return resolved;
  } catch {
    return 0;
  }
}

// ─── Public service ──────────────────────────────────────────────────────────

export class AuditReportsService {
  private jobRepository: JobRepository;

  constructor() {
    this.jobRepository = new JobRepository();
  }

  async getReport(_userId: string, jobId: string): Promise<AuditReportResponse> {
    const db = await connectToMongo();

    // Resolve cache source
    const effectiveJobId = await this.jobRepository.resolveEffectiveJobId(jobId);

    // Fetch job to get projectId
    const job = await db
      .collection('jobs')
      .findOne(
        { id: jobId },
        { projection: { projectId: 1, completedAt: 1, createdAt: 1 } },
      );
    if (!job) throw new Error(`Job ${jobId} not found`);

    const projectId = job.projectId as string;
    const crawlDate = (job.completedAt ?? job.createdAt ?? new Date()).toISOString();

    // Check cache
    const cached = await db
      .collection('audit_reports')
      .findOne({ jobId: effectiveJobId });

    const cacheHit =
      cached &&
      Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS;

    const hasPriorReport = await db
      .collection('audit_reports')
      .findOne({ projectId, jobId: { $ne: effectiveJobId } })
      .then((d: any) => !!d);

    if (cacheHit) {
      const { _id, ...reportData } = cached;
      return { report: reportData as any, has_prior_report: hasPriorReport };
    }

    // ── Fetch raw data ────────────────────────────────────────────────────
    const [rawPages, rawFields] = await Promise.all([
      db
        .collection('pages')
        .find({ jobId: effectiveJobId })
        .project({
          url: 1,
          status_code: 1,
          statusCode: 1,
          title: 1,
          title_length: 1,
          titleLength: 1,
          description_length: 1,
          descriptionLength: 1,
          meta_robots: 1,
          metaRobots: 1,
          x_robots_tag: 1,
          xRobotsTag: 1,
          canonical_url: 1,
          canonicalUrl: 1,
          response_time: 1,
          responseTime: 1,
          page_size_bytes: 1,
          sizeBytes: 1,
          word_count: 1,
          wordCount: 1,
          indexable: 1,
          has_structured_data: 1,
          og_title: 1,
          has_h1: 1,
        })
        .toArray(),
      db
        .collection('fields')
        .find({ jobId: effectiveJobId })
        .project({ url: 1, website_crawler: 1, Wordcount_analysis: 1, page_matrix: 1 })
        .toArray(),
    ]);

    // Build a URL-keyed map for fast field lookup
    const fieldsMap = new Map<string, any>();
    for (const f of rawFields) {
      if (f.url) fieldsMap.set(f.url, f);
    }

    // ── Run detectors ─────────────────────────────────────────────────────
    const [techIssues, contentIssues, sdIssues] = await Promise.all([
      Promise.resolve(detectTechnicalIssues(rawPages, fieldsMap)),
      Promise.resolve(detectContentIssues(rawPages, fieldsMap)),
      detectStructuredDataIssues(db, effectiveJobId, rawPages, fieldsMap),
    ]);

    const allIssues = [...techIssues, ...contentIssues, ...sdIssues];

    const currentIssueIds = new Set(
      allIssues.filter((i) => i.affected_count > 0).map((i) => i.id),
    );

    const resolvedSinceLast = await computeResolvedCount(db, projectId, currentIssueIds);

    const critical = allIssues.filter((i) => i.severity === 'critical').reduce((s, i) => s + i.affected_count, 0);
    const warning = allIssues.filter((i) => i.severity === 'warning').reduce((s, i) => s + i.affected_count, 0);
    const info = allIssues.filter((i) => i.severity === 'info').reduce((s, i) => s + i.affected_count, 0);

    const report: AuditReport = {
      jobId: effectiveJobId,
      projectId,
      crawl_date: crawlDate,
      generated_at: new Date().toISOString(),
      summary: {
        total: critical + warning + info,
        critical,
        warning,
        info,
        resolved_since_last: resolvedSinceLast,
      },
      issues: allIssues,
    };

    // ── Persist (upsert) ──────────────────────────────────────────────────
    await db
      .collection('audit_reports')
      .updateOne(
        { jobId: effectiveJobId },
        { $set: report },
        { upsert: true },
      );

    return { report, has_prior_report: hasPriorReport };
  }

  async listProjectReports(_userId: string, jobId: string): Promise<AuditReport[]> {
    const db = await connectToMongo();

    const job = await db
      .collection('jobs')
      .findOne({ id: jobId }, { projection: { projectId: 1 } });
    if (!job) return [];

    const reports = await db
      .collection('audit_reports')
      .find({ projectId: job.projectId })
      .sort({ generated_at: -1 })
      .limit(20)
      .project({ _id: 0, issues: 0 })
      .toArray();

    return reports as unknown as AuditReport[];
  }
}
