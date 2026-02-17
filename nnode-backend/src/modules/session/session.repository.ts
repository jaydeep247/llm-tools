import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { SessionFilters, SessionWithProject, Session, SessionStatus } from './session.types';

export class SessionRepository {
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
    const session = await db.collection<Session>('sessions').findOne({ id });
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
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
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
    await db
      .collection<Session>('sessions')
      .deleteOne({ id });
    return session;
  }
}
