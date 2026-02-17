import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { CreateProjectDto, UpdateProjectDto, ProjectFilters, ProjectWithSessionCount, Project, ProjectStatus } from './project.types';

export class ProjectRepository {
  /**
   * Create a new project
   */
  async create(userId: string, data: CreateProjectDto): Promise<Project> {
    const db = await connectToMongo();
    const now = new Date();
    const project: Project = {
      id: randomUUID(),
      userId,
      name: data.name,
      status: ProjectStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection<Project>('projects').insertOne(project);
    return project;
  }

  /**
   * Find project by ID
   */
  async findById(id: string): Promise<Project | null> {
    const db = await connectToMongo();
    return db.collection<Project>('projects').findOne({ id });
  }

  /**
   * Find project by ID with session count
   */
  async findByIdWithSessionCount(id: string): Promise<ProjectWithSessionCount | null> {
    const db = await connectToMongo();
    const project = await db.collection<Project>('projects').findOne({ id });
    if (!project) {
      return null;
    }
    const sessionCount = await db
      .collection('sessions')
      .countDocuments({ projectId: id });
    return {
      ...project,
      _count: {
        sessions: sessionCount,
      },
    };
  }

  /**
   * Find all projects for a user
   */
  async findByUserId(userId: string, filters?: ProjectFilters): Promise<Project[]> {
    const db = await connectToMongo();
    const query: any = { userId };
    if (filters?.status) {
      query.status = filters.status;
    }
    return db
      .collection<Project>('projects')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Count projects for a user
   */
  async countByUserId(userId: string, status?: ProjectStatus): Promise<number> {
    const db = await connectToMongo();
    const query: any = { userId };
    if (status) {
      query.status = status;
    }
    return db
      .collection<Project>('projects')
      .countDocuments(query);
  }

  /**
   * Update project
   */
  async update(id: string, data: UpdateProjectDto): Promise<Project> {
    const db = await connectToMongo();
    const update: Partial<Project> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) {
      update.name = data.name;
    }
    if (data.status !== undefined) {
      update.status = data.status as ProjectStatus;
    }
    await db
      .collection<Project>('projects')
      .updateOne(
        { id },
        { $set: update }
      );
    const project = await this.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }
    return project;
  }

  /**
   * Delete project (soft delete by archiving)
   */
  async archive(id: string): Promise<Project> {
    return this.update(id, { status: ProjectStatus.ARCHIVED });
  }

  /**
   * Hard delete project
   */
  async delete(id: string): Promise<Project> {
    const db = await connectToMongo();
    const project = await this.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }
    await db
      .collection<Project>('projects')
      .deleteOne({ id });
    return project;
  }

  /**
   * Check if project belongs to user
   */
  async belongsToUser(projectId: string, userId: string): Promise<boolean> {
    const db = await connectToMongo();
    const count = await db
      .collection<Project>('projects')
      .countDocuments({
        id: projectId,
        userId,
      });
    return count > 0;
  }
}
