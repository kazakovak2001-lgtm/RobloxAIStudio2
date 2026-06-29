import type { GameBlueprint } from "../types/blueprint";

export class BlueprintCache {
  private cache = new Map<string, GameBlueprint>();
  private ttl = 5 * 60 * 1000; // 5 minutes
  private timestamps = new Map<string, number>();

  set(key: string, value: GameBlueprint): void {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  get(key: string): GameBlueprint | null {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return null;
    
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    
    return this.cache.get(key) ?? null;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.timestamps.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      ttl: this.ttl,
    };
  }
}