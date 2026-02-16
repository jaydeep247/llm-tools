/**
 * Missing Information Analysis Service
 * Analyzes page content to identify gaps in expected information and entities
 */

import { Logger } from '../helpers/logging/Logger.js';
import { EntityCoverageAuditService } from './EntityCoverageAuditService.js';
import { CheerioAPI, load } from 'cheerio';

const logger = Logger.getInstance();

export interface MissingEntity {
  entity: string;
  weight: number;
  reason: string;
}

export interface MissingInfoSummary {
  expected_count: number;
  present_count: number;
  missing_count: number;
  gap_percentage: number;
  weighted_gap_score: number;
}

export interface MissingInfoAnalysisResult {
  summary: MissingInfoSummary;
  critical_missing: MissingEntity[];
  minor_missing: MissingEntity[];
}

interface EntityWeight {
  entity: string;
  weight: number;
  category: 'critical' | 'medium' | 'minor';
  reason: string;
}

export class MissingInfoAnalysisService {
  /**
   * Analyze missing information for a given URL
   */
  public static async analyzeMissingInfo(url: string): Promise<MissingInfoAnalysisResult> {
    logger.info('Starting missing information analysis', { url });

    try {
      // Step 1: Normalize URL (add protocol if missing)
      const normalizedUrl = this.normalizeUrl(url);
      logger.info('Normalized URL for analysis', { original: url, normalized: normalizedUrl });
      
      // Step 2: Fetch and parse page content
      const html = await this.fetchPageContent(normalizedUrl);
      const pageText = this.extractPageText(html);
      
      // Step 3: Extract present entities (reuse existing functionality)
      const entityCoverageResult = await EntityCoverageAuditService.analyzeEntityCoverage(normalizedUrl);
      const presentEntities = entityCoverageResult.detectedEntities.map(e => e.name);
      
      // Step 4: Build comprehensive expected entity set with weights
      const expectedEntityWeights = await this.buildExpectedEntitySet(normalizedUrl, html, pageText);
      
      // Step 4: Compare and find missing entities
      const missingEntityWeights = this.findMissingEntities(presentEntities, expectedEntityWeights);
      
      // Step 5: Classify by severity
      const { critical, minor } = this.classifyMissingEntities(missingEntityWeights);
      
      // Step 6: Calculate metrics
      const summary = this.calculateMetrics(expectedEntityWeights, missingEntityWeights);
      
      const result: MissingInfoAnalysisResult = {
        summary,
        critical_missing: critical,
        minor_missing: minor
      };

      logger.info('Missing information analysis completed', { 
        url: normalizedUrl,
        missing_count: summary.missing_count,
        gap_percentage: summary.gap_percentage
      });
      
      return result;

    } catch (error) {
      logger.error('Error in missing information analysis', error as Error);
      throw new Error(`Failed to analyze missing information: ${error instanceof Error ? error.message : String(error)}`);
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
   * Fetch page content
   */
  private static async fetchPageContent(url: string): Promise<string> {
    const https = await import('https');
    const http = await import('http');
    
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const request = protocol.request(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 30000
      }, (response) => {
        // Handle redirects
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          resolve(this.fetchPageContent(response.headers.location));
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

      request.end();
    });
  }

  /**
   * Extract text content from HTML
   */
  private static extractPageText(html: string): string {
    try {
      const $: CheerioAPI = load(html);
      
      // Remove script and style elements
      $('script, style, nav, footer, header').remove();
      
      // Get text content
      const text = $('body').text() || $.text();
      
      return text.replace(/\s+/g, ' ').trim();
    } catch (error) {
      logger.warn('Error extracting page text', error as Error);
      return '';
    }
  }

  /**
   * Build comprehensive expected entity set with weights based on multiple sources
   */
  private static async buildExpectedEntitySet(url: string, html: string, pageText: string): Promise<EntityWeight[]> {
    const expectedEntities: EntityWeight[] = [];
    const urlObj = new URL(url);
    const $: CheerioAPI = load(html);
    
    // 1. Extract from URL structure and domain (high weight for brand/company info)
    this.extractUrlBasedEntities(urlObj, expectedEntities);
    
    // 2. Extract from page title and meta tags (critical for topic coverage)
    this.extractMetaBasedEntities($, expectedEntities);
    
    // 3. Extract from content structure (headings, lists, tables)
    this.extractStructuralEntities($, expectedEntities);
    
    // 4. Industry-specific entity patterns
    this.extractIndustryEntities(pageText, url, expectedEntities);
    
    // 5. Trust and credibility entities
    this.extractTrustEntities($, expectedEntities);
    
    // 6. Transactional/decision support entities
    this.extractTransactionalEntities($, pageText, expectedEntities);
    
    // Remove duplicates and normalize
    const uniqueEntities = this.deduplicateEntities(expectedEntities);
    
    return uniqueEntities;
  }

  /**
   * Extract URL-based entities (domain, path segments)
   */
  private static extractUrlBasedEntities(urlObj: URL, entities: EntityWeight[]): void {
    // Domain-based entities
    const domain = urlObj.hostname.replace(/^www\./, '');
    const domainParts = domain.split('.');
    
    domainParts.forEach(part => {
      if (part.length > 2 && !['com', 'org', 'net', 'io', 'co'].includes(part)) {
        entities.push({
          entity: this.capitalizeFirst(part),
          weight: 8,
          category: 'critical',
          reason: 'Brand/company name from domain'
        });
      }
    });

    // Path-based entities
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 2);
    pathParts.forEach(part => {
      const cleaned = part.replace(/[-_]/g, ' ').replace(/\.(html?|php)$/, '');
      entities.push({
        entity: this.capitalizeFirst(cleaned),
        weight: 6,
        category: 'medium',
        reason: 'Topic indicator from URL path'
      });
    });
  }

