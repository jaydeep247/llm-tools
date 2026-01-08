
import { query } from '../../database/dbConnection.js';
import * as cheerio from 'cheerio';


interface Page {
    url: string;
    content: string; // Extracted text content (but apparently contains HTML)
    title: string;
    word_count: number;
    status_code: number;
}

interface AeoScoreResult {
    openai: number;
    claude: number;
    gemini: number;
    consistency?: number;
    brand_metrics?: any;
}

interface EntityAnalysisResult {
    score: number;
    entities_expected: string[];
    entities_observed: string[];
    entities_missing: string[];
}

export class MultiModelScoringService {
    private static readonly QUALIFIED_MIN_WORDS = 300;
    private static readonly MAX_AGGREGATED_CHARS = 15000;
    private static readonly BATCH_SIZE = 5;

    // Cache for expected entities and canonical topic to avoid redundant API calls per domain
    private static expectedEntitiesCache = new Map<string, string[]>();
    // Updated cache to store topic, brandName, audience, and tone
    private static canonicalTopicCache = new Map<string, { topic: string, brandName: string, audience: string, tone: string }>();

    // ... (keep selectQualifiedPages and aggregateContent as is) ...

    static selectQualifiedPages(pages: Page[]): Page[] {
        return pages.filter(page => {
            if (page.status_code !== 200) return false;
            if (page.word_count < this.QUALIFIED_MIN_WORDS) return false;

            const lowerUrl = page.url.toLowerCase();
            const excludePatterns = ['login', 'signin', 'register', 'cart', 'checkout', 'account', 'admin'];
            if (excludePatterns.some(p => lowerUrl.includes(p))) return false;

            return true;
        });
    }

    static aggregateContent(pages: Page[]): string {
        let aggregatedContext = '';
        const topPages = pages.sort((a, b) => b.word_count - a.word_count).slice(0, 5);
        for (const page of topPages) {
            const pageSummary = `
---
    URL: ${page.url}
TITLE: ${page.title}
CONTENT:
${page.content.substring(0, 3000)} ...[truncated]
---
    `;
            if ((aggregatedContext.length + pageSummary.length) > this.MAX_AGGREGATED_CHARS) {
                break;
            }
            aggregatedContext += pageSummary;
        }
        return aggregatedContext;
    }

    // ...

