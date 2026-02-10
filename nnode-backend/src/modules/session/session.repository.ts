import { Session, SessionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { SessionFilters, SessionWithProject } from './session.types';

export class SessionRepository {
  /**
   * Create a new session
   */
  async create(projectId: string): Promise<Session> {
    return prisma.session.create({
      data: {
        projectId,
        status: 'CREATED',
      },
    });
  }

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id },
    });
  }

  /**
   * Find session by ID with project info
   */
  async findByIdWithProject(id: string): Promise<SessionWithProject | null> {
    return prisma.session.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            userId: true,
          },
        },
      },
    });
  }

  /**
   * Find all sessions for a project
   */
  async findByProjectId(projectId: string, filters?: SessionFilters): Promise<Session[]> {
    return prisma.session.findMany({
      where: {
        projectId,
        ...filters,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Count sessions in a project
   */
  async countByProjectId(projectId: string, status?: SessionStatus): Promise<number> {
    return prisma.session.count({
      where: {
        projectId,
        ...(status && { status }),
      },
    });
  }

  /**
   * Count active sessions across all projects for a user
   */
  async countActiveSessionsByUserId(userId: string): Promise<number> {
    return prisma.session.count({
      where: {
        project: {
          userId,
        },
        status: {
          in: ['CREATED', 'RUNNING'],
        },
      },
    });
  }

  /**
   * Update session status
   */
  async updateStatus(id: string, status: SessionStatus, endedAt?: Date): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data: {
        status,
        ...(endedAt && { endedAt }),
      },
    });
  }

  /**
   * Delete session
   */
  async delete(id: string): Promise<Session> {
    return prisma.session.delete({
      where: { id },
    });
  }
}
