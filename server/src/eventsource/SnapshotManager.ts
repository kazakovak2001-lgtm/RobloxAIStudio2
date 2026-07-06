/**
 * SnapshotManager.ts
 *
 * Performance optimization for event sourcing.
 * Creates periodic state snapshots to reduce replay cost.
 * Snapshots are stored alongside the event log.
 *
 * storage/events/snapshots/
 *   snap-{id}-{offset}.json
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join } from "path";

export interface SystemSnapshot {
  snapshotId: string;
  scope: "global" | "project";
  scopeId?: string;
  offset: number; // EventStore offset at time of snapshot
  timestamp: Date;
  state: Record<string, unknown>;
}

export class SnapshotManager {
  private snapshotsDir: string;
  private counter = 0;

  constructor(storageRoot?: string) {
    const baseDir = storageRoot ?? join(process.cwd(), "storage", "events");
    this.snapshotsDir = join(baseDir, "snapshots");
    if (!existsSync(this.snapshotsDir)) {
      mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  /**
   * Create a snapshot of the current system state.
   */
  createSnapshot(
    scope: "global" | "project",
    offset: number,
    state: Record<string, unknown>,
    scopeId?: string,
  ): SystemSnapshot {
    this.counter++;
    const snapshotId = `snap-${scope}-${scopeId ?? "global"}-${this.counter}`;

    const snapshot: SystemSnapshot = {
      snapshotId,
      scope,
      scopeId,
      offset,
      timestamp: new Date(),
      state,
    };

    const filename = `${snapshotId}-at-${offset}.json`;
    writeFileSync(
      join(this.snapshotsDir, filename),
      JSON.stringify(
        snapshot,
        (_k, v) => (v instanceof Date ? v.toISOString() : v),
        2,
      ),
      "utf-8",
    );

    console.log(
      `[SNAPSHOT] Created | ID: ${snapshotId} | Scope: ${scope} | Offset: ${offset}`,
    );
    return snapshot;
  }

  /**
   * Load the latest snapshot for a given scope.
   */
  loadLatest(
    scope: "global" | "project",
    scopeId?: string,
  ): SystemSnapshot | null {
    const prefix = `snap-${scope}-${scopeId ?? "global"}`;
    const files = this.listSnapshotFiles().filter((f) => f.startsWith(prefix));
    if (files.length === 0) return null;

    // Sort by offset (highest last)
    files.sort();
    const latestFile = files[files.length - 1];
    return this.readSnapshot(latestFile);
  }

  /**
   * Load a specific snapshot by ID.
   */
  loadById(snapshotId: string): SystemSnapshot | null {
    const files = this.listSnapshotFiles().filter((f) =>
      f.startsWith(snapshotId),
    );
    if (files.length === 0) return null;
    return this.readSnapshot(files[0]);
  }

  /**
   * List all available snapshot IDs.
   */
  listSnapshots(): string[] {
    return this.listSnapshotFiles().map((f) => f.replace(/-at-\d+\.json$/, ""));
  }

  private listSnapshotFiles(): string[] {
    if (!existsSync(this.snapshotsDir)) return [];
    return readdirSync(this.snapshotsDir).filter((f) => f.endsWith(".json"));
  }

  private readSnapshot(filename: string): SystemSnapshot | null {
    try {
      const raw = readFileSync(join(this.snapshotsDir, filename), "utf-8");
      return JSON.parse(raw) as SystemSnapshot;
    } catch {
      return null;
    }
  }
}
