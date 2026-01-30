/**
 * Answer Completeness Analysis Service
 * Calculates and stores answer completeness metrics for AEO analysis
 */

import { Logger } from '../helpers/logging/Logger.js';

export interface AnswerCompletenessMetrics {
  completenessScore: number; // 0-100
  questionsAnswered: number; // percentage
  missingCoverage: number; // percentage
  depthScore: number; // 0-100
  breadthScore: number; // 0-100
  relevanceScore: number; // 0-100
  totalQuestionsIdentified: number;
  fullyAnsweredQuestions: number;
  partiallyAnsweredQuestions: number;
  unansweredQuestions: number;
  recommendations: string[];
}

export interface DetailedAnalysisData {
  answer_completeness?: {
    completeness_percentage?: number;
    questions_answered?: number;
    missing_answers?: string[];
    covered_aspects?: string[];
    missing_aspects?: string[];
  };
  entity_coverage?: {
    found_entities?: any[];
    missing_entities?: any[];
  };
  answerability_score?: number;
  structured_data?: {
    score?: number;
  };
  module_scores?: {
    A?: number;
    B?: number;
    C?: number;
    D?: number;
    E?: number;
  };
}

export class AnswerCompletenessService {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Calculate answer completeness metrics from AEO analysis result
   */
  public calculateCompletenessMetrics(
    detailedAnalysis: DetailedAnalysisData
  ): AnswerCompletenessMetrics {
    try {
      // Extract available data
      const answerCompleteness = detailedAnalysis.answer_completeness;
      const entityCoverage = detailedAnalysis.entity_coverage;
      const answerabilityScore = detailedAnalysis.answerability_score || 0;
      const structuredDataScore = detailedAnalysis.structured_data?.score || 0;
      const moduleScores = detailedAnalysis.module_scores || {};

      // Calculate completeness score from multiple sources
      let completenessScore = 0;
      let questionsAnswered = 0;
      let missingCoverage = 0;
      let totalQuestions = 0;
      let fullyAnswered = 0;
      let partiallyAnswered = 0;
      let unanswered = 0;

      // Source 1: Direct answer completeness data
      if (answerCompleteness) {
        completenessScore = Math.max(
          completenessScore,
          answerCompleteness.completeness_percentage || 0
        );
        questionsAnswered = answerCompleteness.questions_answered || 0;
        totalQuestions = answerCompleteness.questions_answered || 0;
      }

      // Source 2: Entity coverage percentage
      if (entityCoverage) {
        const foundEntities = Array.isArray(entityCoverage.found_entities)
          ? entityCoverage.found_entities.length
          : 0;
        const missingEntities = Array.isArray(entityCoverage.missing_entities)
          ? entityCoverage.missing_entities.length
          : 0;
        const totalEntities = foundEntities + missingEntities;

        if (totalEntities > 0) {
          const entityCoveragePercentage = (foundEntities / totalEntities) * 100;
          completenessScore = Math.max(completenessScore, entityCoveragePercentage);
          questionsAnswered = Math.max(questionsAnswered, foundEntities);
          missingCoverage = Math.max(missingCoverage, missingEntities);
          totalQuestions = Math.max(totalQuestions, totalEntities);
        }
      }

      // Source 3: Use answerability as fallback
      if (completenessScore === 0 && answerabilityScore > 0) {
        completenessScore = answerabilityScore;
      }

      // Calculate depth score from module scores
      const depthScore = this.calculateDepthScore(
        moduleScores,
        answerabilityScore
      );

      // Calculate breadth score from structured data and coverage
      const breadthScore = this.calculateBreadthScore(
        structuredDataScore,
        totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 100 : 0
      );

      // Calculate relevance score from module consistency
      const relevanceScore = this.calculateRelevanceScore(moduleScores);

      // Categorize questions
      if (totalQuestions > 0) {
        const answerRatio = questionsAnswered / totalQuestions;
        fullyAnswered = Math.floor(questionsAnswered * (answerRatio > 0.75 ? 0.8 : answerRatio));
        partiallyAnswered = Math.floor(questionsAnswered * 0.2);
        unanswered = Math.max(0, totalQuestions - fullyAnswered - partiallyAnswered);
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        completenessScore,
        depthScore,
        breadthScore,
        relevanceScore,
        answerCompleteness
      );

      return {
        completenessScore: Math.round(completenessScore),
        questionsAnswered:
          totalQuestions > 0
            ? Math.round((questionsAnswered / totalQuestions) * 100)
            : 0,
        missingCoverage:
          totalQuestions > 0
            ? Math.round((missingCoverage / totalQuestions) * 100)
            : 0,
        depthScore: Math.round(depthScore),
        breadthScore: Math.round(breadthScore),
        relevanceScore: Math.round(relevanceScore),
        totalQuestionsIdentified: totalQuestions,
        fullyAnsweredQuestions: fullyAnswered,
        partiallyAnsweredQuestions: partiallyAnswered,
        unansweredQuestions: unanswered,
        recommendations,
      };
    } catch (error) {
      this.logger.error('Error calculating completeness metrics', error as Error);
      return this.getDefaultMetrics();
    }
  }