  /**
   * Extract meta-based entities (title, description, keywords)
   */
  private static extractMetaBasedEntities($: CheerioAPI, entities: EntityWeight[]): void {
    // Page title entities
    const title = $('title').text();
    if (title) {
      const titleEntities = this.extractImportantTerms(title);
      titleEntities.forEach(entity => {
        entities.push({
          entity,
          weight: 9,
          category: 'critical',
          reason: 'Main topic from page title'
        });
      });
    }

    // Meta description
    const description = $('meta[name="description"]').attr('content') || '';
    if (description) {
      const descEntities = this.extractImportantTerms(description);
      descEntities.forEach(entity => {
        entities.push({
          entity,
          weight: 7,
          category: 'medium',
          reason: 'Key concept from meta description'
        });
      });
    }
  }

  /**
   * Extract structural entities from headings, lists, and tables
   */
  private static extractStructuralEntities($: CheerioAPI, entities: EntityWeight[]): void {
    // H1 entities (highest weight)
    $('h1').each((_: any, el: any) => {
      const text = $(el).text();
      const h1Entities = this.extractImportantTerms(text);
      h1Entities.forEach(entity => {
        entities.push({
          entity,
          weight: 10,
          category: 'critical',
          reason: 'Primary topic from main heading'
        });
      });
    });

    // H2/H3 entities (medium weight)
    $('h2, h3').each((_: any, el: any) => {
      const text = $(el).text();
      const headingEntities = this.extractImportantTerms(text);
      headingEntities.forEach(entity => {
        entities.push({
          entity,
          weight: 6,
          category: 'medium',
          reason: 'Subtopic from section heading'
        });
      });
    });
  }

