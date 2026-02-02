/**
 * Entity Extractor Service
 * Extracts and analyzes entities from content for "What LLMs See" analysis
 */

import { Logger } from '../helpers/logging/Logger.js';

const logger = Logger.getInstance();

export interface EntityData {
  text: string;
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export interface EntityMetrics {
  totalEntitiesDetected: number;
  entityTypes: {
    Person: number;
    Product: number;
    Location: number;
    Concept: number;
  };
  missingExpectedEntities: string[];
  extractedEntities: EntityData[];
  overallScore: number;
}

export interface EntityExtractionRequest {
  content: string;
  expectedEntities?: string[];
  sessionId?: number;
}

export class EntityExtractorService {
  /**
   * Extract entities from content using various patterns and heuristics
   */
  public static extractEntities(content: string, expectedEntities: string[] = []): EntityMetrics {
    logger.info('Starting entity extraction', { contentLength: content.length, expectedCount: expectedEntities.length });

    const extractedEntities: EntityData[] = [];
    const entityTypes = { Person: 0, Product: 0, Location: 0, Concept: 0 };

    // Person extraction (names with title patterns, capitalized words)
    const personPatterns = [
      /\b(Mr|Mrs|Ms|Dr|Prof|Professor|CEO|CTO|President|Director)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)(?=\s+(?:said|stated|mentioned|explained|noted|commented))/g,
      /\bby\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
    ];

    // Product extraction (brand names, product terms)
    const productPatterns = [
      /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*?)(?=\s+(?:software|platform|tool|service|app|application|product|solution|system))/g,
      /\b(iPhone|iPad|Android|Windows|MacOS|Linux|Microsoft|Google|Apple|Amazon|Facebook|Meta|Tesla|Nike|Adidas)\b/gi,
      /\b([A-Z][a-zA-Z]*\s+(?:Pro|Plus|Max|Ultra|Premium|Enterprise|Standard|Basic))\b/g
    ];

    // Location extraction (cities, countries, regions)
    const locationPatterns = [
      /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s+(?:city|state|country|region|area))?/g,
      /\b(New York|Los Angeles|London|Paris|Tokyo|Berlin|Sydney|Toronto|Mumbai|Singapore|Dubai)\b/gi,
      /\b([A-Z][a-z]+),\s+([A-Z]{2}|[A-Z][a-z]+)\b/g // City, State/Country format
    ];

    // Concept extraction (technical terms, abstract concepts)
    const conceptPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s+(?:technology|methodology|framework|strategy|approach|concept|theory|principle))/g,
      /\b(AI|ML|API|SaaS|Cloud|IoT|Blockchain|Machine Learning|Artificial Intelligence|Data Science|Big Data|Analytics)\b/gi,
      /\b([a-z]+(?:-[a-z]+)*ing|[a-z]+(?:-[a-z]+)*tion|[a-z]+(?:-[a-z]+)*ness)\b/g
    ];

    // Extract entities using patterns
    this.extractWithPatterns(content, personPatterns, 'Person', extractedEntities);
    this.extractWithPatterns(content, productPatterns, 'Product', extractedEntities);
    this.extractWithPatterns(content, locationPatterns, 'Location', extractedEntities);
    this.extractWithPatterns(content, conceptPatterns, 'Concept', extractedEntities);

    // Count entities by type
    extractedEntities.forEach(entity => {
      if (entity.type in entityTypes) {
        entityTypes[entity.type as keyof typeof entityTypes]++;
      }
    });

    // Find missing expected entities
    const missingExpectedEntities = expectedEntities.filter(expected => {
      const expectedLower = expected.toLowerCase();
      return !extractedEntities.some(entity => 
        entity.text.toLowerCase().includes(expectedLower) ||
        expectedLower.includes(entity.text.toLowerCase())
      );
    });

    // Calculate overall score
    const totalEntitiesDetected = extractedEntities.length;
    const expectedCoverage = expectedEntities.length > 0 ? 
      ((expectedEntities.length - missingExpectedEntities.length) / expectedEntities.length) * 100 : 100;
    const entityDiversity = Object.values(entityTypes).filter(count => count > 0).length * 25; // 0-100 based on types covered
    const overallScore = Math.round((expectedCoverage * 0.6) + (entityDiversity * 0.4));

    logger.info('Entity extraction completed', {
      totalEntitiesDetected,
      entityTypes,
      missingCount: missingExpectedEntities.length,
      overallScore
    });

    return {
      totalEntitiesDetected,
      entityTypes,
      missingExpectedEntities,
      extractedEntities: extractedEntities.slice(0, 100), // Limit to prevent overflow
      overallScore
    };
  }

  /**
   * Extract entities using regex patterns
   */
  private static extractWithPatterns(
    content: string,
    patterns: RegExp[],
    type: string,
    extractedEntities: EntityData[]
  ): void {
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const text = match[1] || match[0];
        const startIndex = match.index + (match[0].indexOf(text));
        const endIndex = startIndex + text.length;

        // Avoid duplicates (case-insensitive)
        const isDuplicate = extractedEntities.some(entity => 
          entity.text.toLowerCase() === text.toLowerCase() &&
          Math.abs(entity.startIndex - startIndex) < 10
        );

        if (!isDuplicate && text.length >= 2 && text.length <= 50) {
          extractedEntities.push({
            text: text.trim(),
            type,
            confidence: this.calculateConfidence(text, type),
            startIndex,
            endIndex
          });
        }
      }
    });
  }

  /**
   * Calculate confidence score for extracted entity
   */
  private static calculateConfidence(text: string, type: string): number {
    let confidence = 0.7; // Base confidence

    // Adjust based on text characteristics
    if (text.length >= 3) confidence += 0.1;
    if (/^[A-Z]/.test(text)) confidence += 0.1; // Starts with capital
    if (text.includes(' ')) confidence += 0.05; // Multi-word
    if (type === 'Person' && /^(Mr|Mrs|Ms|Dr|Prof)/.test(text)) confidence += 0.15;
    if (type === 'Product' && text.length <= 15) confidence += 0.1; // Products usually shorter
    if (type === 'Location' && /^[A-Z][a-z]+,/.test(text)) confidence += 0.1; // City, State format

    return Math.min(Math.round(confidence * 100) / 100, 1.0);
  }

  /**
   * Analyze content from database session
   */
  public static async analyzeSession(sessionId: number, expectedEntities: string[] = []): Promise<EntityMetrics | null> {
    try {
      logger.info('Analyzing entities for session', { sessionId });
      
      // This would typically fetch content from database
      // For now, return a placeholder implementation
      // TODO: Implement database integration
      
      const sampleContent = "This is sample content for testing entity extraction.";
      return this.extractEntities(sampleContent, expectedEntities);
    } catch (error) {
      logger.error('Failed to analyze session entities', error as Error, { sessionId }
      );
      return null;
    }
  }
}

export const entityExtractorService = new EntityExtractorService();