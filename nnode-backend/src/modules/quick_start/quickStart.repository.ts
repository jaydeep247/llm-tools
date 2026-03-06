import type { WithId, Document } from 'mongodb';
import { connectToMongo } from '../../config/mongo';
import type { QuickStartResult } from './quickStart.types';
import { logger } from '../../shared/logger/logger';

type ModuleEDocument = WithId<Document> & {
  jobId: string;
  brand_analysis?: QuickStartResult['brand_analysis'];
  competitor_mentions?: QuickStartResult['competitor_mentions'];
  ai_share_of_voice?: QuickStartResult['ai_share_of_voice'];
  ai_sov_history?: QuickStartResult['ai_sov_history'];
  ranking_analysis?: QuickStartResult['ranking_analysis'];
  createdAt?: Date;
  updatedAt?: Date;
};

type JobSummaryDocument = WithId<Document> & {
  jobId: string;
  crawl_status?: QuickStartResult['crawl_status'];
  crawlUpdatedAt?: Date;
};

export class QuickStartRepository {
  private async getModuleECollection() {
    const db = await connectToMongo();
    return db.collection<ModuleEDocument>('module_e');
  }

  private async getJobSummariesCollection() {
    const db = await connectToMongo();
    return db.collection<JobSummaryDocument>('job_summaries');
  }

  private toQuickStartResult(
    analysisDoc: ModuleEDocument,
    summaryDoc: JobSummaryDocument | null,
  ): QuickStartResult {
    return {
      jobId: analysisDoc.jobId,
      brand_analysis: analysisDoc.brand_analysis,
      competitor_mentions: analysisDoc.competitor_mentions,
      ai_share_of_voice: analysisDoc.ai_share_of_voice,
      ai_sov_history: analysisDoc.ai_sov_history,
      ranking_analysis: analysisDoc.ranking_analysis,
      // crawl_status lives in job_summaries
      crawl_status: summaryDoc?.crawl_status,
      crawlUpdatedAt: summaryDoc?.crawlUpdatedAt ? summaryDoc.crawlUpdatedAt.toISOString() : undefined,
      createdAt: analysisDoc.createdAt ? analysisDoc.createdAt.toISOString() : undefined,
      updatedAt: analysisDoc.updatedAt ? analysisDoc.updatedAt.toISOString() : undefined,
    };
  }

  /**
   * Get Quick Start result by job ID.
   * Analysis fields come from module_e; crawl_status comes from job_summaries.
   */
  async getByJobId(jobId: string): Promise<QuickStartResult | null> {
    try {
      const [moduleECol, summariesCol] = await Promise.all([
        this.getModuleECollection(),
        this.getJobSummariesCollection(),
      ]);
      const [analysisDoc, summaryDoc] = await Promise.all([
        moduleECol.findOne({ jobId }),
        summariesCol.findOne({ jobId }),
      ]);
      // Return a minimal result with crawl_status even before the analysis
      // document exists — the background crawl writes crawl_status immediately
      // (via _update_crawl_status in runner.py) whereas the module_e document
      // is only written once the analysis phases complete (~60 s later).
      // Without this, the frontend never sees crawl_status:'running' during
      // the early phase and the CrawlStatusBanner stays hidden.
      if (!analysisDoc) {
        if (!summaryDoc?.crawl_status) return null;
        return {
          jobId,
          crawl_status: summaryDoc.crawl_status,
          crawlUpdatedAt: summaryDoc.crawlUpdatedAt ? summaryDoc.crawlUpdatedAt.toISOString() : undefined,
        } as QuickStartResult;
      }
      return this.toQuickStartResult(analysisDoc, summaryDoc);
    } catch (error) {
      logger.error('Failed to get Quick Start result', { jobId, error });
      throw error;
    }
  }

  /**
   * Delete Quick Start result by job ID (clears both collections).
   */
  async deleteByJobId(jobId: string): Promise<boolean> {
    try {
      const [moduleECol, summariesCol] = await Promise.all([
        this.getModuleECollection(),
        this.getJobSummariesCollection(),
      ]);
      const [eResult] = await Promise.all([
        moduleECol.deleteOne({ jobId }),
        summariesCol.deleteOne({ jobId }),
      ]);
      return eResult.deletedCount > 0;
    } catch (error) {
      logger.error('Failed to delete Quick Start result', { jobId, error });
      throw error;
    }
  }
}

export const quickStartRepository = new QuickStartRepository();
