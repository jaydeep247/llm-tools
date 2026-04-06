import { connectToMongo } from '../../config/mongo';
import { logger } from '../../shared/logger/logger';
import { SerpAnalyzerResult } from './moduleA.types';
import { JobRepository } from '../job/job.repository';

export class ModuleAService {
  private jobRepository = new JobRepository();

  /**
   * Retrieve SERP Analyzer result for a specific job.
   * Resolves cacheSourceJobId transparently so cache-hit sessions
   * are served from the original job's data without re-querying DataForSEO.
   */
  async getSerpResult(jobId: string): Promise<SerpAnalyzerResult | null> {
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    const db = await connectToMongo();
    const result = await db.collection('serp_results').findOne({ jobId: effectiveId });
    if (!result) return null;
    return result as unknown as SerpAnalyzerResult;
  }

  /**
   * Retrieve all SERP Analyzer results for a session (across multiple jobs).
   * Cache-hit jobs share the same cacheSourceJobId, so results may come from
   * another session's jobs — the serp_results collection is queried by the
   * effective jobId resolved per job.
   */
  async getSessionSerpResults(sessionId: string): Promise<SerpAnalyzerResult[]> {
    const db = await connectToMongo();
    const results = await db
      .collection('serp_results')
      .find({ sessionId })
      .sort({ updatedAt: -1 })
      .toArray();
    return results as unknown as SerpAnalyzerResult[];
  }

  /**
   * Retrieve a single keyword's historical rank data for a domain+keyword pair
   * across multiple serp_results documents (i.e. across multiple jobs/runs).
   */
  async getKeywordHistory(
    sessionId: string,
    keyword: string,
  ): Promise<Array<{ timestamp: string; rank: number | null; jobId: string }>> {
    try {
      const db = await connectToMongo();
      const docs = await db
        .collection('serp_results')
        .find(
          { sessionId, 'keyword_results.keyword': keyword },
          { projection: { jobId: 1, timestamp: 1, keyword_results: 1 } },
        )
        .sort({ timestamp: 1 })
        .toArray();

      return docs.map((doc: any) => {
        const kwResult = (doc.keyword_results || []).find(
          (r: any) => r.keyword === keyword,
        );
        return {
          timestamp: kwResult?.timestamp ?? doc.timestamp,
          rank: kwResult?.target_rank ?? null,
          jobId: doc.jobId,
        };
      });
    } catch (error: any) {
      logger.error(`[MODULE_A] getKeywordHistory failed: ${error.message}`);
      throw error;
    }
  }
}
