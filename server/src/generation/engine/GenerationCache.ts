/**
 * GenerationCache.ts
 *
 * In-memory cache for generation sessions, artifacts, and blueprints.
 * Supports store, restore, invalidate, and statistics.
 */

export interface CacheEntry<T> {
  key: string;
  value: T;
  storedAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

export interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRatio: number;
  totalSizeEstimate: number;
}

export class GenerationCache {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private maxEntries: number;
  private hits = 0;
  private misses = 0;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  /**
   * Store a value in cache.
   */
  set<T>(key: string, value: T): void {
    this.evictIfNeeded();
    this.store.set(key, {
      key,
      value,
      storedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
    });
  }

  /**
   * Retrieve a value from cache.
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.hits++;
    return entry.value as T;
  }

  /**
   * Check if key exists.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Invalidate a specific key.
   */
  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Invalidate all entries matching a prefix.
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const totalAccess = this.hits + this.misses;
    let sizeEstimate = 0;
    for (const entry of this.store.values()) {
      try {
        sizeEstimate += JSON.stringify(entry.value).length * 2;
      } catch {
        sizeEstimate += 1000; // fallback estimate
      }
    }

    return {
      totalEntries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: totalAccess > 0 ? this.hits / totalAccess : 0,
      totalSizeEstimate: sizeEstimate,
    };
  }

  get size(): number {
    return this.store.size;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private evictIfNeeded(): void {
    if (this.store.size < this.maxEntries) return;
    // Evict least recently accessed
    let oldestKey = "";
    let oldestAccess = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}
