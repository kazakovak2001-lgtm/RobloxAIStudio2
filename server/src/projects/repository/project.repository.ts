export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  gameType?: string;
  genre?: string;
  difficulty?: string;
  players?: string;
  targetAudience?: string;
  status: string;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  conceptId?: string;
  pipelineIds?: string[];
  lastPipelineId?: string;
  lastPipelineStatus?: string;
  totalGenerations?: number;
}

export interface CreateProjectInput {
  name: string;
  userId: string;
  description?: string;
  gameType?: string;
  genre?: string;
}

export interface ProjectQueryOptions {
  userId?: string;
  status?: string;
  offset?: number;
  limit?: number;
}

export interface ProjectListResult {
  items: Project[];
  total: number;
}

export interface IProjectRepository {
  create(input: CreateProjectInput): Promise<Project>;
  getById(id: string): Promise<Project | null>;
  list(options?: ProjectQueryOptions): Promise<ProjectListResult>;
  update(id: string, updates: Partial<Project>): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
}
