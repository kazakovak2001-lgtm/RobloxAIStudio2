export interface ProjectDTO {
    id: string;
    userId: string;
    name: string;
    description?: string;
    gameType?: string;
    genre?: string;
    status: string;
    progress: number;
    createdAt: Date;
    updatedAt: Date;
}
