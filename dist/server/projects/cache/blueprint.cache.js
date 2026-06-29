export class BlueprintCache {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 minutes
        this.timestamps = new Map();
    }
    set(key, value) {
        this.cache.set(key, value);
        this.timestamps.set(key, Date.now());
    }
    get(key) {
        const timestamp = this.timestamps.get(key);
        if (!timestamp)
            return null;
        if (Date.now() - timestamp > this.ttl) {
            this.cache.delete(key);
            this.timestamps.delete(key);
            return null;
        }
        return this.cache.get(key) ?? null;
    }
    delete(key) {
        this.cache.delete(key);
        this.timestamps.delete(key);
    }
    clear() {
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
