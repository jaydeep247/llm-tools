/**
 * Answer Completeness Controller
 * Handles API endpoints for answer completeness analysis
 */

import express from 'express';
import { Logger } from '../helpers/logging/Logger';
import {
  answerCompletenessService,
  type AnswerCompletenessMetrics,
} from '../services/AnswerCompletenessService';
import { getDatabase } from '../services/DatabaseService';

const logger = Logger.getInstance();

export class AnswerCompletenessController {
  /**
   * Calculate completeness metrics for an AEO analysis result
   * POST /api/answer-completeness/calculate
   */
  public static async calculateMetrics(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { sessionId, detailedAnalysis } = req.body;

      if (!detailedAnalysis) {
        res.status(400).json({
          error: 'detailedAnalysis is required',
        });
        return;
      }

      logger.info('Calculating answer completeness metrics', {
        sessionId,
        hasAnalysis: !!detailedAnalysis,
      });

      // Calculate metrics
      const metrics = answerCompletenessService.calculateCompletenessMetrics(
        detailedAnalysis
      );

      logger.info('Answer completeness metrics calculated', {
        sessionId,
        completenessScore: metrics.completenessScore,
      });

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Error calculating answer completeness metrics', error as Error);
      res.status(500).json({
        error: 'Failed to calculate metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get completeness metrics for a specific session
   * GET /api/answer-completeness/:sessionId
   */
  public static async getMetricsForSession(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          error: 'sessionId is required',
        });
        return;
      }

      const db = await getDatabase();

      // Get AEO analysis result for this session
      const aeoResult = await db.getAeoAnalysisResultBySessionId(parseInt(sessionId));

      if (!aeoResult) {
        res.status(404).json({
          error: 'No analysis result found for this session',
        });
        return;
      }

      // Parse detailed analysis
      let detailedAnalysis = {};
      if (aeoResult.detailedAnalysis) {
        detailedAnalysis = JSON.parse(aeoResult.detailedAnalysis);
      }

      // Calculate metrics
      const metrics = answerCompletenessService.calculateCompletenessMetrics(
        detailedAnalysis
      );

      res.json({
        success: true,
        data: {
          sessionId: parseInt(sessionId),
          url: aeoResult.url,
          analysisTimestamp: aeoResult.analysisTimestamp,
          metrics,
        },
      });
    } catch (error) {
      logger.error('Error getting completeness metrics for session', error as Error, {
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to get metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get completeness metrics for all sessions of a user
   * GET /api/answer-completeness/user/:userId
   */
  public static async getUserMetrics(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          error: 'userId is required',
        });
        return;
      }

      const db = await getDatabase();

      // Note: DatabaseService doesn't have getAeoAnalysisResultsByUser method
      // This would need to be implemented in DatabaseService to get results by userId
      // For now, return empty array until the method is implemented
      const aeoResults: any[] = [];

      if (aeoResults.length === 0) {
        res.json({
          success: true,
          data: [],
          message: 'Method getAeoAnalysisResultsByUser not yet implemented in DatabaseService',
        });
        return;
      }

      // Calculate metrics for each result
      const metricsArray = aeoResults.map((result: any) => {
        let detailedAnalysis = {};
        if (result.detailedAnalysis) {
          detailedAnalysis = JSON.parse(result.detailedAnalysis);
        }

        const metrics = answerCompletenessService.calculateCompletenessMetrics(
          detailedAnalysis
        );

        return {
          sessionId: result.sessionId,
          url: result.url,
          analysisTimestamp: result.analysisTimestamp,
          metrics,
        };
      });

      res.json({
        success: true,
        data: metricsArray,
      });
    } catch (error) {
      logger.error('Error getting user completeness metrics', error as Error, {
        userId: req.params.userId,
      });
      res.status(500).json({
        error: 'Failed to get user metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get comparative metrics across multiple sessions
   * POST /api/answer-completeness/compare
   */
  public static async compareMetrics(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { sessionIds } = req.body;

      if (!sessionIds || !Array.isArray(sessionIds)) {
        res.status(400).json({
          error: 'sessionIds array is required',
        });
        return;
      }

      const db = await getDatabase();

      // Get AEO analysis results for these sessions
      const aeoResults = [];
      for (const sessionId of sessionIds) {
        const result = await db.getAeoAnalysisResultBySessionId(sessionId);
        if (result) {
          aeoResults.push(result);
        }
      }

      const comparison = aeoResults.map((result: any) => {
        let detailedAnalysis = {};
        if (result.detailedAnalysis) {
          detailedAnalysis = JSON.parse(result.detailedAnalysis);
        }

        const metrics = answerCompletenessService.calculateCompletenessMetrics(
          detailedAnalysis
        );

        return {
          sessionId: result.sessionId,
          url: result.url,
          metrics,
        };
      });

      // Calculate averages
      const avgMetrics = this.calculateAverageMetrics(
        comparison.map((c) => c.metrics)
      );

      res.json({
        success: true,
        data: {
          comparison,
          averages: avgMetrics,
        },
      });
    } catch (error) {
    logger.error('Error comparing completeness metrics', error as Error);
      res.status(500).json({
        error: 'Failed to compare metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Calculate average metrics from multiple metric sets
   */
  private static calculateAverageMetrics(
    metricsList: AnswerCompletenessMetrics[]
  ): Partial<AnswerCompletenessMetrics> {
    if (metricsList.length === 0) return {};

    const sum = metricsList.reduce(
      (acc: any, metrics: AnswerCompletenessMetrics) => ({
        completenessScore: acc.completenessScore + metrics.completenessScore,
        questionsAnswered: acc.questionsAnswered + metrics.questionsAnswered,
        missingCoverage: acc.missingCoverage + metrics.missingCoverage,
        depthScore: acc.depthScore + metrics.depthScore,
        breadthScore: acc.breadthScore + metrics.breadthScore,
        relevanceScore: acc.relevanceScore + metrics.relevanceScore,
        totalQuestionsIdentified:
          acc.totalQuestionsIdentified + metrics.totalQuestionsIdentified,
        fullyAnsweredQuestions:
          acc.fullyAnsweredQuestions + metrics.fullyAnsweredQuestions,
        partiallyAnsweredQuestions:
          acc.partiallyAnsweredQuestions + metrics.partiallyAnsweredQuestions,
        unansweredQuestions:
          acc.unansweredQuestions + metrics.unansweredQuestions,
      }),
      {
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
      }
    );

    const length = metricsList.length;

    return {
      completenessScore: Math.round(sum.completenessScore / length),
      questionsAnswered: Math.round(sum.questionsAnswered / length),
      missingCoverage: Math.round(sum.missingCoverage / length),
      depthScore: Math.round(sum.depthScore / length),
      breadthScore: Math.round(sum.breadthScore / length),
      relevanceScore: Math.round(sum.relevanceScore / length),
      totalQuestionsIdentified: Math.round(sum.totalQuestionsIdentified / length),
      fullyAnsweredQuestions: Math.round(sum.fullyAnsweredQuestions / length),
      partiallyAnsweredQuestions: Math.round(
        sum.partiallyAnsweredQuestions / length
      ),
      unansweredQuestions: Math.round(sum.unansweredQuestions / length),
    };
  }
}
