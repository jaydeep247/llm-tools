import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { Job, JobStatus, JobType, CreateJobDto } from './job.types';
import { LiveJobService } from '../../services/live-job.service';

export class JobRepository {
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

    if (jobIds.length === 0) {
      return;
    }

    await Promise.all([
      db.collection('pages').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('links').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('sitemaps').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('fields').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('module_c').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('module_e').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('content_metrics').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('schemas').deleteMany({ jobId: { $in: jobIds } }),
      db.collection('job_summaries').deleteMany({ jobId: { $in: jobIds } }),
      db.collection<Job>('jobs').deleteMany({ sessionId: { $in: sessionIds } }),
      ...jobIds.map((id) => LiveJobService.cleanupJob(id)),
    ]);
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
