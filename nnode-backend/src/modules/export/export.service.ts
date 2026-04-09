import { randomUUID, randomBytes } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { logger } from '../../shared/logger/logger';
import type { ApiKeyDoc, ScheduledExportDoc } from './export.types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function generateApiKey(): string {
  // Format: ck_live_<32 random hex chars>
  return `ck_live_${randomBytes(16).toString('hex')}`;
}

// ─── API Key Service ──────────────────────────────────────────────────────────

export class ExportService {
  // ── API key ───────────────────────────────────────────────────────────────

  async getApiKey(userId: string): Promise<ApiKeyDoc | null> {
    const db = await connectToMongo();
    const user = await db.collection('users').findOne({ id: userId }, { projection: { apiKey: 1 } });
    if (!user?.apiKey) return null;
    return user.apiKey as ApiKeyDoc;
  }

  async regenerateApiKey(userId: string): Promise<ApiKeyDoc> {
    const db = await connectToMongo();
    const key = generateApiKey();
    const doc: ApiKeyDoc = {
      key,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      rateLimit: 1000,
    };
    await db.collection('users').updateOne({ id: userId }, { $set: { apiKey: doc } });
    logger.info(`[EXPORT] API key regenerated for user ${userId}`);
    return doc;
  }

  async ensureApiKey(userId: string): Promise<ApiKeyDoc> {
    const existing = await this.getApiKey(userId);
    if (existing) return existing;
    return this.regenerateApiKey(userId);
  }

  // ── Scheduled exports ────────────────────────────────────────────────────

  async getSchedule(userId: string): Promise<ScheduledExportDoc | null> {
    const db = await connectToMongo();
    const doc = await db.collection('export_schedules').findOne({ userId });
    if (!doc) return null;
    return {
      id: doc.id,
      userId: doc.userId,
      email: doc.email,
      frequency: doc.frequency,
      reportType: doc.reportType,
      dayOfWeek: doc.dayOfWeek,
      hour: doc.hour,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async saveSchedule(
    userId: string,
    payload: {
      email: string;
      frequency: 'weekly';
      reportType: string;
      dayOfWeek: number;
      hour: number;
    },
  ): Promise<ScheduledExportDoc> {
    const db = await connectToMongo();
    const now = new Date().toISOString();
    const existing = await db.collection('export_schedules').findOne({ userId });
    const id = existing?.id ?? randomUUID();
    const doc: ScheduledExportDoc = {
      id,
      userId,
      email: payload.email,
      frequency: payload.frequency,
      reportType: payload.reportType,
      dayOfWeek: payload.dayOfWeek,
      hour: payload.hour,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.collection('export_schedules').updateOne(
      { userId },
      { $set: doc },
      { upsert: true },
    );
    logger.info(`[EXPORT] Schedule saved for user ${userId}`);
    return doc;
  }

  // ── Most recent completed job for a user ─────────────────────────────────

  async resolveJobId(userId: string, jobId?: string, projectId?: string): Promise<string | null> {
    const db = await connectToMongo();

    if (jobId) {
      // Verify ownership via project lookup
      const job = await db.collection('jobs').findOne({ id: jobId });
      if (!job) return null;
      const project = await db.collection('projects').findOne({
        id: job.projectId,
        userId,
        status: { $ne: 'archived' },
      });
      return project ? (job as any).id : null;
    }

    if (projectId) {
      // Verify ownership
      const project = await db.collection('projects').findOne({ id: projectId, userId, status: { $ne: 'archived' } });
      if (!project) return null;
      const job = await db.collection('jobs').findOne(
        { projectId, status: 'completed' },
        { sort: { createdAt: -1 } },
      );
      return job ? (job as any).id : null;
    }

    // Find most recent completed job owned by this user
    const projects = await db
      .collection('projects')
      .find({ userId, status: { $ne: 'archived' } }, { projection: { id: 1 } })
      .toArray();

    const projectIds = projects.map((p: any) => p.id);
    if (projectIds.length === 0) return null;

    const job = await db
      .collection('jobs')
      .findOne(
        { projectId: { $in: projectIds }, status: 'completed' },
        { sort: { createdAt: -1 } },
      );

    return job ? (job as any).id : null;
  }
}
