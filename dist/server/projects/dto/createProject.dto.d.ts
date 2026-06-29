export interface CreateProjectRequest {
    name: string;
    description?: string;
    gameType?: string;
    genre?: string;
    difficulty?: string;
    players?: string;
    targetAudience?: string;
    prompt?: string;
}
export interface UpdateProjectRequest {
    name?: string;
    description?: string;
    gameType?: string;
    genre?: string;
    difficulty?: string;
    players?: string;
    targetAudience?: string;
    status?: string;
}
export interface ProjectQuery {
    page?: number;
    limit?: number;
    search?: string;
    genre?: string;
    status?: string;
}