  /**
   * Calculate depth score based on module performance
   */
  private calculateDepthScore(
    moduleScores: Record<string, number>,
    answerabilityScore: number
  ): number {
    if (!moduleScores || Object.keys(moduleScores).length === 0) {
      return answerabilityScore;
    }

    const scores = Object.values(moduleScores).filter((s) => typeof s === 'number');
    if (scores.length === 0) return answerabilityScore;

    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.max(answerabilityScore, average);
  }

  /**
   * Calculate breadth score based on coverage diversity
   */
  private calculateBreadthScore(
    structuredDataScore: number,
    coveragePercentage: number
  ): number {
    // Breadth = average of structured data completeness and coverage diversity
    const average = (structuredDataScore + coveragePercentage) / 2;
    return Math.min(100, average);
  }

  /**
   * Calculate relevance score from module consistency
   */
  private calculateRelevanceScore(
    moduleScores: Record<string, number>
  ): number {
    if (!moduleScores || Object.keys(moduleScores).length === 0) return 0;

    const scores = Object.values(moduleScores).filter((s) => typeof s === 'number');
    if (scores.length === 0) return 0;

    // Calculate standard deviation for consistency
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - average, 2), 0) /
      scores.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher relevance (more consistent)
    // Normalize to 0-100 range
    const relevance = Math.max(0, 100 - stdDev);
    return Math.min(100, relevance);
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(
    completeness: number,
    depth: number,
    breadth: number,
    relevance: number,
    answerCompleteness?: any
  ): string[] {
    const recommendations: string[] = [];

    if (completeness < 60) {
      recommendations.push(
        'Improve answer completeness by covering more user questions and search intents'
      );
    }

    if (completeness < 80) {
      recommendations.push(
        'Add more detailed information to address common user queries'
      );
    }

    if (depth < 60) {
      recommendations.push(
        'Increase content depth with more detailed explanations and examples'
      );
    }

    if (breadth < 60) {
      recommendations.push(
        'Expand content breadth to cover related topics and subtopics'
      );
    }

    if (relevance < 60) {
      recommendations.push(
        'Ensure all content sections are equally relevant and aligned with user intent'
      );
    }

    if (answerCompleteness?.missing_aspects?.length) {
      recommendations.push(
        `Add missing aspects: ${answerCompleteness.missing_aspects.slice(0, 3).join(', ')}`
      );
    }

    if (
      answerCompleteness?.missing_answers &&
      answerCompleteness.missing_answers.length > 0
    ) {
      recommendations.push(
        `Cover unanswered questions: ${answerCompleteness.missing_answers.slice(0, 3).join(', ')}`
      );
    }

    // If all scores are high, provide optimization recommendations
    if (completeness > 80 && depth > 80 && breadth > 80) {
      recommendations.push(
        'Content is well-optimized. Consider updating with fresh data and recent trends'
      );
    }

    return recommendations.slice(0, 5); // Return top 5 recommendations
  }

  /**
   * Get default metrics when calculation fails
   */
  private getDefaultMetrics(): AnswerCompletenessMetrics {
    return {
      completenessScore: 0,
      questionsAnswered: 0,
      missingCoverage: 0,
      depthScore: 0,
      breadthScore: 0,
      relevanceScore: 0,
      totalQuestionsIdentified: 0,
      fullyAnsweredQuestions: 0,
      partiallyAnsweredQuestions: 0,
      unansweredQuestions: 0,
      recommendations: [
        'Unable to calculate metrics. Please ensure content analysis is complete.',
      ],
    };
  }
}

export const answerCompletenessService = new AnswerCompletenessService();
