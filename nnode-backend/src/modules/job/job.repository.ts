import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { Job, JobStatus, JobType, CreateJobDto } from './job.types';

export class JobRepository {
  async create(sessionId: string, projectId: string, data: CreateJobDto): Promise<Job> {
    const db = await connectToMongo();
    const now = new Date();
    const job: Job = {
      id: randomUUID(),
      sessionId,
      projectId,
      url: data.url,
      allowSubdomains: data.allowSubdomains,
      runAudits: data.runAudits,
      auditDevice: data.auditDevice,
      captureLinkDetails: data.captureLinkDetails,
      type: data.type ?? JobType.CRAWL,
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
}
