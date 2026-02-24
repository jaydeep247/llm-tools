import { connectToMongo } from '../../config/mongo';
import { logger } from '../../shared/logger/logger';
import { ModuleCResult } from './moduleC.types';

export class ModuleCService {
  /**
   * Get Module C (AEO) analysis result for a specific job
   */
  async getModuleCResult(jobId: string, _userId: string): Promise<ModuleCResult | null> {
    try {
      const db = await connectToMongo();
      const collection = db.collection('aeo_analysis');
      
      // Find the most recent analysis for this job
      const result = await collection.findOne(
        { jobId },
        { sort: { timestamp: -1 } }
      );

      if (!result) {
        return null;
      }

      return result as unknown as ModuleCResult;
    } catch (error: any) {
      logger.error(`Error getting Module C result: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all Module C (AEO) analysis results for a job (multiple URLs)
   */
  async getAllModuleCResults(jobId: string): Promise<ModuleCResult[]> {
    try {
      const db = await connectToMongo();
      const collection = db.collection('aeo_analysis');
      
      const results = await collection
        .find({ jobId })
        .sort({ timestamp: -1 })
        .toArray();

      return results as unknown as ModuleCResult[];
    } catch (error: any) {
      logger.error(`Error getting Module C results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Module C result for a specific URL in a session
   */
  async getModuleCResultByUrl(jobId: string, url: string): Promise<ModuleCResult | null> {
    try {
      const db = await connectToMongo();
      const collection = db.collection('aeo_analysis');
      
      // Normalize URL for matching
      const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const altUrl = url.endsWith('/') ? url : url + '/';
      
      const result = await collection.findOne({
        jobId,
        $or: [
          { url: normalizedUrl },
          { url: altUrl },
          { url }
        ]
      });

      return result as unknown as ModuleCResult;
    } catch (error: any) {
      logger.error(`Error getting Module C result by URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Module C results for a session (across all jobs)
   */
  async getSessionModuleCResults(sessionId: string): Promise<ModuleCResult[]> {
    try {
      const db = await connectToMongo();
      
      // First, get all jobs for this session
      const jobsCollection = db.collection('jobs');
      const jobs = await jobsCollection.find({ sessionId }).toArray();
      
      if (!jobs.length) {
        return [];
      }

      const jobIds = jobs.map(j => j.id);
      
      // Then get all aeo_analysis results for these jobs
      const aeoCollection = db.collection('aeo_analysis');
      const results = await aeoCollection
        .find({ jobId: { $in: jobIds } })
        .sort({ timestamp: -1 })
        .toArray();

      return results as unknown as ModuleCResult[];
    } catch (error: any) {
      logger.error(`Error getting session Module C results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific module field from Module C result
   */
  async getModuleField(jobId: string, field: string): Promise<any> {
    try {
      const db = await connectToMongo();
      const collection = db.collection('aeo_analysis');
      
      const result = await collection.findOne(
        { jobId },
        { 
          sort: { timestamp: -1 },
          projection: { 
            jobId: 1, 
            url: 1, 
            [`modules.${field}`]: 1,
            timestamp: 1 
          }
        }
      );

      if (!result) {
        return null;
      }

      return {
        jobId: result.jobId,
        url: result.url,
        data: result.modules?.[field] || null,
        timestamp: result.timestamp,
      };
    } catch (error: any) {
      logger.error(`Error getting Module C field ${field}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get summary with overall score and all module scores
   */
  async getSummary(jobId: string): Promise<any> {
    try {
      const db = await connectToMongo();
      const collection = db.collection('aeo_analysis');
      
      const result = await collection.findOne(
        { jobId },
        { sort: { timestamp: -1 } }
      );

      if (!result) {
        return null;
      }

      const modules = result.modules || {};
      
      return {
        jobId: result.jobId,
        url: result.url,
        overall_score: result.overall_score,
        module_scores: {
          ai_presence: modules.ai_presence?.score ?? null,
          answerability: modules.answerability?.score ?? null,
          knowledge_base: modules.knowledge_base?.score ?? null,
          llm_simulator: modules.llm_simulator?.cross_model_metrics?.consistency_score ?? null,
        },
        actionable_insights: {
          total_actions: modules.actionable_insights?.totalActions ?? 0,
          priority_breakdown: modules.actionable_insights?.priorityBreakdown ?? {},
          current_score: modules.actionable_insights?.currentScore ?? null,
          predicted_score: modules.actionable_insights?.predictedScore ?? null,
          improvement: modules.actionable_insights?.improvement ?? 0,
        },
        timestamp: result.timestamp,
      };
    } catch (error: any) {
      logger.error(`Error getting Module C summary: ${error.message}`);
      throw error;
    }
  }
}
