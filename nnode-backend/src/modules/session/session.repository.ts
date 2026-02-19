import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { SessionFilters, SessionWithProject, Session, SessionStatus } from './session.types';
import { JobRepository } from '../job/job.repository';

export class SessionRepository {
  private jobRepository: JobRepository;

  constructor() {
    this.jobRepository = new JobRepository();
  }

  /**
   * Create a new session
   */
  async create(projectId: string): Promise<Session> {
    const db = await connectToMongo();
    const now = new Date();
    const session: Session = {
      id: randomUUID(),
      projectId,
      status: SessionStatus.CREATED,
      createdAt: now,
      endedAt: null,
    };
    await db.collection<Session>('sessions').insertOne(session);
    return session;
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<Session | null> {
    const db = await connectToMongo();
    return db.collection<Session>('sessions').findOne({ id });
  }

  /**
   * Find session by ID with project info
   */
  async findByIdWithProject(id: string): Promise<SessionWithProject | null> {
    const db = await connectToMongo();
    
    const sessions = await db
      .collection<Session>('sessions')
      .aggregate([
        { $match: { id } },
        {
          $lookup: {
            from: 'jobs',
            localField: 'id',
            foreignField: 'sessionId',
            as: 'jobs'
          }
        },
        {
          $addFields: {
            startUrl: { $arrayElemAt: ['$jobs.url', 0] },
            totalPages: 0,
            totalResources: 0
          }
        },
        {
          $project: {
            jobs: 0
          }
        }
      ])
      .toArray();

    const session = sessions[0] as Session | undefined;

    if (!session) {
      return null;
    }
    
    const project = await db
      .collection('projects')
      .findOne(
        { id: session.projectId },
        { projection: { id: 1, name: 1, userId: 1 } }
      );
      
    return {
      ...session,
      project: project
        ? {
            id: project.id,
            name: project.name,
            userId: project.userId,
          }
        : undefined,
    };
  }

  /**
   * Find all sessions for a project
   */
  async findByProjectId(projectId: string, filters?: SessionFilters): Promise<Session[]> {
    const db = await connectToMongo();
    const query: any = { projectId };
    if (filters?.status) {
      query.status = filters.status;
    }
    
    return db
      .collection<Session>('sessions')
      .aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'jobs',
            localField: 'id',
            foreignField: 'sessionId',
            as: 'jobs'
          }
        },
        {
          $addFields: {
            job: { $arrayElemAt: ['$jobs', 0] }
          }
        },
        // Count pages
        {
          $lookup: {
            from: 'pages',
            let: { jobId: '$job.id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$jobId', '$$jobId'] } } },
              { $count: 'count' }
            ],
            as: 'pagesCount'
          }
        },
        // Count links
        {
          $lookup: {
            from: 'links',
            let: { jobId: '$job.id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$jobId', '$$jobId'] } } },
              { $count: 'count' }
            ],
            as: 'linksCount'
          }
        },
        // Count sitemaps
        {
          $lookup: {
            from: 'sitemaps',
            let: { jobId: '$job.id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$jobId', '$$jobId'] } } },
              { $count: 'count' }
            ],
            as: 'sitemapsCount'
          }
        },
        {
          $addFields: {
            startUrl: '$job.url',
            status: {
              $cond: {
                if: { $eq: ['$job.status', 'PENDING'] },
                then: 'CREATED',
                else: { $ifNull: ['$job.status', '$status'] }
              }
            },
            allowSubdomains: '$job.allowSubdomains',
            startedAt: '$job.startedAt',
            completedAt: '$job.completedAt',
            maxConcurrency: 4, // Default for now
            totalPages: { $ifNull: [{ $arrayElemAt: ['$pagesCount.count', 0] }, 0] },
            totalLinks: { $ifNull: [{ $arrayElemAt: ['$linksCount.count', 0] }, 0] },
            totalSitemaps: { $ifNull: [{ $arrayElemAt: ['$sitemapsCount.count', 0] }, 0] },
            totalResources: { $ifNull: [{ $arrayElemAt: ['$pagesCount.count', 0] }, 0] } // Legacy
          }
        },
        {
          $project: {
            jobs: 0,
            job: 0,
            pagesCount: 0,
            linksCount: 0,
            sitemapsCount: 0
          }
        }
      ])
      .toArray() as Promise<Session[]>;
  }

  /**
   * Count sessions in a project
   */
  async countByProjectId(projectId: string, status?: SessionStatus): Promise<number> {
    const db = await connectToMongo();
    const query: any = { projectId };
    if (status) {
      query.status = status;
    }
    return db
      .collection<Session>('sessions')
      .countDocuments(query);
  }

  /**
   * Count active sessions across all projects for a user
   */
  async countActiveSessionsByUserId(userId: string): Promise<number> {
    const db = await connectToMongo();
    const projects = await db
      .collection('projects')
      .find({ userId }, { projection: { id: 1 } })
      .toArray();
    const projectIds = projects.map((p: any) => p.id);
    if (projectIds.length === 0) {
      return 0;
    }
    return db
      .collection<Session>('sessions')
      .countDocuments({
        projectId: { $in: projectIds },
        status: { $in: [SessionStatus.CREATED, SessionStatus.RUNNING] },
      });
  }

  /**
   * Update session status
   */
  async updateStatus(id: string, status: SessionStatus, endedAt?: Date): Promise<Session> {
    const db = await connectToMongo();
    await db
      .collection<Session>('sessions')
      .updateOne(
        { id },
        {
          $set: {
            status,
            ...(endedAt && { endedAt }),
          },
        }
      );
    const session = await this.findById(id);
    if (!session) {
      throw new Error('Session not found');
    }
    return session;
  }

  /**
   * Delete session
   */
  async delete(id: string): Promise<Session> {
    const db = await connectToMongo();
    const session = await this.findById(id);
    if (!session) {
      throw new Error('Session not found');
    }

    // Delete related jobs and data
    await this.jobRepository.deleteBySessionId(id);

    await db
      .collection<Session>('sessions')
      .deleteOne({ id });
    return session;
  }

  /**
   * Delete sessions by project ID
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    const db = await connectToMongo();
    await db.collection<Session>('sessions').deleteMany({ projectId });
  }
}
