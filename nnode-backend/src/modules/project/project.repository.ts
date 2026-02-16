import { Project, ProjectStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { CreateProjectDto, UpdateProjectDto, ProjectFilters, ProjectWithSessionCount } from './project.types';

export class ProjectRepository {
  /**
   * Create a new project
   */
  async create(userId: string, data: CreateProjectDto): Promise<Project> {
    return prisma.project.create({
      data: {
        userId,
        name: data.name,
      },
    });
  }

  /**
   * Find project by ID
   */
  async findById(id: string): Promise<Project | null> {
    return prisma.project.findUnique({
      where: { id },
    });
  }

  /**
   * Find project by ID with session count
   */
  async findByIdWithSessionCount(id: string): Promise<ProjectWithSessionCount | null> {
    return prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    });
  }

  /**
   * Find all projects for a user
   */
  async findByUserId(userId: string, filters?: ProjectFilters): Promise<Project[]> {
    return prisma.project.findMany({
      where: {
        userId,
        ...filters,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Count projects for a user
   */
  async countByUserId(userId: string, status?: ProjectStatus): Promise<number> {
    return prisma.project.count({
      where: {
        userId,
        ...(status && { status }),
      },
    });
  }

  /**
   * Update project
   */
  async update(id: string, data: UpdateProjectDto): Promise<Project> {
    return prisma.project.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete project (soft delete by archiving)
   */
  async archive(id: string): Promise<Project> {
    return prisma.project.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  /**
   * Hard delete project
   */
  async delete(id: string): Promise<Project> {
    return prisma.project.delete({
      where: { id },
    });
  }

  /**
   * Check if project belongs to user
   */
  async belongsToUser(projectId: string, userId: string): Promise<boolean> {
    const count = await prisma.project.count({
      where: {
        id: projectId,
        userId,
      },
    });
    return count > 0;
  }
}
