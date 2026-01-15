
import { query } from '../../config/dbConnection.js';
import * as cheerio from 'cheerio';

interface Page {
    url: string;
    content: string;
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

    private static expectedEntitiesCache = new Map<string, string[]>();
    private static canonicalTopicCache = new Map<string, { topic: string; brandName: string; audience: string; tone: string }>();

    static selectQualifiedPages(pages: Page[]): Page[] {
        // Enrich pages with calculated word_count if missing
        const enrichedPages = pages.map(page => {
            if ((!page.word_count || page.word_count === 0) && page.content && page.content.trim().length > 0) {
                // Calculate word count from actual content
                const wordCount = page.content.trim().split(/\s+/).length;
                return { ...page, word_count: wordCount };
            }
            return page;
        });

        // First try to find pages with minimum word count
        let qualified = enrichedPages.filter(page => {
            if (page.status_code !== 200) return false;
            if (page.word_count < this.QUALIFIED_MIN_WORDS) return false;

            const lowerUrl = page.url.toLowerCase();
            const excludePatterns = ['login', 'signin', 'register', 'cart', 'checkout', 'account', 'admin'];
            if (excludePatterns.some(p => lowerUrl.includes(p))) return false;

            return true;
        });

        // If no qualified pages found, accept pages with any content (word_count > 0)
        if (qualified.length === 0) {
            qualified = enrichedPages.filter(page => {
                if (page.status_code !== 200) return false;
                // Accept pages with at least some calculated content
                if (!page.content || page.content.trim().length === 0) return false;

                const lowerUrl = page.url.toLowerCase();
                const excludePatterns = ['login', 'signin', 'register', 'cart', 'checkout', 'account', 'admin'];
                if (excludePatterns.some(p => lowerUrl.includes(p))) return false;

                return true;
            });
        }

        return qualified;
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

    private static sanitizeContent(html: string): string {
        try {
            const $ = cheerio.load(html);
            $('script, style, head, noscript, iframe, svg, link, meta, json-ld').remove();
            const text = $('body').text() || $.text();
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
            if (lower.includes('(') && lower.includes(')')) return false;
            if (lower.includes('http') || lower.includes('.com') || lower.includes('.org')) return false;
            return true;
        });
    }

    static async generateWebsiteScores(url: string, pages: Page[], sessionId?: number) {
        if (!pages || !Array.isArray(pages) || pages.length === 0) {
            throw new Error('Invalid or empty pages array provided for analysis.');
        }

        const qualifiedPages = this.selectQualifiedPages(pages);
        if (qualifiedPages.length === 0) {
            throw new Error(`No qualified pages found for analysis. Checked ${pages.length} pages.`);
        }

        const pagesWithContent = qualifiedPages.filter(p => p.content && p.content.trim().length > 0);
        if (pagesWithContent.length === 0) {
            throw new Error('No pages with valid content found. Content extraction may have failed.');
        }

        const context = this.aggregateContent(pagesWithContent);
        if (!context || context.trim().length === 0) {
            throw new Error('Failed to aggregate content from qualified pages.');
        }

        try {
            const [scores, entityResult, consistencyResult] = await Promise.all([
                this.callAeoApi(context).catch((e: any) => {
                    console.error('AEO API failed:', e);
                    throw new Error(`AEO API call failed: ${(e as Error).message}`);
                }),
                this.runEntityAnalysis(pagesWithContent).catch((e: any) => {
                    console.error('Entity analysis failed:', e);
                    return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
                }),
                this.runContentConsistency(pagesWithContent).catch((e: any) => {
                    console.error('Content consistency failed:', e);
                    return { score: 0, brandName: undefined };
                })
            ]);

            scores.consistency = consistencyResult.score || 0;

            const brandName = (consistencyResult as { score: number; brandName?: string }).brandName;
            if (brandName && brandName.trim()) {
                try {
                    scores.brand_metrics = await this.runBrandAnalysis(brandName);
                } catch (e) {
                    console.warn('Brand analysis failed (non-critical):', e);
                    scores.brand_metrics = null;
                }
            }

            await this.saveScores(url, scores, entityResult, pagesWithContent.length, sessionId);
            return { ...scores, entity_coverage: entityResult };
        } catch (error) {
            console.error('Fatal error in generateWebsiteScores:', error);
            throw new Error(`Website score generation failed: ${(error as Error).message}`);
        }
    }

