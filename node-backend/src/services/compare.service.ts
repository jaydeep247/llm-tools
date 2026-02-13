/**
 * Multi-Model Comparison Service
 * Main service coordinating the comparison analysis
 * Consolidated service containing logic for content fetching, claim extraction,
 * agreement analysis, and coverage gap analysis.
 */

import {
    CompareRequest,
    CompareResponse,
    ModelResponse,
    LLMProvider,
    ContentData,
    Claim,
    ClaimMatrix,
    AgreementAnalysis,
    ModelScore,
    CoverageGap
} from '../types/multiModel.types.js';
import { OpenAIProvider, GeminiProvider, GroqProvider } from '../providers/index.js';
import { Logger } from '../helpers/logging/Logger.js';
import { load, CheerioAPI } from 'cheerio';

export class CompareService {
    private readonly providers: Map<string, LLMProvider>;
    private readonly logger = Logger.getInstance();

    constructor() {
        // Initialize providers (Groq is free, Claude removed - requires paid credits)
        this.providers = new Map();
        this.providers.set('openai', new OpenAIProvider());
        this.providers.set('gemini', new GeminiProvider());
        this.providers.set('groq', new GroqProvider());
    }

    /**
     * Compare responses from multiple LLM providers
     */
    async compareModels(request: CompareRequest): Promise<CompareResponse> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting multi-model comparison for URL: ${request.sourceUrl}`);

            // Step 1: Fetch and parse content
            const contentData = await this.fetchContent(request.sourceUrl);
            const normalizedPrompt = this.buildPrompt(contentData, request.question);

            this.logger.info(`Content fetched and prompt built (${contentData.content.length} chars)`);

            // Step 2: Generate responses from all models in parallel
            const modelResponses = await this.generateModelResponses(normalizedPrompt);

            this.logger.info(`Generated responses from ${Object.keys(modelResponses).length} models`);

            // Step 3: Extract structured responses
            const responses = this.extractResponseTexts(modelResponses);

            // Step 4: Perform analysis
            const analysis = await this.performAnalysis(responses);

            const processingTime = Date.now() - startTime;

            const result: CompareResponse = {
                normalizedPrompt,
                responses: responses as { openai: string; gemini: string; groq: string },
                agreement: analysis.agreement,
                claimMatrix: analysis.claimMatrix,
                coverageGaps: analysis.coverageGaps,
                scores: analysis.scores,
                metadata: {
                    sourceUrl: request.sourceUrl,
                    processedAt: new Date(),
                    processingTime
                }
            };

            this.logger.info(`Analysis completed in ${processingTime}ms`);
            return result;

        } catch (error) {
            this.logger.error('Error in multi-model comparison:', error as Error);
            throw error;
        }
    }

    /**
     * Get a specific provider for debugging
     */
    getProvider(name: string) {
        return this.providers.get(name);
    }

    private async generateModelResponses(prompt: string): Promise<{ [provider: string]: ModelResponse }> {
        const responses: { [provider: string]: ModelResponse } = {};

        // Generate responses in parallel
        const promises = Array.from(this.providers.entries()).map(async ([name, provider]) => {
            const startTime = Date.now();

            try {
                this.logger.info(`Requesting response from ${name}`);
                const response = await provider.generate(prompt);
                const responseTime = Date.now() - startTime;

                responses[name] = {
                    provider: name,
                    response,
                    timestamp: new Date(),
                    responseTime
                };

                this.logger.info(`Received response from ${name} (${responseTime}ms)`);
            } catch (error) {
                this.logger.error(`Error generating response from ${name}:`, error as Error);
                responses[name] = {
                    provider: name,
                    response: '',
                    timestamp: new Date(),
                    responseTime: Date.now() - startTime,
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        });

        await Promise.all(promises);
        return responses;
    }

    private extractResponseTexts(modelResponses: { [provider: string]: ModelResponse }): { [provider: string]: string } {
        const responses: { [provider: string]: string } = {};

        Object.entries(modelResponses).forEach(([provider, modelResponse]) => {
            if (modelResponse.error) {
                responses[provider] = `Error: ${modelResponse.error}`;
            } else {
                responses[provider] = modelResponse.response;
            }
        });

        return responses;
    }

    private async performAnalysis(responses: { [provider: string]: string }): Promise<{
        agreement: any;
        claimMatrix: any[];
        coverageGaps: any[];
        scores: any;
    }> {
        // Filter out error responses for analysis
        const validResponses = Object.fromEntries(
            Object.entries(responses).filter(([_, response]) => !response.startsWith('Error:'))
        );

        if (Object.keys(validResponses).length < 1) {
            const errorResponses = Object.fromEntries(
                Object.entries(responses).filter(([_, response]) => response.startsWith('Error:'))
            );

            const errorDetails = Object.entries(errorResponses)
                .map(([provider, error]) => `${provider}: ${error}`)
                .join('; ');

            throw new Error(`Need at least 1 valid response for comparison. Errors: ${errorDetails}. Please check your API keys in environment variables (OPENAI_API_KEY, CLAUDE_API_KEY, GEMINI_API_KEY).`);
        }

        // Perform parallel analysis using internal methods
        const [agreement, claimMatrix, scores] = await Promise.all([
            this.analyzeAgreement(validResponses),
            this.buildClaimMatrix(validResponses),
            this.scoreResponses(validResponses)
        ]);

        // Coverage gap analysis depends on claim matrix
        const coverageGaps = this.analyzeCoverageGaps(validResponses, claimMatrix);

        return {
            agreement,
            claimMatrix,
            coverageGaps,
            scores
        };
    }

    // Utility methods for debugging and monitoring
    getProviderStatus(): { [provider: string]: { available: boolean; name: string } } {
        const status: { [provider: string]: { available: boolean; name: string } } = {};

        this.providers.forEach((provider, name) => {
            status[name] = {
                available: true, // Could add actual health checks here
                name: provider.name
            };
        });

        return status;
    }

    async testProvider(providerName: string, testPrompt: string = 'Hello, please respond with "Test successful"'): Promise<{ success: boolean; response?: string; error?: string; responseTime: number }> {
        const provider = this.providers.get(providerName);
        if (!provider) {
            return {
                success: false,
                error: `Provider ${providerName} not found`,
                responseTime: 0
            };
        }

        const startTime = Date.now();
        try {
            const response = await provider.generate(testPrompt);
            const responseTime = Date.now() - startTime;

            return {
                success: true,
                response,
                responseTime
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                responseTime
            };
        }
    }

    // =========================================================================
    // Content Fetcher Logic
    // =========================================================================

    private async fetchContent(url: string, isSubPage: boolean = false): Promise<ContentData> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Detect content type from response headers
            const contentType = response.headers.get('content-type') || '';
            const html = await response.text();

            const mainContentData = this.parseContent(html, url, contentType);

            // Smart Discovery: Only look for additional pages if this is a main HTML page
            // and we haven't already hit a depth of 1 (prevent recursive crawling)
            if (isSubPage || !contentType.toLowerCase().includes('text/html')) {
                return mainContentData;
            }

            const additionalUrls = this.discoverAdditionalUrls(html, url);

            if (additionalUrls.length > 0) {
                this.logger.info(`Discovered additional relevant URLs for ${url}: ${additionalUrls.join(', ')}`);

                // Fetch subpages in parallel
                const subPageResults = await Promise.allSettled(
                    additionalUrls.map(subUrl => this.fetchContent(subUrl, true))
                );

                // Aggregate and truncate to avoid token limits
                let aggregatedContent = mainContentData.content;
                const CHAR_LIMIT = 20000; // ~5000 tokens, safe for GPT-4 8k limit (with 2k completion tokens)

                for (const result of subPageResults) {
                    if (result.status === 'fulfilled') {
                        const sourceUrl = result.value.metadata?.url || 'discovered page';
                        const newSection = `\n\n--- Additional Context from ${sourceUrl} ---\n\n${result.value.content}`;

                        // Check if adding this section exceeds limit
                        if (aggregatedContent.length + newSection.length > CHAR_LIMIT) {
                            const remainingSpace = CHAR_LIMIT - aggregatedContent.length;
                            if (remainingSpace > 500) {
                                aggregatedContent += `\n\n--- Additional Context from ${sourceUrl} (TRUNCATED) ---\n\n${result.value.content.substring(0, remainingSpace - 100)}... [Content Truncated]`;
                            }
                            this.logger.info(`Truncating content aggregation for ${url} at limit`);
                            break;
                        }
                        aggregatedContent += newSection;
                    }
                }

                mainContentData.content = aggregatedContent;
                if (mainContentData.metadata) {
                    mainContentData.metadata.wordCount = mainContentData.content.split(/\s+/).length;
                    mainContentData.metadata.subPagesFetched = subPageResults.filter(r => r.status === 'fulfilled').length;
                    mainContentData.metadata.isTruncated = aggregatedContent.length >= CHAR_LIMIT;
                }
            }

            return mainContentData;

        } catch (error) {
            this.logger.error(`Error fetching content from ${url}:`, error as Error);
            throw error;
        }
    }

    private discoverAdditionalUrls(html: string, baseUrl: string): string[] {
        const $: CheerioAPI = load(html);
        const discoveredUrls: string[] = [];
        let base;
        try {
            base = new URL(baseUrl);
        } catch (e) {
            return [];
        }

        // Keywords to look for in link text or href (expanded for academic and business leadership)
        const keywords = ['team', 'about', 'leadership', 'company', 'who-we-are', 'principal', 'director', 'desk', 'staff', 'faculty', 'management'];

        $('a[href]').each((_: number, element: any) => {
            const href = $(element).attr('href');
            const text = $(element).text().toLowerCase();

            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

            try {
                const resolvedUrl = new URL(href, baseUrl);

                // Only stay on same domain
                if (resolvedUrl.hostname !== base.hostname) return;

                // Check for keywords in text OR href
                const isRelevant = keywords.some(k =>
                    text.includes(k) ||
                    href.toLowerCase().includes(k)
                );

                if (isRelevant && !discoveredUrls.includes(resolvedUrl.href) && resolvedUrl.href !== baseUrl) {
                    discoveredUrls.push(resolvedUrl.href);
                }
            } catch (e) {
                // Ignore invalid URLs
            }
        });

        // Limit to top 5 most relevant unique URLs
        return [...new Set(discoveredUrls)].slice(0, 5);
    }

    private parseContent(content: string, url: string, contentType: string = ''): ContentData {
        // Detect content type
        const type = this.detectContentType(contentType, url);

        switch (type) {
            case 'html':
                return this.parseHtmlContent(content, url);
            case 'json':
                return this.parseJsonContent(content, url);
            case 'code':
            case 'text':
            default:
                return this.parseTextContent(content, url);
        }
    }

    private detectContentType(contentType: string, url: string): 'html' | 'json' | 'code' | 'text' {
        const lower = contentType.toLowerCase();

        // Check content-type header
        if (lower.includes('text/html') || lower.includes('application/xhtml')) {
            return 'html';
        }
        if (lower.includes('application/json') || lower.includes('text/json')) {
            return 'json';
        }

        // Check URL extension for code files
        const codeExtensions = ['.php', '.java', '.js', '.ts', '.py', '.rb', '.go', '.cs', '.cpp', '.c', '.h', '.jsx', '.tsx', '.vue', '.swift', '.kt', '.rs', '.scala', '.asp', '.aspx', '.jsp'];
        if (codeExtensions.some(ext => url.toLowerCase().endsWith(ext))) {
            return 'code';
        }

        // Check for plain text indicators
        if (lower.includes('text/plain') || url.toLowerCase().endsWith('.txt') || url.toLowerCase().endsWith('.md')) {
            return 'text';
        }

        // Default to HTML for web pages
        return 'html';
    }

    private parseHtmlContent(html: string, url: string): ContentData {
        const $: CheerioAPI = load(html);

        // Only remove truly irrelevant elements (scripts, styles, ads)
        $('script, style, .advertisement, .ad, .ads, #cookie-notice, .cookie-banner').remove();

        // Extract title
        const title = $('title').text() || $('h1').first().text() || 'Untitled';

        // Extract main content - be more comprehensive
        let content = '';

        // Try to find main content containers first
        const mainSelectors = [
            'main',
            'article',
            '.content',
            '.post-content',
            '.entry-content',
            '#content',
            '.main-content',
            '[role="main"]'
        ];

        // Collect content from all matching selectors, not just the first one
        const contentParts: string[] = [];

        for (const selector of mainSelectors) {
            const elements = $(selector);
            elements.each((_: number, element: any) => {
                const text = $(element).text().trim();
                if (text && !contentParts.includes(text)) {
                    contentParts.push(text);
                }
            });
        }

        // Also look for common "About", "Team", "Leadership" sections which often contain the info users are asking for
        const importantSections = [
            '.about, #about, [class*="about"]',
            '.team, #team, [class*="team"]',
            '.leadership, #leadership, [class*="leadership"]',
            '.company, #company, [class*="company"]',
            'section'
        ];

        for (const selector of importantSections) {
            const elements = $(selector);
            elements.each((_: number, element: any) => {
                const text = $(element).text().trim();
                // Filter out very short strings (like "About" labels) and only keep sections with actual content
                if (text && text.length > 50 && !contentParts.includes(text)) {
                    contentParts.push(text);
                }
            });
        }

        // If we found specific sections, combine them
        if (contentParts.length > 0) {
            content = contentParts.join('\n\n');
        } else {
            // Fallback to body, but still remove excessive navigation if we have nothing else
            // only remove nav if we have to use the whole body
            $('nav, .nav, .navigation').remove();
            content = $('body').text();
        }

        // Clean up excessive whitespace but preserve paragraph breaks
        content = content.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();

        // Extract metadata
        const metadata = {
            description: $('meta[name="description"]').attr('content') || '',
            keywords: $('meta[name="keywords"]').attr('content') || '',
            author: $('meta[name="author"]').attr('content') || '',
            publishedTime: $('meta[property="article:published_time"]').attr('content') || '',
            url: url,
            wordCount: content.split(/\s+/).length,
            contentType: 'html'
        };

        return {
            title: title.trim(),
            content: content,
            metadata
        };
    }

    private parseJsonContent(jsonText: string, url: string): ContentData {
        try {
            const jsonData = JSON.parse(jsonText);
            const prettyJson = JSON.stringify(jsonData, null, 2);

            // Extract title from common JSON fields
            const title = jsonData.title || jsonData.name || jsonData.id || 'JSON Data';

            return {
                title: String(title),
                content: prettyJson,
                metadata: {
                    url: url,
                    wordCount: prettyJson.split(/\s+/).length,
                    contentType: 'json',
                    objectKeys: Object.keys(jsonData).length
                }
            };
        } catch (error) {
            // If JSON parsing fails, treat as plain text
            return this.parseTextContent(jsonText, url);
        }
    }

    private parseTextContent(text: string, url: string): ContentData {
        // Extract filename from URL as title
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1] || 'Text Content';

        // Detect if it's code by checking for common code patterns
        const isCode = /^(class|function|def|public|private|import|const|let|var|<?php|package|namespace)\s/m.test(text);

        return {
            title: filename,
            content: text.trim(),
            metadata: {
                url: url,
                wordCount: text.split(/\s+/).length,
                contentType: isCode ? 'code' : 'text',
                lineCount: text.split('\n').length
            }
        };
    }

    private buildPrompt(contentData: ContentData, question?: string): string {
        let prompt = '';

        if (contentData.title) {
            prompt += `Title: ${contentData.title}\n\n`;
        }

        prompt += `Content:\n${contentData.content}\n\n`;

        if (question) {
            // User has a specific question - focus only on answering it
            prompt += `Question: ${question}\n\n`;
            prompt += `Please answer the question above based on the content provided. Be direct and focused in your response. Only include information that is relevant to answering the specific question.`;
        } else {
            // No specific question - provide comprehensive analysis
            prompt += `Please provide a comprehensive analysis including:\n`;
            prompt += `1. Key insights and main points\n`;
            prompt += `2. Recommendations or actionable items\n`;
            prompt += `3. Potential risks or considerations\n`;
            prompt += `4. Missing information or gaps\n`;
            prompt += `5. Stakeholders or parties that might be affected\n`;
        }

        return prompt;
    }

    // =========================================================================
    // Claim Extraction Logic
    // =========================================================================

    private extractClaims(response: string, provider: string): Claim[] {
        const claims: Claim[] = [];

        // Split response into sentences and paragraphs
        const sentences = this.splitIntoSentences(response);

        sentences.forEach((sentence, index) => {
            if (this.isSignificantClaim(sentence)) {
                claims.push({
                    id: `${provider}-${index}`,
                    content: sentence.trim(),
                    confidence: this.assessConfidence(sentence),
                    category: this.categorizeCllaim(sentence),
                    source: provider
                });
            }
        });

        return claims;
    }

    private buildClaimMatrix(responses: { [provider: string]: string }): ClaimMatrix[] {
        const allClaims: { [provider: string]: Claim[] } = {};

        // Extract claims from each provider
        Object.entries(responses).forEach(([provider, response]) => {
            allClaims[provider] = this.extractClaims(response, provider);
        });

        // Normalize and create matrix
        const normalizedClaims = this.normalizeClaims(allClaims);
        return this.createMatrix(normalizedClaims, Object.keys(responses));
    }

    private splitIntoSentences(text: string): string[] {
        // More sophisticated sentence splitting
        return text
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 10);
    }

    private isSignificantClaim(sentence: string): boolean {
        // Filter out trivial statements
        const trivialPatterns = [
            /^(the|a|an)\s+/i,
            /^(this|that|these|those)\s+/i,
            /^(it|there)\s+(is|are|was|were)/i
        ];

        const significantPatterns = [
            /\b(should|must|need|require|recommend|suggest|important|critical|key)\b/i,
            /\b(risk|benefit|advantage|disadvantage|challenge|opportunity)\b/i,
            /\b(because|therefore|thus|consequently|as a result)\b/i,
            /\b(will|would|can|could|may|might)\b/i
        ];

        const hasTrivialStart = trivialPatterns.some(pattern => pattern.test(sentence));
        const hasSignificantContent = significantPatterns.some(pattern => pattern.test(sentence));

        return !hasTrivialStart && (hasSignificantContent || sentence.length > 50);
    }

    private assessConfidence(sentence: string): number {
        const hedgingWords = [
            'possibly', 'probably', 'might', 'could', 'may', 'perhaps',
            'seems', 'appears', 'likely', 'potentially', 'presumably'
        ];

        const confidenceWords = [
            'definitely', 'certainly', 'clearly', 'obviously', 'undoubtedly',
            'must', 'will', 'always', 'never', 'absolutely'
        ];

        const lowerSentence = sentence.toLowerCase();
        const hedgeCount = hedgingWords.filter(word => lowerSentence.includes(word)).length;
        const confidenceCount = confidenceWords.filter(word => lowerSentence.includes(word)).length;

        let score = 0.5; // Base confidence
        score += confidenceCount * 0.2; // Increase for confidence words
        score -= hedgeCount * 0.15; // Decrease for hedging words

        return Math.max(0.1, Math.min(1.0, score));
    }

    private categorizeCllaim(sentence: string): string {
        const categories = {
            'recommendation': /\b(should|recommend|suggest|advise)\b/i,
            'risk': /\b(risk|danger|threat|warning|caution)\b/i,
            'benefit': /\b(benefit|advantage|opportunity|positive)\b/i,
            'requirement': /\b(must|need|require|necessary|essential)\b/i,
            'process': /\b(step|process|procedure|method|approach)\b/i,
            'stakeholder': /\b(stakeholder|customer|user|team|management)\b/i,
            'constraint': /\b(limit|constraint|restriction|boundary)\b/i,
            'quantitative': /\b(\d+|percent|cost|time|budget|number)\b/i,
            'temporal': /\b(timeline|schedule|deadline|duration|period)\b/i
        };

        for (const [category, pattern] of Object.entries(categories)) {
            if (pattern.test(sentence)) {
                return category;
            }
        }

        return 'general';
    }

    private normalizeClaims(allClaims: { [provider: string]: Claim[] }): { claim: string; providers: Set<string>; category: string; importance: number }[] {
        const claimMap = new Map<string, { providers: Set<string>; category: string; importance: number }>();

        Object.entries(allClaims).forEach(([provider, claims]) => {
            claims.forEach(claim => {
                const normalizedClaim = this.normalizeClaimText(claim.content);

                if (!claimMap.has(normalizedClaim)) {
                    claimMap.set(normalizedClaim, {
                        providers: new Set(),
                        category: claim.category,
                        importance: claim.confidence
                    });
                }

                claimMap.get(normalizedClaim)!.providers.add(provider);
                // Update importance with average confidence
                const current = claimMap.get(normalizedClaim)!;
                current.importance = (current.importance + claim.confidence) / 2;
            });
        });

        return Array.from(claimMap.entries()).map(([claim, data]) => ({
            claim,
            providers: data.providers,
            category: data.category,
            importance: data.importance
        }));
    }

    private normalizeClaimText(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private createMatrix(normalizedClaims: { claim: string; providers: Set<string>; category: string; importance: number }[], allProviders: string[]): ClaimMatrix[] {
        return normalizedClaims.map(claim => ({
            claim: claim.claim,
            providers: {
                openai: claim.providers.has('openai'),
                gemini: claim.providers.has('gemini'),
                groq: claim.providers.has('groq')
            },
            category: claim.category,
            importance: claim.importance
        }));
    }

    // =========================================================================
    // Agreement Analysis Logic
    // =========================================================================

    private analyzeAgreement(responses: { [provider: string]: string }): AgreementAnalysis {
        const responseTexts = Object.values(responses);

        return {
            outcomeLevel: this.analyzeOutcomeAgreement(responseTexts),
            reasoningLevel: this.analyzeReasoningAgreement(responseTexts),
            specificityLevel: this.analyzeSpecificity(responseTexts),
            toneAnalysis: this.analyzeTone(responseTexts)
        };
    }

    private scoreResponses(responses: { [provider: string]: string }): { [provider: string]: ModelScore } {
        const scores: { [provider: string]: ModelScore } = {};

        Object.entries(responses).forEach(([provider, response]) => {
            scores[provider] = this.scoreResponse(response, responses);
        });

        return scores;
    }

    private analyzeOutcomeAgreement(responses: string[]): { agreement: 'same' | 'compatible' | 'contradictory'; score: number } {
        const conclusions = responses.map(r => this.extractConclusion(r));
        const similarities = this.calculatePairwiseSimilarities(conclusions);
        const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

        let agreement: 'same' | 'compatible' | 'contradictory';
        if (avgSimilarity > 0.8) {
            agreement = 'same';
        } else if (avgSimilarity > 0.4) {
            agreement = 'compatible';
        } else {
            agreement = 'contradictory';
        }

        return { agreement, score: avgSimilarity };
    }

    private analyzeReasoningAgreement(responses: string[]): { similarity: number; approach: 'same' | 'different' | 'shallow_vs_detailed' } {
        const reasoningDepths = responses.map(r => this.assessReasoningDepth(r));
        const avgDepth = reasoningDepths.reduce((a, b) => a + b, 0) / reasoningDepths.length;
        const depthVariance = this.calculateVariance(reasoningDepths);

        const reasoningApproaches = responses.map(r => this.extractReasoningApproach(r));
        const approachSimilarity = this.calculateTextSimilarity(reasoningApproaches.join(' '), reasoningApproaches.join(' '));

        let approach: 'same' | 'different' | 'shallow_vs_detailed';
        if (depthVariance > 0.3) {
            approach = 'shallow_vs_detailed';
        } else if (approachSimilarity > 0.6) {
            approach = 'same';
        } else {
            approach = 'different';
        }

        return {
            similarity: approachSimilarity,
            approach
        };
    }

    private analyzeSpecificity(responses: string[]): { depthScore: number; completenessScore: number; exampleCount: number } {
        const depthScores = responses.map(r => this.assessReasoningDepth(r));
        const avgDepthScore = depthScores.reduce((a, b) => a + b, 0) / depthScores.length;

        const exampleCounts = responses.map(r => this.countExamples(r));
        const totalExamples = exampleCounts.reduce((a, b) => a + b, 0);

        const completenessScores = responses.map(r => this.assessCompleteness(r));
        const avgCompleteness = completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length;

        return {
            depthScore: avgDepthScore,
            completenessScore: avgCompleteness,
            exampleCount: totalExamples
        };
    }

    private analyzeTone(responses: string[]): { confidence: 'hedged' | 'moderate' | 'assertive'; riskPosture: 'cautious' | 'neutral' | 'aggressive' } {
        const confidenceScores = responses.map(r => this.assessConfidenceLevel(r));
        const avgConfidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;

        const riskScores = responses.map(r => this.assessRiskPosture(r));
        const avgRiskScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length;

        let confidence: 'hedged' | 'moderate' | 'assertive';
        if (avgConfidence < 0.4) confidence = 'hedged';
        else if (avgConfidence > 0.7) confidence = 'assertive';
        else confidence = 'moderate';

        let riskPosture: 'cautious' | 'neutral' | 'aggressive';
        if (avgRiskScore < 0.4) riskPosture = 'cautious';
        else if (avgRiskScore > 0.7) riskPosture = 'aggressive';
        else riskPosture = 'neutral';

        return { confidence, riskPosture };
    }

    private scoreResponse(response: string, allResponses: { [provider: string]: string }): ModelScore {
        const allTexts = Object.values(allResponses);
        const agreementScore = this.calculateAgreementScore(response, allTexts);
        const depthScore = this.assessReasoningDepth(response);
        const actionabilityScore = this.assessActionability(response);
        const assumptionsScore = this.assessAssumptionsStated(response);

        const overall = (agreementScore + depthScore + actionabilityScore + assumptionsScore) / 4;

        return {
            agreement: agreementScore,
            depth: depthScore,
            actionability: actionabilityScore,
            assumptionsStated: assumptionsScore,
            overall
        };
    }

    // Helper methods for Agreement Analysis
    private extractConclusion(response: string): string {
        const lines = response.split('\n');
        const conclusionKeywords = ['conclusion', 'summary', 'in summary', 'overall', 'finally'];

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].toLowerCase();
            if (conclusionKeywords.some(keyword => line.includes(keyword))) {
                return lines.slice(i).join(' ');
            }
        }

        // Fallback to last paragraph
        return lines.slice(-3).join(' ');
    }

    private assessReasoningDepth(response: string): number {
        const depthIndicators = [
            /because|since|due to|as a result|therefore|thus/gi,
            /consider|analysis|evaluate|examine/gi,
            /factor|aspect|dimension|component/gi,
            /implication|consequence|impact|effect/gi
        ];

        let score = 0;
        depthIndicators.forEach(pattern => {
            const matches = response.match(pattern);
            score += matches ? matches.length : 0;
        });

        // Normalize by response length
        return Math.min(1, score / (response.length / 100));
    }

    private extractReasoningApproach(response: string): string {
        const sentences = response.split(/[.!?]+/);
        return sentences
            .filter(s => this.isReasoningStatement(s))
            .join(' ');
    }

    private isReasoningStatement(sentence: string): boolean {
        const reasoningPatterns = [
            /because|since|due to|as a result|therefore|thus/i,
            /consider|analysis|evaluate|examine/i,
            /this suggests|this indicates|this implies/i
        ];

        return reasoningPatterns.some(pattern => pattern.test(sentence));
    }

    private countExamples(response: string): number {
        const examplePatterns = [
            /for example|for instance|such as|e\.g\./gi,
            /\d+\.|•|\*\s/g,
            /case study|scenario|situation/gi
        ];

        let count = 0;
        examplePatterns.forEach(pattern => {
            const matches = response.match(pattern);
            count += matches ? matches.length : 0;
        });

        return count;
    }

    private assessCompleteness(response: string): number {
        const completenessIndicators = [
            'stakeholder', 'risk', 'benefit', 'cost', 'time', 'resource',
            'requirement', 'constraint', 'assumption', 'dependency',
            'process', 'step', 'phase', 'timeline', 'budget'
        ];

        const found = completenessIndicators.filter(indicator =>
            response.toLowerCase().includes(indicator)
        );

        return found.length / completenessIndicators.length;
    }

    private assessConfidenceLevel(response: string): number {
        const hedgeWords = ['might', 'could', 'possibly', 'perhaps', 'likely', 'seems'];
        const confidenceWords = ['will', 'must', 'definitely', 'clearly', 'certainly'];

        const lowerResponse = response.toLowerCase();
        const hedgeCount = hedgeWords.filter(word => lowerResponse.includes(word)).length;
        const confidenceCount = confidenceWords.filter(word => lowerResponse.includes(word)).length;

        const score = (confidenceCount - hedgeCount + response.length / 200) / 10;
        return Math.max(0, Math.min(1, score));
    }

    private assessRiskPosture(response: string): number {
        const cautiousWords = ['careful', 'caution', 'risk', 'danger', 'warning', 'concern'];
        const aggressiveWords = ['opportunity', 'advantage', 'benefit', 'growth', 'potential'];

        const lowerResponse = response.toLowerCase();
        const cautiousCount = cautiousWords.filter(word => lowerResponse.includes(word)).length;
        const aggressiveCount = aggressiveWords.filter(word => lowerResponse.includes(word)).length;

        const score = (aggressiveCount - cautiousCount + 5) / 10;
        return Math.max(0, Math.min(1, score));
    }

    private assessActionability(response: string): number {
        const actionWords = [
            'should', 'recommend', 'suggest', 'implement', 'execute',
            'action', 'step', 'plan', 'strategy', 'approach'
        ];

        const lowerResponse = response.toLowerCase();
        const actionCount = actionWords.filter(word => lowerResponse.includes(word)).length;

        return Math.min(1, actionCount / 5);
    }

    private assessAssumptionsStated(response: string): number {
        const assumptionPatterns = [
            /assuming|assume|given that|provided that/gi,
            /if we assume|based on the assumption/gi,
            /prerequisite|precondition|requirement/gi
        ];

        let count = 0;
        assumptionPatterns.forEach(pattern => {
            const matches = response.match(pattern);
            count += matches ? matches.length : 0;
        });

        return Math.min(1, count / 3);
    }

    private calculateAgreementScore(response: string, allResponses: string[]): number {
        const similarities = allResponses.map(other =>
            this.calculateTextSimilarity(response, other)
        );
        return similarities.reduce((a, b) => a + b, 0) / similarities.length;
    }

    private calculatePairwiseSimilarities(texts: string[]): number[] {
        const similarities: number[] = [];

        for (let i = 0; i < texts.length; i++) {
            for (let j = i + 1; j < texts.length; j++) {
                similarities.push(this.calculateTextSimilarity(texts[i], texts[j]));
            }
        }

        return similarities;
    }

    private calculateTextSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));

        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    }

    private calculateVariance(numbers: number[]): number {
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
        return Math.sqrt(variance);
    }

    // =========================================================================
    // Coverage Gap Analysis Logic
    // =========================================================================

    private analyzeCoverageGaps(responses: { [provider: string]: string }, claimMatrix: ClaimMatrix[]): CoverageGap[] {
        const gaps: CoverageGap[] = [];
        const providers = Object.keys(responses);

        // Analyze missing claims
        const claimGaps = this.analyzeClaimGaps(claimMatrix, providers);
        gaps.push(...claimGaps);

        // Analyze content-specific gaps
        const contentGaps = this.analyzeContentGaps(responses);
        gaps.push(...contentGaps);

        // Sort by severity
        return gaps.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
    }

    private analyzeClaimGaps(claimMatrix: ClaimMatrix[], providers: string[]): CoverageGap[] {
        const gaps: CoverageGap[] = [];

        claimMatrix.forEach(claim => {
            const presentProviders: string[] = [];
            const missingProviders: string[] = [];

            providers.forEach(provider => {
                if (claim.providers[provider as keyof typeof claim.providers]) {
                    presentProviders.push(provider);
                } else {
                    missingProviders.push(provider);
                }
            });

            // Only consider it a gap if it's missing from at least one provider
            if (missingProviders.length > 0 && presentProviders.length > 0) {
                gaps.push({
                    type: this.mapCategoryToGapType(claim.category),
                    description: `Missing perspective: ${claim.claim}`,
                    missingFrom: missingProviders,
                    presentIn: presentProviders,
                    severity: this.assessGapSeverity(claim.importance, missingProviders.length, providers.length)
                });
            }
        });

        return gaps;
    }

    private analyzeContentGaps(responses: { [provider: string]: string }): CoverageGap[] {
        const gaps: CoverageGap[] = [];
        const providers = Object.keys(responses);

        // Define gap analysis patterns
        const gapPatterns = {
            missing_risk: {
                keywords: ['risk', 'danger', 'threat', 'vulnerability', 'concern', 'caution', 'warning'],
                description: 'Risk analysis and potential threats'
            },
            missing_stakeholder: {
                keywords: ['stakeholder', 'customer', 'user', 'team', 'management', 'executive', 'client', 'partner'],
                description: 'Stakeholder identification and impact'
            },
            missing_step: {
                keywords: ['step', 'process', 'procedure', 'method', 'approach', 'workflow', 'implementation'],
                description: 'Implementation steps and processes'
            },
            missing_constraint: {
                keywords: ['constraint', 'limitation', 'restriction', 'boundary', 'requirement', 'prerequisite'],
                description: 'Constraints and limitations'
            },
            missing_quantification: {
                keywords: ['cost', 'budget', 'time', 'duration', 'percentage', 'number', 'metric', 'KPI'],
                description: 'Quantitative analysis and metrics'
            },
            missing_edge_case: {
                keywords: ['edge case', 'exception', 'unusual', 'rare', 'corner case', 'alternative scenario'],
                description: 'Edge cases and alternative scenarios'
            },
            missing_temporal_aspect: {
                keywords: ['timeline', 'schedule', 'deadline', 'short-term', 'long-term', 'future', 'roadmap'],
                description: 'Temporal considerations and timelines'
            }
        };

        Object.entries(gapPatterns).forEach(([gapType, pattern]) => {
            const coverage = this.analyzePatternCoverage(responses, pattern.keywords);

            const missingProviders = providers.filter(provider => !coverage[provider]);
            const presentProviders = providers.filter(provider => coverage[provider]);

            if (missingProviders.length > 0 && presentProviders.length > 0) {
                gaps.push({
                    type: gapType as CoverageGap['type'],
                    description: pattern.description,
                    missingFrom: missingProviders,
                    presentIn: presentProviders,
                    severity: this.assessGapSeverity(0.7, missingProviders.length, providers.length)
                });
            }
        });

        return gaps;
    }

    private analyzePatternCoverage(responses: { [provider: string]: string }, keywords: string[]): { [provider: string]: boolean } {
        const coverage: { [provider: string]: boolean } = {};

        Object.entries(responses).forEach(([provider, response]) => {
            const lowerResponse = response.toLowerCase();
            coverage[provider] = keywords.some(keyword =>
                lowerResponse.includes(keyword.toLowerCase())
            );
        });

        return coverage;
    }

    private mapCategoryToGapType(category: string): CoverageGap['type'] {
        const mapping: { [key: string]: CoverageGap['type'] } = {
            'risk': 'missing_risk',
            'stakeholder': 'missing_stakeholder',
            'process': 'missing_step',
            'constraint': 'missing_constraint',
            'quantitative': 'missing_quantification',
            'temporal': 'missing_temporal_aspect'
        };

        return mapping[category] || 'other';
    }

    private assessGapSeverity(importance: number, missingCount: number, totalProviders: number): 'low' | 'medium' | 'high' {
        const missingRatio = missingCount / totalProviders;
        const severityScore = importance * missingRatio;

        if (severityScore > 0.6) return 'high';
        if (severityScore > 0.3) return 'medium';
        return 'low';
    }

    private getSeverityWeight(severity: 'low' | 'medium' | 'high'): number {
        const weights = { high: 3, medium: 2, low: 1 };
        return weights[severity];
    }
}
