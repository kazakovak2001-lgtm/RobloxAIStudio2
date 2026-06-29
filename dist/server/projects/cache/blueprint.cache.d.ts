import type { GameBlueprint } from "../types/blueprint";
export declare class BlueprintCache {
    private cache;
    private ttl;
    private timestamps;
    set(key: string, value: GameBlueprint): void;
    get(key: string): GameBlueprint | null;
    delete(key: string): void;
    clear(): void;
    getStats(): {
        size: number;
        ttl: number;
    };
}