    /**
     * Robustly strips HTML, Scripts, Styles, and JSON-LD to return only visible text.
     */
    private static sanitizeContent(html: string): string {
        try {
            const $ = cheerio.load(html);

            // 1. Remove non-content structural/technical tags
            $('script, style, head, noscript, iframe, svg, link, meta, json-ld').remove();

            // 2. Extract text and clean up whitespace
            let text = $('body').text() || $.text(); // Fallback to root text if body is missing
            return text.replace(/\s+/g, ' ').trim();
        } catch (e) {
            console.warn('Cheerio sanitization failed, falling back to basic regex', e);
            return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    private static filterTechnicalArtifacts(entities: string[]): string[] {
        const bannedTerms = new Set([
            'rgba', 'linear-gradient', 'var', 'font-family', 'sans-serif', 'inter',
            'schema.org', 'organization', 'logo', 'url', 'http', 'https', 'www',
            'copyright', 'all rights reserved', 'menu', 'navigation', 'search',
            'login', 'signup', 'privacy policy', 'terms', 'social media', 'linkedin',
            'twitter', 'facebook', 'instagram', 'website', 'technology', 'technologies',
            'structured data', 'intl-tel-input', 'tel', 'input'
        ]);

        return entities.filter(e => {
            const lower = e.toLowerCase();
            if (bannedTerms.has(lower)) return false;
            // Filter CSS-like functions
            if (lower.includes('(') && lower.includes(')')) return false;
            // Filter URLs
            if (lower.includes('http') || lower.includes('.com') || lower.includes('.org')) return false;
            return true;
        });
    }

    static async generateWebsiteScores(url: string, pages: Page[], sessionId?: number) {
        // 1. Filter
        const qualifiedPages = this.selectQualifiedPages(pages);
        if (qualifiedPages.length === 0) {
            throw new Error('No qualified pages found for analysis.');
        }

        // 2. Aggregate (for Consistency/Performance)
        const context = this.aggregateContent(qualifiedPages);

        // 3. Parallel Execution
        const [scores, entityResult, consistencyResult] = await Promise.all([
            this.callAeoApi(context),
            this.runEntityAnalysis(pages, qualifiedPages),
            this.runContentConsistency(pages, qualifiedPages)
        ]);

        // Merge results
        scores.consistency = consistencyResult.score;

        // 4. Run Brand Analysis (Quick, 1-2s) - Only if we have a brand name
        if (consistencyResult.brandName) {
            scores.brand_metrics = await this.runBrandAnalysis(consistencyResult.brandName);
        }

        // 5. Save Combined Results to DB
        await this.saveScores(url, scores, entityResult, qualifiedPages.length, sessionId);

        return { ...scores, entity_coverage: entityResult };
    }

    // --- Content Consistency Workflow ---

    private static async runContentConsistency(allPages: Page[], qualifiedPages: Page[]): Promise<{ score: number, brandName?: string }> {
        try {
            const apiUrl = process.env.PY_API_BASE;
            const domainKey = allPages[0]?.url ? new URL(allPages[0].url).hostname : 'unknown_domain';

            // Simple fallback extraction: "www.example.com" -> "Example"
            const fallbackBrand = domainKey.replace('www.', '').split('.')[0].charAt(0).toUpperCase() + domainKey.replace('www.', '').split('.')[0].slice(1);

            // 1. Get Canonical Topic (Cached)
            let cached = this.canonicalTopicCache.get(domainKey);
            let topic = cached?.topic;
            let brandName = cached?.brandName || '';
            let audience = cached?.audience || 'General';
            let tone = cached?.tone || 'Neutral';

            if (!topic) {
                const { topicContext, fallbackContext } = this.getHomepageContext(allPages);
                const cleanContext = this.sanitizeContent(topicContext || fallbackContext || '').substring(0, 5000);

                if (!cleanContext.trim()) {
                    console.warn('⚠️ No text content for Canonical Topic. Consistency Score = 0.');
                    return { score: 0 };
                }

                const res = await fetch(`${apiUrl}/api/aeo/entity/consistency/generate-topic`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ context: cleanContext })
                });

                if (res.ok) {
                    const data = await res.json();
                    topic = data.topic;
                    brandName = data.brand_name || fallbackBrand;
                    audience = data.audience || 'General';
                    tone = data.tone || 'Neutral';

                    if (topic) {
                        this.canonicalTopicCache.set(domainKey, { topic, brandName, audience, tone });
                        console.log(`📌 Mandate for ${domainKey}: ${topic} | Audience: ${audience}`);
                    }
                }
            }

            if (!topic) {
                console.warn('failed to generate canonical topic');
                return { score: 0 };
            }

            // 2. Batch Scoring
            let totalScore = 0;
            let validBatches = 0;

            console.log(`📉 Scoring Content Consistency for ${qualifiedPages.length} pages...`);

            for (let i = 0; i < qualifiedPages.length; i += this.BATCH_SIZE) {
                const batch = qualifiedPages.slice(i, i + this.BATCH_SIZE);
                const batchContent = batch.map(p => this.sanitizeContent(p.content)).join('\n');
                const cleanBatch = batchContent.replace(/\s+/g, ' ').trim();

                if (cleanBatch.length < 500 || !cleanBatch) {
                    console.warn(`Skipping thin/empty consistency batch ${i}`);
                    continue;
                }

                try {
                    const res = await fetch(`${apiUrl}/api/aeo/entity/consistency/score-batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            topic,
                            audience,
                            tone,
                            content: cleanBatch.substring(0, 4000)
                        })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const score = data.score;
                        console.log(`Batch ${i} Consistency: ${score}/100`);
                        totalScore += score;
                        validBatches++;
                    }
                } catch (e) {
                    console.error(`Error scoring batch ${i}:`, e);
                }
            }

            const finalScore = validBatches > 0 ? Math.round(totalScore / validBatches) : 0;
            console.log(`✅ Final Content Consistency Score: ${finalScore}%`);
            return { score: finalScore, brandName };

        } catch (error) {
            console.error('❌ Content Consistency Analysis Failed:', error);
            return { score: 0 };
        }
    }

    private static async runBrandAnalysis(brandName: string): Promise<any> {
        try {
            console.log(`📊 Running Brand Analysis for: ${brandName}`);
            const apiUrl = process.env.PY_API_BASE || 'http://localhost:8001';

            const res = await fetch(`${apiUrl}/api/aeo/analyze-brand`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brand_name: brandName })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) return data.data;
            }
            console.warn('Brand Analysis API call failed');
            return null;
        } catch (e) {
            console.error('Brand Analysis Service Error:', e);
            return null;
        }
    }

    // --- Entity Coverage Workflow ---

    private static async runEntityAnalysis(allPages: Page[], qualifiedPages: Page[]): Promise<EntityAnalysisResult> {
        try {
            const apiUrl = process.env.PY_API_BASE || 'http://localhost:8001';

            // Step A: Homepage Context
            const { topicContext, fallbackContext } = this.getHomepageContext(allPages);

            // SANITIZE: Cheerio to strip HTML tags from FULL content first
            // Then truncate to 5000 chars of CLEAN text
            const cleanTopicContext = this.sanitizeContent(topicContext || '').substring(0, 5000);
            const cleanFallbackContext = this.sanitizeContent(fallbackContext || '').substring(0, 5000);

            // GUARD: Check for raw HTML leakage
            if (cleanTopicContext.includes('<html') || cleanTopicContext.includes('<meta')) {
                console.error('CRITICAL: HTML leaked through sanitizer!');
                throw new Error('HTML detected in Expected Entity context');
            }

            if (!cleanTopicContext && !cleanFallbackContext) {
                console.warn('⚠️ No text content found for context. Aborting entity analysis.');
                return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
            }

            // Step B: Expected Entities (With Caching)
            // Use the homepage URL as a cache key (assuming first page is home)
            const domainKey = allPages[0]?.url ? new URL(allPages[0].url).hostname : 'unknown_domain';

            let expectedEntities: string[] = [];

            if (this.expectedEntitiesCache.has(domainKey)) {
                console.log(`🧠 using cached expected entities for ${domainKey}`);
                expectedEntities = this.expectedEntitiesCache.get(domainKey)!;
            } else {
                console.log('🤖 Generating Expected Entities (Calling LLM)...');
                const expectedRes = await fetch(`${apiUrl}/api/aeo/entity/generate-expected`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ topic_context: cleanTopicContext, fallback_context: cleanFallbackContext })
                });

                if (!expectedRes.ok) {
                    console.warn(`⚠️ Generate Expected Failed: ${expectedRes.statusText}`);
                    return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
                }

                const expectedData = await expectedRes.json();
                let rawEntities = expectedData.entities || [];

                // FILTER: Remove technical artifacts BEFORE caching
                expectedEntities = this.filterTechnicalArtifacts(rawEntities);

                // Save to cache
                if (expectedEntities.length > 0) {
                    this.expectedEntitiesCache.set(domainKey, expectedEntities);
                }
            }

            if (expectedEntities.length === 0) {
                console.warn('⚠️ No expected entities generated. Aborting analysis.');
                return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
            }

            // Step C: Batch Observed Entities
            console.log(`👁️ Extracting Observed Entities from ${qualifiedPages.length} pages in batches...`);
            const observedSet = new Set<string>();

            // Process in batches
            for (let i = 0; i < qualifiedPages.length; i += this.BATCH_SIZE) {
                const batch = qualifiedPages.slice(i, i + this.BATCH_SIZE);

                // Sanitize batch content using Cheerio
                const batchContent = batch.map(p => `URL: ${p.url} \nCONTENT: ${this.sanitizeContent(p.content).substring(0, 4000)} `).join('\n---\n');

                if (!batchContent.trim()) {
                    console.log(`Skipping empty batch ${i} `);
                    continue; // Correct Fix 3: Skip empty batches
                }

                try {
                    const observedRes = await fetch(`${apiUrl}/api/aeo/entity/extract-observed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content_batch: batchContent })
                    });

