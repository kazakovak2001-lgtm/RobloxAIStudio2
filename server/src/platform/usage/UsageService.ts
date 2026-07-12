/**
 * UsageService — Tracks user activity for future billing foundation.
 */

export interface UsageRecord {
  userId: string;
  projectCount: number;
  generationCount: number;
  jobCount: number;
  lastActivityAt: number;
}

export class UsageService {
  private records: Map<string, UsageRecord> = new Map();

  getOrCreate(userId: string): UsageRecord {
    if (!this.records.has(userId)) {
      this.records.set(userId, {
        userId,
        projectCount: 0,
        generationCount: 0,
        jobCount: 0,
        lastActivityAt: Date.now(),
      });
    }
    return this.records.get(userId)!;
  }

  recordProjectCreated(userId: string): void {
    const r = this.getOrCreate(userId);
    r.projectCount++;
    r.lastActivityAt = Date.now();
  }

  recordGeneration(userId: string): void {
    const r = this.getOrCreate(userId);
    r.generationCount++;
    r.lastActivityAt = Date.now();
  }

  recordJob(userId: string): void {
    const r = this.getOrCreate(userId);
    r.jobCount++;
    r.lastActivityAt = Date.now();
  }

  get(userId: string): UsageRecord | null {
    return this.records.get(userId) ?? null;
  }

  getAll(): UsageRecord[] {
    return [...this.records.values()];
  }
}
