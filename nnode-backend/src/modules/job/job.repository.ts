import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { Job, JobStatus, JobType, CreateJobDto } from './job.types';
import { LiveJobService } from '../../services/live-job.service';
import { logger } from '../../shared/logger/logger';

export class JobRepository {
  private buildDeleteFilter(jobIds: string[], sessionIds: string[] = []): Record<string, unknown> | null {
    const filters: Record<string, unknown>[] = [];

    if (jobIds.length > 0) {
      filters.push({ jobId: { $in: jobIds } });
    }

    if (sessionIds.length > 0) {
      filters.push({ sessionId: { $in: sessionIds } });
    }

    if (filters.length === 0) {
      return null;
    }

    return filters.length === 1 ? filters[0] : { $or: filters };
  }

  private async deleteArtifacts(jobIds: string[], sessionIds: string[]): Promise<void> {
    if (jobIds.length === 0 && sessionIds.length === 0) {
      return;
    }

    const db = await connectToMongo();
    const jobFilter = this.buildDeleteFilter(jobIds);
    const jobOrSessionFilter = this.buildDeleteFilter(jobIds, sessionIds);
    const operations: Promise<unknown>[] = [];

    const queueDelete = (collectionName: string, filter: Record<string, unknown> | null): void => {
      if (!filter) {
        return;
      }

      operations.push(db.collection(collectionName).deleteMany(filter));
    };

    [
      'pages',
      'links',
      'sitemaps',
      'fields',
      'module_c',
      'content_metrics',
      'schemas',
      'job_summaries',
    ].forEach((collectionName) => queueDelete(collectionName, jobFilter));

    [
      'module_e',
      'module_f',
      'prompt_tracking',
      'serp_results',
      'performance_audits',
      'cbm_citation_snapshots',
      'cbm_competitor_cited_urls',
      'cbm_alerts',
      'cbm_aivs_d7',
    ].forEach((collectionName) => queueDelete(collectionName, jobOrSessionFilter));

    if (sessionIds.length > 0) {
      operations.push(db.collection<Job>('jobs').deleteMany({ sessionId: { $in: sessionIds } }));
    }

    if (operations.length > 0) {
      await Promise.all(operations);
    }

    if (jobIds.length > 0) {
      await Promise.all(jobIds.map((id) => LiveJobService.cleanupJob(id)));
    }
  }

  private async deleteBySessionIds(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) {
      return;
    }

    const db = await connectToMongo();
    const jobs = await db
      .collection<Job>('jobs')
      .find(
        { sessionId: { $in: sessionIds } },
        { projection: { id: 1, sessionId: 1 } },
      )
      .toArray();
    const jobIds = jobs.map((job) => job.id);

    await this.deleteArtifacts(jobIds, sessionIds);
  }

  async sweepDeletedArtifacts(jobIds: string[], sessionIds: string[], attempts = 12, delayMs = 2000): Promise<void> {
    if (jobIds.length === 0 && sessionIds.length === 0) {
      return;
    }

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        await this.deleteArtifacts(jobIds, sessionIds);
      } catch (error) {
        logger.warn(
          `[DELETE_SESSION] Artifact sweep attempt ${attempt}/${attempts} failed for sessions ${sessionIds.join(', ')}:`,
          error,
        );
      }
    }
  }

  async create(sessionId: string, projectId: string, data: CreateJobDto): Promise<Job> {
    const db = await connectToMongo();
    const now = new Date();
    const job: Job = {
      id: randomUUID(),
      sessionId,
      projectId,
      url: data.url,
      jobType: data.jobType,
      config: data.config,
      allowSubdomains: data.allowSubdomains,
      runAudits: data.runAudits,
      auditDevice: data.auditDevice,
      captureLinkDetails: data.captureLinkDetails,
      mainKeyword: data.mainKeyword,
      gaPropertyId: data.gaPropertyId,
      // `type` is a legacy alias — always mirror `jobType` so the two fields
      // are never out of sync (e.g. type:'CRAWL' on a MODULE_E_QUICK_START job).
      type: data.jobType,
      schemaType: data.schemaType ?? null,
      status: JobStatus.PENDING,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    };
    await db.collection<Job>('jobs').insertOne(job);
    return job;
  }

  async findById(id: string): Promise<Job | null> {
    const db = await connectToMongo();
    return db.collection<Job>('jobs').findOne({ id });
  }

  async findBySessionId(sessionId: string): Promise<Job[]> {
    const db = await connectToMongo();
    return db
      .collection<Job>('jobs')
      .find({ sessionId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Return any job in the session that is still active (PENDING or RUNNING)
   * for the given jobType.  Used to prevent duplicate concurrent jobs.
   */
  async findActiveBySessionAndType(sessionId: string, jobType: JobType): Promise<Job | null> {
    const db = await connectToMongo();
    return db.collection<Job>('jobs').findOne({
      sessionId,
      jobType,
      status: { $in: [JobStatus.PENDING, JobStatus.RUNNING] },
    });
  }

  async updateStatus(
    id: string,
    status: JobStatus,
    startedAt?: Date | null,
    completedAt?: Date | null,
    errorMessage?: string | null
  ): Promise<Job> {
    const db = await connectToMongo();
    const update: Partial<Job> = { status };
    if (startedAt !== undefined) update.startedAt = startedAt;
    if (completedAt !== undefined) update.completedAt = completedAt;
    if (errorMessage !== undefined) update.errorMessage = errorMessage;

    // For terminal states, guard against out-of-order event delivery:
    // if the job already reached COMPLETED or FAILED, the first write wins.
    const isTerminal = status === JobStatus.COMPLETED || status === JobStatus.FAILED;
    const filter = isTerminal
      ? { id, status: { $nin: [JobStatus.COMPLETED, JobStatus.FAILED] } }
      : { id };

    await db.collection<Job>('jobs').updateOne(filter, { $set: update });
    const job = await this.findById(id);
    if (!job) {
      throw new Error('Job not found');
    }
    return job;
  }

  /**
   * Delete jobs by session ID and all related data (pages, links, sitemaps, fields)
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.deleteBySessionIds([sessionId]);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const db = await connectToMongo();
    const sessions = await db
      .collection('sessions')
      .find({ projectId }, { projection: { id: 1 } })
      .toArray();

    await this.deleteBySessionIds(sessions.map((session: any) => String(session.id)));
  }
}