    private static async runContentConsistency(pagesWithContent: Page[]): Promise<{ score: number; brandName?: string }> {
        try {
            if (!pagesWithContent || pagesWithContent.length === 0) {
                console.warn('⚠️ No pages for consistency analysis. Returning zero score.');
                return { score: 0 };
            }

            const apiUrl = process.env.PY_API_BASE || 'http://localhost:8001';
            const domainKey = pagesWithContent[0]?.url ? new URL(pagesWithContent[0].url).hostname : 'unknown_domain';
            const fallbackBrand = domainKey.replace('www.', '').split('.')[0].charAt(0).toUpperCase() + domainKey.replace('www.', '').split('.')[0].slice(1);

            let cached = this.canonicalTopicCache.get(domainKey);
            let topic = cached?.topic;
            let brandName = cached?.brandName || '';
            let audience = cached?.audience || 'General';
            let tone = cached?.tone || 'Neutral';

            if (!topic) {
                const { topicContext, fallbackContext } = this.getHomepageContext(pagesWithContent);
                const cleanContext = this.sanitizeContent(topicContext || fallbackContext || '').substring(0, 5000);

                if (!cleanContext.trim()) {
                    console.warn('⚠️ No text content for Canonical Topic. Consistency Score = 0.');
                    return { score: 0, brandName: fallbackBrand };
                }

                try {
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
                    } else {
                        console.warn(`Topic generation failed: ${res.statusText}`);
                    }
                } catch (e) {
                    console.error('Topic generation error:', e);
                }
            }

            if (!topic) {
                console.warn('failed to generate canonical topic, using fallback');
                return { score: 0, brandName: fallbackBrand };
            }

            let totalScore = 0;
            let validBatches = 0;

            console.log(`📉 Scoring Content Consistency for ${pagesWithContent.length} pages...`);

            for (let i = 0; i < pagesWithContent.length; i += this.BATCH_SIZE) {
                const batch = pagesWithContent.slice(i, i + this.BATCH_SIZE);
                const batchContent = batch.map(p => this.sanitizeContent(p.content || '')).join('\n');
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
                        if (typeof score === 'number' && !isNaN(score)) {
                            console.log(`Batch ${i} Consistency: ${score}/100`);
                            totalScore += score;
                            validBatches++;
                        }
                    } else {
                        console.warn(`Batch scoring failed: ${res.statusText}`);
                    }
                } catch (e) {
                    console.error(`Error scoring batch ${i}:`, e);
                }
            }

            const finalScore = validBatches > 0 ? Math.round(totalScore / validBatches) : 0;
            console.log(`✅ Final Content Consistency Score: ${finalScore}%`);
            return { score: finalScore, brandName: brandName || fallbackBrand };
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

            if (!res.ok) {
                console.warn(`Brand analysis API failed: ${res.statusText}`);
                return null;
            }

            return await res.json();
        } catch (error) {
            console.error('❌ Brand Analysis Failed:', error);
            return null;
        }
    }

    private static async runEntityAnalysis(qualifiedPages: Page[]): Promise<EntityAnalysisResult> {
        try {
            if (!qualifiedPages || qualifiedPages.length === 0) {
                console.warn('⚠️ No qualified pages for entity analysis. Returning zero score.');
                return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
            }

            const apiUrl = process.env.PY_API_BASE || 'http://localhost:8001';
            const { topicContext, fallbackContext } = this.getHomepageContext(qualifiedPages);

            const cleanTopicContext = this.sanitizeContent(topicContext || '').substring(0, 5000);
            const cleanFallbackContext = this.sanitizeContent(fallbackContext || '').substring(0, 5000);

            if ((cleanTopicContext && (cleanTopicContext.includes('<html') || cleanTopicContext.includes('<meta'))) ||
                (cleanFallbackContext && (cleanFallbackContext.includes('<html') || cleanFallbackContext.includes('<meta')))) {
                console.error('CRITICAL: HTML leaked through sanitizer!');
                throw new Error('HTML detected in Expected Entity context');
            }

            if (!cleanTopicContext && !cleanFallbackContext) {
                console.warn('⚠️ No text content found for context. Aborting entity analysis.');
                return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
            }

            const domainKey = qualifiedPages[0]?.url ? new URL(qualifiedPages[0].url).hostname : 'unknown_domain';
            let expectedEntities: string[] = [];

            if (this.expectedEntitiesCache.has(domainKey)) {
                console.log(`🧠 using cached expected entities for ${domainKey}`);
                expectedEntities = this.expectedEntitiesCache.get(domainKey)!;
            } else {
                console.log('🤖 Generating Expected Entities (Calling LLM)...');
                try {
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

                    if (!Array.isArray(rawEntities)) {
                        console.warn('⚠️ Expected entities is not an array');
                        rawEntities = [];
                    }

                    expectedEntities = this.filterTechnicalArtifacts(rawEntities);

                    if (expectedEntities.length > 0) {
                        this.expectedEntitiesCache.set(domainKey, expectedEntities);
                    }
                } catch (e) {
                    console.error('Expected entities generation error:', e);
                }
            }

            if (expectedEntities.length === 0) {
                console.warn('⚠️ No expected entities generated. Aborting analysis.');
                return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
            }

            console.log(`👁️ Extracting Observed Entities from ${qualifiedPages.length} pages in batches...`);
            const observedSet = new Set<string>();

            for (let i = 0; i < qualifiedPages.length; i += this.BATCH_SIZE) {
                const batch = qualifiedPages.slice(i, i + this.BATCH_SIZE);

                const batchContent = batch
                    .map((p: Page) => p.content ? `URL: ${p.url} \nCONTENT: ${this.sanitizeContent(p.content).substring(0, 4000)} ` : '')
                    .filter((bc: string) => bc.trim().length > 0)
                    .join('\n---\n');

                if (!batchContent.trim()) {
                    console.log(`Skipping empty batch ${i}`);
                    continue;
                }

                try {
                    const observedRes = await fetch(`${apiUrl}/api/aeo/entity/extract-observed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content_batch: batchContent })
                    });

                    if (observedRes.ok) {
                        const observedData = await observedRes.json();
                        let entities = observedData.entities || [];

                        if (!Array.isArray(entities)) {
                            console.warn(`Batch ${i}: entities is not an array`);
                            entities = [];
                        }

                        if (entities.length > 0) {
                            entities.forEach((e: string) => {
                                if (typeof e === 'string' && e.trim()) {
                                    observedSet.add(e.trim());
                                }
                            });
                        }
                    } else {
                        console.warn(`Batch extraction failed: ${observedRes.statusText}`);
                    }
                } catch (e) {
                    console.error(`Batch extraction error: `, e);
                }
            }

            const observedList = Array.from(observedSet);

            console.log('⚖️ Comparing Entity Coverage...');
            try {
                const compareRes = await fetch(`${apiUrl}/api/aeo/entity/compare-coverage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expected_list: expectedEntities, observed_list: observedList })
                });

                if (!compareRes.ok) {
                    console.error(`❌ Compare API failed: ${compareRes.status} ${compareRes.statusText}`);
                    const errorText = await compareRes.text();
                    throw new Error(`Compare API failed: ${compareRes.statusText} - ${errorText}`);
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
            } catch (e) {
                console.error('Compare API call failed:', e);
                return {
                    score: 0,
                    entities_expected: expectedEntities,
                    entities_observed: observedList,
                    entities_missing: []
                };
            }
        } catch (error) {
            console.error('❌ Entity Analysis Failed:', error);
            return { score: 0, entities_expected: [], entities_observed: [], entities_missing: [] };
        }
    }

    private static getHomepageContext(pages: Page[]): { topicContext: string; fallbackContext: string } {
        const homepage = pages.find(p => p.url.endsWith('/') || (p.url.split('/').length <= 3)) || pages[0];
        const meatyPage = pages.find(p => p !== homepage && p.word_count > 500) || pages[0];

        return {
            topicContext: homepage?.content || '',
            fallbackContext: meatyPage?.content || ''
        };
    }

    private static async callAeoApi(context: string): Promise<AeoScoreResult> {
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
