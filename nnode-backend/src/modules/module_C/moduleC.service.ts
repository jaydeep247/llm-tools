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
}
