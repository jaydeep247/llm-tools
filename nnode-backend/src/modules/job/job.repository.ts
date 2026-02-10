import { Job, JobStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { CreateJobDto, JobFilters, JobWithSession } from './job.types';

export class JobRepository {
  /**
   * Create a new job
   */
  async create(sessionId: string, data: CreateJobDto): Promise<Job> {
    return prisma.job.create({
      data: {
        sessionId,
        jobType: data.jobType,
        priority: data.priority || 0,
        config: data.config ?? undefined,
        status: 'PENDING',
      },
    });
  }

  /**
   * Find job by ID
   */
  async findById(id: string): Promise<Job | null> {
    return prisma.job.findUnique({
      where: { id },
    });
  }

  /**
   * Find job by ID with session and project info
   */
  async findByIdWithSession(id: string): Promise<JobWithSession | null> {
    return prisma.job.findUnique({
      where: { id },
      include: {
        session: {
          select: {
            id: true,
            projectId: true,
            project: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find all jobs for a session
   */
  async findBySessionId(sessionId: string, filters?: JobFilters): Promise<Job[]> {
    return prisma.job.findMany({
      where: {
        sessionId,
        ...filters,
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Find pending jobs (for external workers to pull)
   */
  async findPendingJobs(limit: number = 10): Promise<JobWithSession[]> {
    return prisma.job.findMany({
      where: {
        status: 'PENDING',
      },
      include: {
        session: {
          select: {
            id: true,
            projectId: true,
            project: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });
  }

  /**
   * Count jobs in a session
   */
  async countBySessionId(sessionId: string, status?: JobStatus): Promise<number> {
    return prisma.job.count({
      where: {
        sessionId,
        ...(status && { status }),
      },
    });
  }

  /**
   * Count running jobs for a session
   */
  async countRunningJobsBySessionId(sessionId: string): Promise<number> {
    return prisma.job.count({
      where: {
        sessionId,
        status: 'RUNNING',
      },
    });
  }

  /**
   * Count running jobs across all sessions for a user
   */
  async countRunningJobsByUserId(userId: string): Promise<number> {
    return prisma.job.count({
      where: {
        session: {
          project: {
            userId,
          },
        },
        status: 'RUNNING',
      },
    });
  }

  /**
   * Update job status
   */
  async updateStatus(
    id: string,
    status: JobStatus,
    failureReason?: string
  ): Promise<Job> {
    const updateData: any = { status };

    if (status === 'RUNNING') {
      updateData.startedAt = new Date();
      updateData.lastTriedAt = new Date();
    }

    if (status === 'COMPLETED' || status === 'FAILED') {
      updateData.completedAt = new Date();
    }

    if (status === 'FAILED' && failureReason) {
      updateData.failureReason = failureReason;
      updateData.retryCount = { increment: 1 };
    }

    return prisma.job.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Delete job
   */
  async delete(id: string): Promise<Job> {
    return prisma.job.delete({
      where: { id },
    });
  }

  /**
   * Get job statistics for a session
   */
  async getSessionJobStats(sessionId: string) {
    const [total, pending, running, completed, failed] = await Promise.all([
      this.countBySessionId(sessionId),
      this.countBySessionId(sessionId, 'PENDING'),
      this.countBySessionId(sessionId, 'RUNNING'),
      this.countBySessionId(sessionId, 'COMPLETED'),
      this.countBySessionId(sessionId, 'FAILED'),
    ]);

    return {
      total,
      pending,
      running,
      completed,
      failed,
    };
  }
}