                    if (observedRes.ok) {
                        const observedData = await observedRes.json();
                        const entities = observedData.entities || [];

                        // Guard against empty observed lists polluting the set (though not strictly "poisoning" like the score calculation, it's good practice)
                        if (entities.length > 0) {
                            entities.forEach((e: string) => observedSet.add(e));
                        }
                    } else {
                        console.warn(`Batch extraction failed: ${observedRes.statusText} `);
                    }
                } catch (e) {
                    console.error(`Batch extraction error: `, e);
                }
            }
            const observedList = Array.from(observedSet);

            // Guard: If we found absolute zero entities across ALL pages, that's weird but valid 0%
            // But we shouldn't calculate if we skipped ALL batches due to errors.
            // (Assuming at least one batch ran if qualifiedPages > 0)

            // Step D: Compare
            console.log('⚖️ Comparing Entity Coverage...');
            const compareRes = await fetch(`${apiUrl}/api/aeo/entity/compare-coverage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expected_list: expectedEntities, observed_list: observedList })
            });
            if (!compareRes.ok) {
                console.error(`❌ Compare API failed: ${compareRes.status} ${compareRes.statusText}`);
                const errorText = await compareRes.text();
                throw new Error(`Compare API failed: ${compareRes.statusText}`);
            }

            const compareData = await compareRes.json();

            if (!compareData.result) {
                console.error('❌ Compare API returned invalid format:', compareData);
                throw new Error('Invalid response format from Compare API');
            }

            const result = compareData.result;

            return {
                score: result.score || 0,
                entities_expected: expectedEntities,
                entities_observed: observedList,
                entities_missing: result.missing_entities || []
            };

        } catch (error) {
            console.error('❌ Entity Analysis Failed:', error);
            return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
        }
    }

    private static getHomepageContext(pages: Page[]): { topicContext: string, fallbackContext: string } {
        // Find homepage (shortest URL path generally)
        const homepage = pages.find(p => p.url.endsWith('/') || (p.url.split('/').length <= 3)) || pages[0];

        // Find a fallback "meaty" page just in case
        const meatyPage = pages.find(p => p !== homepage && p.word_count > 500) || pages[0];

        // We want strict extraction (Simulated here by taking raw content, 
        // realistically we'd parse HTML if we had raw HTML, but we have extracted text 'content')
        // Assuming 'content' field in Page is already main text.
        return {
            topicContext: homepage?.content || '',
            fallbackContext: meatyPage?.content || ''
        };
    }

    private static async callAeoApi(context: string): Promise<AeoScoreResult> {
        // ... (existing implementation) ...
        const apiUrl = process.env.PY_API_BASE || 'http://localhost:8001';
        try {
            const response = await fetch(`${apiUrl}/api/aeo/website-score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: context })
            });

            if (!response.ok) {
                throw new Error(`AEO API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.scores;
        } catch (error) {
            console.error('Failed to call AEO API:', error);
            throw error;
        }
    }

    private static async saveScores(url: string, scores: AeoScoreResult, entityResult: EntityAnalysisResult, pageCount: number, sessionId?: number) {
        const sql = `
            INSERT INTO aeo_results(
        url, session_id,
        score_openai, score_claude, score_gemini, score_consistency, brand_metrics,
        score_entity_coverage, entities_expected, entities_observed, entities_missing,
        analyzed_pages_count
    )
VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id;
`;

        const params = [
            url,
            sessionId || null,
            scores.openai,
            scores.claude,
            scores.gemini,
            scores.consistency || 0,
            scores.brand_metrics ? JSON.stringify(scores.brand_metrics) : null,
            entityResult.score,
            JSON.stringify(entityResult.entities_expected),
            JSON.stringify(entityResult.entities_observed),
            JSON.stringify(entityResult.entities_missing),
            pageCount
        ];

        await query(sql, params);
    }
}
