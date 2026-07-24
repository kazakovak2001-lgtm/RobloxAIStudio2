export interface BlueprintDTO {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  description?: string;
  gameType: string;
  genre: string;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
