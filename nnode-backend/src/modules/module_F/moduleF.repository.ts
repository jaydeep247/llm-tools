import type { WithId, Document } from 'mongodb';
import { connectToMongo } from '../../config/mongo';
import type { ModuleFResult } from './moduleF.types';
import { logger } from '../../shared/logger/logger';

type ModuleFDocument = WithId<Document> & {
  jobId: string;
  sessionId?: string;
  url?: string;
  compare_visibility_against_competitors?: ModuleFResult['compare_visibility_against_competitors'];
  competitor_wins?: ModuleFResult['competitor_wins'];
  gap_analysis?: ModuleFResult['gap_analysis'];
  gap_opportunities?: ModuleFResult['gap_opportunities'];
  source_analysis?: ModuleFResult['source_analysis'];
  metric_recommendations?: ModuleFResult['metric_recommendations'];
  recommendations?: ModuleFResult['recommendations'];
  moat4_recommendations?: ModuleFResult['moat4_recommendations'];
  emerging_trends?: ModuleFResult['emerging_trends'];
  createdAt?: Date;
  updatedAt?: Date;
};

export class ModuleFRepository {
  private async getCollection() {
    const db = await connectToMongo();
    return db.collection<ModuleFDocument>('module_f');
  }

  private toModuleFResult(doc: ModuleFDocument): ModuleFResult {
    return {
      jobId: doc.jobId,
      url: doc.url,
      compare_visibility_against_competitors: doc.compare_visibility_against_competitors,
      competitor_wins: doc.competitor_wins,
      gap_analysis: doc.gap_analysis,
      gap_opportunities: doc.gap_opportunities,
      source_analysis: doc.source_analysis,
      metric_recommendations: doc.metric_recommendations,
      recommendations: doc.recommendations,
      moat4_recommendations: doc.moat4_recommendations,
      emerging_trends: doc.emerging_trends,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined,
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined,
    };
  }

  async getModuleFResultByJobId(jobId: string): Promise<ModuleFResult | null> {
    try {
      const collection = await this.getCollection();
      const result = await collection.findOne({ jobId });
      if (!result) return null;
      return this.toModuleFResult(result);
    } catch (error) {
      logger.error('Failed to get Module F result', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getLatestModuleFResultBySessionId(sessionId: string): Promise<ModuleFResult | null> {
    try {
      const collection = await this.getCollection();
      const result = await collection.findOne(
        { sessionId },
        {
          sort: {
            updatedAt: -1,
            createdAt: -1,
          },
        },
      );
      if (!result) return null;
      return this.toModuleFResult(result);
    } catch (error) {
      logger.error('Failed to get latest Module F result by sessionId', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getModuleFHistoryByUrl(url: string): Promise<ModuleFResult[]> {
    try {
      const collection = await this.getCollection();
      const results = await collection
        .find({ url })
        .sort({ createdAt: 1 })
        .toArray();
      
      return results.map(doc => this.toModuleFResult(doc));
    } catch (error) {
      logger.error('Failed to get Module F history', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const moduleFRepository = new ModuleFRepository();

