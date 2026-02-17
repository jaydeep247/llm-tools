export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectResponse = Project;

export interface CreateProjectDto {
  name: string;
}

export interface UpdateProjectDto {
  name?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
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
