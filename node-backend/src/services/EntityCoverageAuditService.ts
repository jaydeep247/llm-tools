/**
 * Entity Coverage Audit Service
 * Analyzes page content to determine entity coverage against expected entities
 */

import { Logger } from '../helpers/logging/Logger.js';
import { CheerioAPI, load } from 'cheerio';

const logger = Logger.getInstance();

export interface DetectedEntity {
    name: string;
    type: 'heading' | 'noun_phrase' | 'repeated_concept';
    frequency: number;
    contextScore: number; // 0-100 based on context depth
    firstFoundIn: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'content';
    relevanceScore: number; // 0-100 combined score
}

export interface EntityCoverageResult {
    entityCoveragePercent: number;
    entityRelevanceScore: number;
    detectedEntities: DetectedEntity[];
    missingEntities: string[];
    expectedEntitiesCount: number;
    detectedEntitiesCount: number;
}

export interface EntityCoverageRequest {
    url: string;
    expectedEntities?: string[];
    sessionId?: number;
}

export class EntityCoverageAuditService {
    /**
     * Analyze page URL for entity coverage
     */
    public static async analyzeEntityCoverage(url: string, expectedEntities: string[] = []): Promise<EntityCoverageResult> {
        logger.info('Starting entity coverage analysis', { url, expectedEntitiesCount: expectedEntities.length });

        try {
            // 1. Normalize URL (add protocol if missing)
            const normalizedUrl = EntityCoverageAuditService.normalizeUrl(url);
            
            // 2. Fetch page content
            const html = await EntityCoverageAuditService.fetchPageContent(normalizedUrl);
            const pageText = EntityCoverageAuditService.extractPageText(html);
            
            // 2. Generate expected entities if not provided
            const finalExpectedEntities = expectedEntities.length > 0 
                ? expectedEntities 
                : EntityCoverageAuditService.generateExpectedEntities(normalizedUrl, pageText);

            // 3. Extract entities from content
            const detectedEntities = EntityCoverageAuditService.extractEntitiesFromContent(html, pageText);

            // 4. Calculate coverage metrics
            const coverageMetrics = EntityCoverageAuditService.calculateCoverage(detectedEntities, finalExpectedEntities);

            // 5. Calculate overall relevance score
            const entityRelevanceScore = EntityCoverageAuditService.calculateRelevanceScore(detectedEntities);

            const result: EntityCoverageResult = {
                entityCoveragePercent: coverageMetrics.coveragePercent,
                entityRelevanceScore,
                detectedEntities,
                missingEntities: coverageMetrics.missingEntities,
                expectedEntitiesCount: finalExpectedEntities.length,
                detectedEntitiesCount: detectedEntities.length
            };

            logger.info('Entity coverage analysis completed', result);
            return result;

        } catch (error) {
            logger.error('Error in entity coverage analysis', error as Error);
            throw new Error(`Failed to analyze entity coverage: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Normalize URL by adding protocol if missing
     */
    private static normalizeUrl(url: string): string {
        // Remove any leading/trailing whitespace
        url = url.trim();
        
        // If URL already has a protocol, return as is
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        
        // If URL starts with //, add https:
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        // Otherwise, add https:// prefix
        return 'https://' + url;
    }

    /**
     * Fetch page HTML content
     */
    private static async fetchPageContent(url: string): Promise<string> {
        const https = await import('https');
        const http = await import('http');
        
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const request = protocol.request(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 30000
            }, (response) => {
                // Handle redirects
                if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    resolve(EntityCoverageAuditService.fetchPageContent(response.headers.location));
                    return;
                }

                // Handle non-200 status codes
                if (response.statusCode && response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: Failed to fetch page`));
                    return;
                }

                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', () => {
                    resolve(data);
                });

                response.on('error', (error) => {
                    reject(error);
                });
            });

            request.on('error', (error) => {
                reject(error);
            });

            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });

            request.end();
        });
    }

    /**
     * Extract text content from HTML
     */
    private static extractPageText(html: string): string {
        if (!html || html.trim().length === 0) {
            return '';
        }

        try {
            const $: CheerioAPI = load(html);
            
            // Remove script, style, nav, header, footer, aside elements
            $('script, style, nav, header, footer, aside').remove();
            
            const bodyElement = $('body');
            return bodyElement.length > 0 ? bodyElement.text().trim() : $.text().trim();
        } catch (error) {
            logger.error('Error extracting page text', error as Error);
            return '';
        }
    }

    /**
     * Extract entities from HTML content and page text
     */
    private static extractEntitiesFromContent(html: string, pageText: string): DetectedEntity[] {
        if (!html || !pageText) {
            return [];
        }

        try {
            const $: CheerioAPI = load(html);
            const entityMap = new Map<string, DetectedEntity>();

            // 1. Extract entities from headings (h1-h6)
            ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
                try {
                    $(tag).each((_: number, element: any) => {
                        const headingText = $(element).text().trim();
                        if (headingText) {
                            const entities = EntityCoverageAuditService.extractEntitiesFromText(headingText);
                            
                            entities.forEach(entityName => {
                                const key = entityName.toLowerCase();
                                const existing = entityMap.get(key);
                                
                                if (existing) {
                                    existing.frequency += 2; // Headings count more
                                    if (!existing.firstFoundIn.startsWith('h') || tag < existing.firstFoundIn) {
                                        existing.firstFoundIn = tag as any;
                                    }
                                } else {
                                    entityMap.set(key, {
                                        name: entityName,
                                        type: 'heading',
                                        frequency: 2,
                                        contextScore: EntityCoverageAuditService.calculateHeadingContextScore(tag),
                                        firstFoundIn: tag as any,
                                        relevanceScore: 0 // Will be calculated later
                                    });
                                }
                            });
                        }
                    });
                } catch (error) {
                    logger.warn(`Error extracting entities from ${tag} tags`, error as Error);
                }
            });

            // 2. Extract noun phrases from content
            try {
                const nounPhrases = EntityCoverageAuditService.extractNounPhrases(pageText);
                nounPhrases.forEach(phrase => {
                    const key = phrase.toLowerCase();
                    const existing = entityMap.get(key);
                    
                    if (existing) {
                        existing.frequency += 1;
                    } else {
                        entityMap.set(key, {
                            name: phrase,
                            type: 'noun_phrase',
                            frequency: 1,
                            contextScore: EntityCoverageAuditService.calculateContentContextScore(phrase, pageText),
                            firstFoundIn: 'content',
                            relevanceScore: 0
                        });
                    }
                });
            } catch (error) {
                logger.warn('Error extracting noun phrases', error as Error);
            }

            // 3. Extract repeated concepts
            try {
                const repeatedConcepts = EntityCoverageAuditService.extractRepeatedConcepts(pageText);
                repeatedConcepts.forEach(({ concept, frequency }) => {
                    const key = concept.toLowerCase();
                    const existing = entityMap.get(key);
                    
                    if (existing) {
                        existing.frequency += frequency;
                        existing.type = 'repeated_concept';
                    } else {
                        entityMap.set(key, {
                            name: concept,
                            type: 'repeated_concept',
                            frequency,
                            contextScore: EntityCoverageAuditService.calculateContentContextScore(concept, pageText),
                            firstFoundIn: 'content',
                            relevanceScore: 0
                        });
                    }
                });
            } catch (error) {
                logger.warn('Error extracting repeated concepts', error as Error);
            }

            // Convert map to array and calculate relevance scores
            const entities = Array.from(entityMap.values());
            entities.forEach(entity => {
                entity.relevanceScore = EntityCoverageAuditService.calculateEntityRelevanceScore(entity);
            });

            // Sort by relevance score and return top entities
            return entities
                .filter(entity => entity.relevanceScore > 20) // Filter out low relevance
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, 50); // Limit to top 50 entities
        } catch (error) {
            logger.error('Error in extractEntitiesFromContent', error as Error);
            return [];
        }
    }

    /**
     * Extract entities from text using various patterns
     */
    private static extractEntitiesFromText(text: string): string[] {
        const entities: string[] = [];
        
        // Capitalized words/phrases (potential proper nouns)
        const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
        let match;
        while ((match = capitalizedPattern.exec(text)) !== null) {
            if (match[0].length > 2 && !EntityCoverageAuditService.isStopWord(match[0])) {
                entities.push(match[0]);
            }
        }

        // Technical terms and acronyms
        const acronymPattern = /\b[A-Z]{2,}\b/g;
        while ((match = acronymPattern.exec(text)) !== null) {
            entities.push(match[0]);
        }

        return [...new Set(entities)]; // Remove duplicates
    }

    /**
     * Extract noun phrases from text
     */
    private static extractNounPhrases(text: string): string[] {
        const phrases: string[] = [];
        const words = text.toLowerCase().split(/\s+/);
        
        // Look for multi-word phrases that appear to be important
        for (let i = 0; i < words.length - 1; i++) {
            const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
            const threeWordPhrase = i < words.length - 2 ? `${twoWordPhrase} ${words[i + 2]}` : '';
            
            // Check if phrase looks like a noun phrase (basic heuristics)
            if (EntityCoverageAuditService.looksLikeNounPhrase(twoWordPhrase)) {
                phrases.push(twoWordPhrase);
            }
            
            if (threeWordPhrase && EntityCoverageAuditService.looksLikeNounPhrase(threeWordPhrase)) {
                phrases.push(threeWordPhrase);
            }
        }

        return [...new Set(phrases)];
    }

    /**
     * Extract repeated concepts from text
     */
    private static extractRepeatedConcepts(text: string): Array<{ concept: string, frequency: number }> {
        const wordFreq = new Map<string, number>();
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3 && !EntityCoverageAuditService.isStopWord(word));

        words.forEach(word => {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        });

        return Array.from(wordFreq.entries())
            .filter(([_, freq]) => freq >= 3) // Must appear at least 3 times
            .map(([concept, frequency]) => ({ concept, frequency }))
            .sort((a, b) => b.frequency - a.frequency);
    }

    /**
     * Generate expected entities based on URL and content analysis
     */
    private static generateExpectedEntities(url: string, pageText: string): string[] {
        const expectedEntities: string[] = [];
        const urlObj = new URL(url);
        
        // Extract from domain name
        const domainParts = urlObj.hostname.replace(/^www\./, '').split('.');
        domainParts.forEach(part => {
            if (part.length > 2 && part !== 'com' && part !== 'org' && part !== 'net') {
                expectedEntities.push(EntityCoverageAuditService.capitalizeFirst(part));
            }
        });

        // Extract from URL path
        const pathParts = urlObj.pathname.split('/').filter(part => part.length > 2);
        pathParts.forEach(part => {
            const cleaned = part.replace(/[-_]/g, ' ');
            expectedEntities.push(EntityCoverageAuditService.capitalizeFirst(cleaned));
        });

        // Generate topic-based expected entities from content
        const topicEntities = EntityCoverageAuditService.extractTopicEntities(pageText);
        expectedEntities.push(...topicEntities);

        return [...new Set(expectedEntities)].slice(0, 20); // Limit to 20 expected entities
    }

    /**
     * Extract topic-based entities from content
     */
    private static extractTopicEntities(text: string): string[] {
        const topics: string[] = [];
        
        // Technology-related terms
        const techKeywords = ['javascript', 'python', 'react', 'node', 'api', 'database', 'cloud', 'software', 'development', 'programming'];
        techKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword)) {
                topics.push(EntityCoverageAuditService.capitalizeFirst(keyword));
            }
        });

        // Business-related terms
        const businessKeywords = ['marketing', 'sales', 'business', 'strategy', 'customer', 'service', 'product', 'company'];
        businessKeywords.forEach(keyword => {
            if (text.toLowerCase().includes(keyword)) {
                topics.push(EntityCoverageAuditService.capitalizeFirst(keyword));
            }
        });

        return topics;
    }

    /**
     * Calculate coverage metrics
     */
    private static calculateCoverage(detectedEntities: DetectedEntity[], expectedEntities: string[]) {
        const detectedNames = detectedEntities.map(e => e.name.toLowerCase());
        const expectedLower = expectedEntities.map(e => e.toLowerCase());
        
        const foundEntities = expectedLower.filter(expected => 
            detectedNames.some(detected => 
                detected.includes(expected) || expected.includes(detected)
            )
        );

        const missingEntities = expectedEntities.filter(expected => 
            !detectedNames.some(detected => 
                detected.toLowerCase().includes(expected.toLowerCase()) || 
                expected.toLowerCase().includes(detected.toLowerCase())
            )
        );

        const coveragePercent = expectedEntities.length > 0 
            ? Math.round((foundEntities.length / expectedEntities.length) * 100)
            : 0;

        return { coveragePercent, missingEntities };
    }

    /**
     * Calculate overall relevance score
     */
    private static calculateRelevanceScore(detectedEntities: DetectedEntity[]): number {
        if (detectedEntities.length === 0) return 0;
        
        const totalScore = detectedEntities.reduce((sum, entity) => sum + entity.relevanceScore, 0);
        return Math.round(totalScore / detectedEntities.length);
    }

    /**
     * Calculate entity relevance score
     */
    private static calculateEntityRelevanceScore(entity: DetectedEntity): number {
        let score = 0;
        
        // Base score from frequency (max 40 points)
        score += Math.min(entity.frequency * 5, 40);
        
        // Bonus for headings (max 30 points)
        if (entity.type === 'heading' || entity.firstFoundIn.startsWith('h')) {
            const headingBonus = entity.firstFoundIn === 'h1' ? 30 : 
                                                    entity.firstFoundIn === 'h2' ? 25 : 
                                                    entity.firstFoundIn === 'h3' ? 20 : 15;
            score += headingBonus;
        }
        
        // Context score (max 30 points)
        score += entity.contextScore * 0.3;

        return Math.min(Math.round(score), 100);
    }

    /**
     * Calculate context score for heading
     */
    private static calculateHeadingContextScore(tag: string): number {
        const scores: Record<string, number> = {
            'h1': 100, 'h2': 85, 'h3': 70, 'h4': 55, 'h5': 40, 'h6': 25
        };
        return scores[tag] || 0;
    }

    /**
     * Calculate context score for content entities
     */
    private static calculateContentContextScore(entity: string, text: string): number {
        const entityPositions: number[] = [];
        let searchIndex = 0;
        
        while (true) {
            const index = text.toLowerCase().indexOf(entity.toLowerCase(), searchIndex);
            if (index === -1) break;
            entityPositions.push(index);
            searchIndex = index + entity.length;
        }

        if (entityPositions.length === 0) return 0;

        // Calculate context depth around entity mentions
        let totalContextScore = 0;
        entityPositions.forEach(pos => {
            const contextBefore = text.substring(Math.max(0, pos - 200), pos);
            const contextAfter = text.substring(pos, Math.min(text.length, pos + 200));
            const contextLength = contextBefore.length + contextAfter.length;
            totalContextScore += Math.min(contextLength / 4, 100);
        });

        return Math.round(totalContextScore / entityPositions.length);
    }

    /**
     * Check if text looks like a noun phrase
     */
    private static looksLikeNounPhrase(phrase: string): boolean {
        const words = phrase.split(' ');
        if (words.some(word => EntityCoverageAuditService.isStopWord(word))) return false;
        if (words.every(word => word.length < 3)) return false;
        return true;
    }

    /**
     * Check if word is a stop word
     */
    private static isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
            'this', 'that', 'these', 'those', 'a', 'an', 'some', 'any', 'all', 'each', 'every',
            'no', 'not', 'only', 'just', 'also', 'even', 'still', 'already', 'yet'
        ]);
        return stopWords.has(word.toLowerCase());
    }

    /**
     * Capitalize first letter of string
     */
    private static capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
}

export const entityCoverageAuditService = new EntityCoverageAuditService();
