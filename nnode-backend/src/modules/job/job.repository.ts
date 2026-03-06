import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { Job, JobStatus, JobType, CreateJobDto } from './job.types';
import { LiveJobService } from '../../services/live-job.service';

export class JobRepository {
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
    if (startedAt !== undefined) {
      update.startedAt = startedAt;
    }
    if (completedAt !== undefined) {
      update.completedAt = completedAt;
    }
    if (errorMessage !== undefined) {
      update.errorMessage = errorMessage;
    }
    await db
      .collection<Job>('jobs')
      .updateOne({ id }, { $set: update });
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
    const db = await connectToMongo();

    // Find all jobs for this session
    const jobs = await this.findBySessionId(sessionId);
    const jobIds = jobs.map(job => job.id);

    if (jobIds.length > 0) {
      // Delete related data from all collections
      await Promise.all([
        db.collection('pages').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('links').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('sitemaps').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('fields').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('aeo_analysis').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('module_e').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('content_metrics').deleteMany({ jobId: { $in: jobIds } }),
        db.collection('schemas').deleteMany({ jobId: { $in: jobIds } }),
        // job_summaries stores crawl_status for Quick Start jobs — must be cleaned up
        db.collection('job_summaries').deleteMany({ jobId: { $in: jobIds } }),
        // Clean up Redis keys for every job
        ...jobIds.map(id => LiveJobService.cleanupJob(id)),
      ]);

      // Delete jobs
      await db.collection<Job>('jobs').deleteMany({ sessionId });
    }
  }
}
