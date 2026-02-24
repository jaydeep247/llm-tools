import type { WithId, Document } from 'mongodb';
import { connectToMongo } from '../../config/mongo';
import type { ModuleEResult } from './moduleE.types';
import { logger } from '../../shared/logger/logger';

type ModuleEDocument = WithId<Document> & {
  jobId: string;
  content_consistency?: ModuleEResult['content_consistency'];
  entity_coverage?: ModuleEResult['entity_coverage'];
  brand_analysis?: ModuleEResult['brand_analysis'];
  sentiment_tracking?: ModuleEResult['sentiment_tracking'];
  competitor_mentions?: ModuleEResult['competitor_mentions'];
  ai_share_of_voice?: ModuleEResult['ai_share_of_voice'];
  ranking_analysis?: ModuleEResult['ranking_analysis'];
  ai_sov_history?: ModuleEResult['ai_sov_history'];
  score_history?: ModuleEResult['score_history'];
  master_analysis?: ModuleEResult['master_analysis'];
  createdAt?: Date;
  updatedAt?: Date;
};

export class ModuleERepository {
  private async getCollection() {
    const db = await connectToMongo();
    return db.collection<ModuleEDocument>('module_e');
  }

  private toModuleEResult(doc: ModuleEDocument): ModuleEResult {
    return {
      jobId: doc.jobId,
      content_consistency: doc.content_consistency,
      entity_coverage: doc.entity_coverage,
      brand_analysis: doc.brand_analysis,
      sentiment_tracking: doc.sentiment_tracking,
      competitor_mentions: doc.competitor_mentions,
      ai_share_of_voice: doc.ai_share_of_voice,
      ranking_analysis: doc.ranking_analysis,
      ai_sov_history: doc.ai_sov_history,
      score_history: doc.score_history,
      master_analysis: doc.master_analysis,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : undefined,
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : undefined,
    };
  }

  /**
   * Create or update Module E result
   */
  async upsertModuleEResult(jobId: string, data: ModuleEResult): Promise<ModuleEResult | null> {
    try {
      const collection = await this.getCollection();
      const now = new Date();

      const result = await collection.findOneAndUpdate(
        { jobId },
        {
          $set: {
            jobId,
            content_consistency: data.content_consistency ?? undefined,
            entity_coverage: data.entity_coverage ?? undefined,
            brand_analysis: data.brand_analysis ?? undefined,
            sentiment_tracking: data.sentiment_tracking ?? undefined,
            competitor_mentions: data.competitor_mentions ?? undefined,
            ai_share_of_voice: data.ai_share_of_voice ?? undefined,
            ranking_analysis: data.ranking_analysis ?? undefined,
            master_analysis: data.master_analysis ?? undefined,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      logger.info('Module E result upserted', {
        jobId,
        hasContentConsistency: !!data.content_consistency,
        hasEntityCoverage: !!data.entity_coverage,
        hasBrandAnalysis: !!data.brand_analysis,
        hasSentimentTracking: !!data.sentiment_tracking,
      });

      const doc = (result as any)?.value || result;
      return doc ? this.toModuleEResult(doc as ModuleEDocument) : null;
    } catch (error) {
      logger.error('Failed to upsert Module E result', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get Module E result by job ID
   */
  async getModuleEResultByJobId(jobId: string): Promise<ModuleEResult | null> {
    try {
      const collection = await this.getCollection();
      const result = await collection.findOne({ jobId });

      if (!result) {
        return null;
      }

      return this.toModuleEResult(result);
    } catch (error) {
      logger.error('Failed to get Module E result', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete Module E result by job ID
   */
  async deleteModuleEResult(jobId: string): Promise<boolean> {
    try {
      const collection = await this.getCollection();
      const result = await collection.deleteOne({ jobId });

      logger.info('Module E result deleted', {
        jobId,
        deletedCount: result.deletedCount,
      });

      return result.deletedCount > 0;
    } catch (error) {
      logger.error('Failed to delete Module E result', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all Module E results (with pagination)
   */
  async getAllModuleEResults(skip = 0, take = 10): Promise<ModuleEResult[]> {
    try {
      const collection = await this.getCollection();
      const results = await collection
        .find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(take)
        .toArray();

      logger.info('Module E results retrieved', {
        count: results.length,
        skip,
        take,
      });

      return results.map((doc) => this.toModuleEResult(doc));
    } catch (error) {
      logger.error('Failed to get Module E results', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update specific fields of Module E result
   */
  async updateModuleEFields(
    jobId: string,
    fields: Partial<ModuleEResult>
  ): Promise<ModuleEResult | null> {
    try {
      const updateData: Partial<ModuleEDocument> = {
        updatedAt: new Date(),
      };

      if (fields.content_consistency !== undefined) {
        updateData.content_consistency = fields.content_consistency;
      }
      if (fields.entity_coverage !== undefined) {
        updateData.entity_coverage = fields.entity_coverage;
      }
      if (fields.brand_analysis !== undefined) {
        updateData.brand_analysis = fields.brand_analysis;
      }
      if (fields.sentiment_tracking !== undefined) {
        updateData.sentiment_tracking = fields.sentiment_tracking;
      }

      if (fields.competitor_mentions !== undefined) {
        updateData.competitor_mentions = fields.competitor_mentions;
      }
      if (fields.ai_share_of_voice !== undefined) {
        updateData.ai_share_of_voice = fields.ai_share_of_voice;
      }
      if (fields.ranking_analysis !== undefined) {
        updateData.ranking_analysis = fields.ranking_analysis;
      }
      if (fields.master_analysis !== undefined) {
        updateData.master_analysis = fields.master_analysis;
      }

      const collection = await this.getCollection();
      const result = await collection.findOneAndUpdate(
        { jobId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      logger.info('Module E fields updated', {
        jobId,
        updatedFields: Object.keys(updateData),
      });

      const doc = (result as any)?.value || result;
      return doc ? this.toModuleEResult(doc as ModuleEDocument) : null;
    } catch (error) {
      logger.error('Failed to update Module E fields', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Count Module E records
   */
  async countModuleEResults(): Promise<number> {
    try {
      const collection = await this.getCollection();
      const count = await collection.countDocuments();
      logger.info('Module E record count', { count });
      return count;
    } catch (error) {
      logger.error('Failed to count Module E results', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const moduleERepository = new ModuleERepository();
