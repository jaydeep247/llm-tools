import { Project, ProjectStatus } from '@prisma/client';

export type ProjectResponse = Project;

export interface CreateProjectDto {
  name: string;
}

export interface UpdateProjectDto {
  name?: string;
  status?: ProjectStatus;
}

export interface ProjectFilters {
  userId?: string;
  status?: ProjectStatus;
}

export interface ProjectWithSessionCount extends Project {
  _count?: {
    sessions: number;
  };
}
