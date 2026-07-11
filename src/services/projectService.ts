/**
 * Project Service — CRUD operations for projects via backend API.
 */

const API_BASE = "/api/projects";

export interface Project {
  id: string;
  name: string;
  type: string;
  genre: string;
  description?: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  type: string;
  genre: string;
  description?: string;
}

export async function listProjects(): Promise<Project[]> {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? data.projects ?? [];
  } catch {
    return [];
  }
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? data;
  } catch {
    return null;
  }
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project | null> {
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? data;
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export interface GenerationRecord {
  id: string;
  projectId: string;
  pipelineId: string;
  conceptId?: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  duration?: number;
  stagesCompleted: number;
  stagesTotal: number;
  failures: number;
  tokenUsage: number;
  aiCost: number;
}

export async function getProjectHistory(
  projectId: string,
): Promise<GenerationRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/${projectId}/history`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}