  /**
   * Extract industry-specific expected entities
   */
  private static extractIndustryEntities(pageText: string, url: string, entities: EntityWeight[]): void {
    const text = pageText.toLowerCase();
    
    // Technology/Software
    if (this.matchesPattern(text, ['software', 'development', 'programming', 'technology', 'api', 'platform'])) {
      this.addIndustryEntities(entities, [
        { entity: 'Features', weight: 8, reason: 'Expected for software/tech products' },
        { entity: 'Pricing', weight: 9, reason: 'Critical for software decisions' },
        { entity: 'Documentation', weight: 7, reason: 'Essential for technical products' },
        { entity: 'Support', weight: 6, reason: 'Important for tech services' }
      ]);
    }

    // E-commerce/Product
    if (this.matchesPattern(text, ['product', 'price', 'buy', 'shop', 'store', 'cart'])) {
      this.addIndustryEntities(entities, [
        { entity: 'Product specifications', weight: 9, reason: 'Critical for product pages' },
        { entity: 'Price', weight: 10, reason: 'Essential for purchase decisions' },
        { entity: 'Shipping information', weight: 7, reason: 'Important for e-commerce' },
        { entity: 'Customer reviews', weight: 8, reason: 'Trust factor for products' },
        { entity: 'Return policy', weight: 6, reason: 'Purchase confidence factor' }
      ]);
    }

    // Service/Business
    if (this.matchesPattern(text, ['service', 'business', 'company', 'consulting', 'agency'])) {
      this.addIndustryEntities(entities, [
        { entity: 'Services offered', weight: 9, reason: 'Core content for service businesses' },
        { entity: 'Contact information', weight: 8, reason: 'Essential for service providers' },
        { entity: 'Case studies', weight: 7, reason: 'Trust builder for services' },
        { entity: 'Team information', weight: 6, reason: 'Credibility for professional services' }
      ]);
    }
  }

  /**
   * Extract trust and credibility entities
   */
  private static extractTrustEntities($: CheerioAPI, entities: EntityWeight[]): void {
    const trustEntities = [
      { entity: 'Contact information', weight: 7, reason: 'Essential for credibility' },
      { entity: 'About us', weight: 6, reason: 'Trust building content' },
      { entity: 'Privacy policy', weight: 5, reason: 'Legal compliance and trust' },
      { entity: 'Terms of service', weight: 5, reason: 'Legal framework' }
    ];

    // Check if these common trust elements are missing
    const hasContact = $('a[href*="contact"], a[href*="mailto:"]').length > 0;
    const hasAbout = $('a[href*="about"]').length > 0;
    const hasPrivacy = $('a[href*="privacy"]').length > 0;

    trustEntities.forEach(trustEntity => {
      entities.push({
        entity: trustEntity.entity,
        weight: trustEntity.weight,
        category: 'medium',
        reason: trustEntity.reason
      });
    });
  }

  /**
   * Extract transactional/decision support entities
   */
  private static extractTransactionalEntities($: CheerioAPI, pageText: string, entities: EntityWeight[]): void {
    const text = pageText.toLowerCase();
    
    // If this appears to be a commercial page
    if (this.matchesPattern(text, ['buy', 'purchase', 'order', 'pricing', 'cost', 'free', 'trial'])) {
      const transactionalEntities = [
        { entity: 'Pricing details', weight: 10, reason: 'Critical for purchase decisions' },
        { entity: 'Free trial information', weight: 8, reason: 'Reduces purchase friction' },
        { entity: 'Payment options', weight: 7, reason: 'Transaction facilitation' },
        { entity: 'Money-back guarantee', weight: 6, reason: 'Purchase confidence' }
      ];

      transactionalEntities.forEach(entity => {
        entities.push({
          entity: entity.entity,
          weight: entity.weight,
          category: entity.weight >= 8 ? 'critical' : entity.weight < 8 ? 'medium' : 'minor',
          reason: entity.reason
        });
      });
    }
  }

