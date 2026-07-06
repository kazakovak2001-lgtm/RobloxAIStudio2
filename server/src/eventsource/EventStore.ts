/**
 * EventStore.ts
 *
 * Central immutable event log for the entire compiler platform.
 * Single source of truth for all system state.
 * Events are append-only — never modified or deleted.
 *
 * File-based persistence at: storage/events/
 *   events.jsonl  — append-only JSONL event log
 *   offset.json   — current offset pointer
 */

import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";

export interface EventMetadata {
  nodeId?: string;
  workerId?: string;
  jobId?: string;
  assemblyId?: string;
  version?: string;
}

export interface SystemEvent {
  eventId: string;
  type: string;
  timestamp: Date;
  projectId?: string;
  payload: unknown;
  metadata: EventMetadata;
  offset: number;
}

export class EventStore {
  private storageDir: string;
  private eventsFile: string;
  private offsetFile: string;
  private currentOffset: number;
  private eventCounter = 0;

  constructor(storageRoot?: string) {
    this.storageDir = storageRoot ?? join(process.cwd(), "storage", "events");
    this.eventsFile = join(this.storageDir, "events.jsonl");
    this.offsetFile = join(this.storageDir, "offset.json");
    this.ensureDir();
    this.currentOffset = this.loadOffset();
  }

  /**
   * Append an event to the immutable log.
   * Returns the event with assigned offset.
   */
  append(event: Omit<SystemEvent, "eventId" | "offset">): SystemEvent {
    this.eventCounter++;
    this.currentOffset++;

    const fullEvent: SystemEvent = {
      ...event,
      eventId: `evt-${Date.now()}-${this.eventCounter}`,
      offset: this.currentOffset,
      timestamp: event.timestamp instanceof Date ? event.timestamp : new Date(),
    };

    const line = JSON.stringify(fullEvent, (_k, v) =>
      v instanceof Date ? v.toISOString() : v,
    );
    appendFileSync(this.eventsFile, line + "\n", "utf-8");
    this.saveOffset();

    return fullEvent;
  }

  /**
   * Read events starting from a given offset.
   */
  read(fromOffset = 0, limit = 10000): SystemEvent[] {
    if (!existsSync(this.eventsFile)) return [];

    const content = readFileSync(this.eventsFile, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    const events: SystemEvent[] = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as SystemEvent;
        if (evt.offset > fromOffset) {
          events.push(evt);
          if (events.length >= limit) break;
        }
      } catch {
        /* skip corrupt lines */
      }
    }

    return events;
  }

  /**
   * Read events filtered by type.
   */
  readByType(type: string, fromOffset = 0): SystemEvent[] {
    return this.read(fromOffset).filter((e) => e.type === type);
  }

  /**
   * Read events for a specific aggregate (projectId or jobId).
   */
  replay(aggregateId: string): SystemEvent[] {
    return this.read(0).filter(
      (e) =>
        e.projectId === aggregateId ||
        e.metadata.jobId === aggregateId ||
        e.metadata.assemblyId === aggregateId,
    );
  }

  /**
   * Get the latest offset (total events written).
   */
  getLatestOffset(): number {
    return this.currentOffset;
  }

  /**
   * Get total event count.
   */
  getEventCount(): number {
    if (!existsSync(this.eventsFile)) return 0;
    const content = readFileSync(this.eventsFile, "utf-8");
    return content.split("\n").filter((l) => l.trim().length > 0).length;
  }

  private ensureDir(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private loadOffset(): number {
    if (!existsSync(this.offsetFile)) return 0;
    try {
      const data = JSON.parse(readFileSync(this.offsetFile, "utf-8"));
      return Number(data.offset) || 0;
    } catch {
      return 0;
    }
  }

  private saveOffset(): void {
    writeFileSync(
      this.offsetFile,
      JSON.stringify({ offset: this.currentOffset }),
      "utf-8",
    );
  }
}

let _instance: EventStore | null = null;
export function getEventStore(): EventStore {
  if (!_instance) _instance = new EventStore();
  return _instance;
}
