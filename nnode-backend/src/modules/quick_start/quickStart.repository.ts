import type { WithId, Document } from 'mongodb';
import { connectToMongo } from '../../config/mongo';
import type { QuickStartResult } from './quickStart.types';
import { logger } from '../../shared/logger/logger';

type QuickStartDocument = WithId<Document> & {
  jobId: string;
  brand_analysis?: QuickStartResult['brand_analysis'];
  competitor_mentions?: QuickStartResult['competitor_mentions'];
  ai_share_of_voice?: QuickStartResult['ai_share_of_voice'];
  ai_sov_history?: QuickStartResult['ai_sov_history'];
  ranking_analysis?: QuickStartResult['ranking_analysis'];
  crawl_status?: QuickStartResult['crawl_status'];
  crawlUpdatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class QuickStartRepository {
  private async getCollection() {
    const db = await connectToMongo();
    return db.collection<QuickStartDocument>('job_summaries');
  }

  private toQuickStartResult(doc: QuickStartDocument): QuickStartResult {
    return {
      jobId: doc.jobId,
      brand_analysis: doc.brand_analysis,
      competitor_mentions: doc.competitor_mentions,
      ai_share_of_voice: doc.ai_share_of_voice,
      ai_sov_history: doc.ai_sov_history,
      ranking_analysis: doc.ranking_analysis,
      crawl_status: doc.crawl_status,
      crawlUpdatedAt: doc.crawlUpdatedAt ? doc.crawlUpdatedAt.toISOString() : undefined,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined,
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined,
    };
  }

  /**
   * Get Quick Start result by job ID
   */
  async getByJobId(jobId: string): Promise<QuickStartResult | null> {
    try {
      const collection = await this.getCollection();
      const doc = await collection.findOne({ jobId });
      return doc ? this.toQuickStartResult(doc) : null;
    } catch (error) {
      logger.error('Failed to get Quick Start result', { jobId, error });
      throw error;
    }
  }

  /**
   * Delete Quick Start result by job ID
   */
  async deleteByJobId(jobId: string): Promise<boolean> {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ jobId });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error('Failed to delete Quick Start result', { jobId, error });
      throw error;
    }
  }
}

export const quickStartRepository = new QuickStartRepository();