  /**
   * Find missing entities by comparing present vs expected
   */
  private static findMissingEntities(presentEntities: string[], expectedEntityWeights: EntityWeight[]): EntityWeight[] {
    const presentLower = presentEntities.map(e => e.toLowerCase());
    
    return expectedEntityWeights.filter(expected => {
      const expectedLower = expected.entity.toLowerCase();
      
      // Check if any present entity matches (exact or partial match)
      return !presentLower.some(present => 
        present.includes(expectedLower) || expectedLower.includes(present) ||
        this.calculateSimilarity(present, expectedLower) > 0.7
      );
    });
  }

  /**
   * Classify missing entities by severity
   */
  private static classifyMissingEntities(missingEntities: EntityWeight[]): { critical: MissingEntity[], minor: MissingEntity[] } {
    const critical: MissingEntity[] = [];
    const minor: MissingEntity[] = [];

    missingEntities.forEach(entity => {
      const missingEntity: MissingEntity = {
        entity: entity.entity,
        weight: entity.weight,
        reason: entity.reason
      };

      if (entity.weight >= 8 || entity.category === 'critical') {
        critical.push(missingEntity);
      } else {
        minor.push(missingEntity);
      }
    });

    // Sort by weight (highest first)
    critical.sort((a, b) => b.weight - a.weight);
    minor.sort((a, b) => b.weight - a.weight);

    return { critical, minor };
  }

  /**
   * Calculate gap metrics
   */
  private static calculateMetrics(expectedEntityWeights: EntityWeight[], missingEntityWeights: EntityWeight[]): MissingInfoSummary {
    const expectedCount = expectedEntityWeights.length;
    const missingCount = missingEntityWeights.length;
    const presentCount = expectedCount - missingCount;

    const gapPercentage = expectedCount > 0 ? Math.round((missingCount / expectedCount) * 100) : 0;

    // Calculate weighted gap score
    const totalExpectedWeight = expectedEntityWeights.reduce((sum, entity) => sum + entity.weight, 0);
    const totalMissingWeight = missingEntityWeights.reduce((sum, entity) => sum + entity.weight, 0);
    
    const weightedGapScore = totalExpectedWeight > 0 ? 
      Math.round((totalMissingWeight / totalExpectedWeight) * 100) / 100 : 0;

    return {
      expected_count: expectedCount,
      present_count: presentCount,
      missing_count: missingCount,
      gap_percentage: gapPercentage,
      weighted_gap_score: weightedGapScore
    };
  }

  // Helper methods
  private static capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private static extractImportantTerms(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));

    // Extract noun phrases (simple approach)
    const terms: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      const twoWord = `${words[i]} ${words[i + 1]}`;
      if (twoWord.length > 6) {
        terms.push(this.capitalizeFirst(twoWord));
      }
    }

    // Add significant single words
    words.forEach(word => {
      if (word.length > 4 && !this.isStopWord(word)) {
        terms.push(this.capitalizeFirst(word));
      }
    });

    return [...new Set(terms)].slice(0, 5); // Limit to top 5 terms
  }

  private static matchesPattern(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private static addIndustryEntities(entities: EntityWeight[], industryEntities: { entity: string; weight: number; reason: string }[]): void {
    industryEntities.forEach(({ entity, weight, reason }) => {
      entities.push({
        entity,
        weight,
        category: weight >= 8 ? 'critical' : weight < 8 ? 'medium' : 'minor',
        reason
      });
    });
  }

  private static calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    const distance = matrix[len2][len1];
    return 1 - distance / Math.max(len1, len2);
  }

  private static deduplicateEntities(entities: EntityWeight[]): EntityWeight[] {
    const seen = new Map<string, EntityWeight>();
    
    entities.forEach(entity => {
      const key = entity.entity.toLowerCase();
      const existing = seen.get(key);
      
      if (!existing || entity.weight > existing.weight) {
        seen.set(key, entity);
      }
    });
    
    return Array.from(seen.values());
  }

  private static isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ]);
    return stopWords.has(word.toLowerCase());
  }
}