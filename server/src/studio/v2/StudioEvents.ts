/**
 * StudioEvents — Event system for Studio integration.
 */

import type { StudioEventData } from "./StudioTypes";

export type StudioEventHandler = (event: StudioEventData) => void;

export class StudioEvents {
  private handlers: StudioEventHandler[] = [];
  private history: StudioEventData[] = [];

  on(handler: StudioEventHandler): void {
    this.handlers.push(handler);
  }
  off(handler: StudioEventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  emit(event: StudioEventData): void {
    this.history.push(event);
    for (const h of this.handlers) {
      try {
        h(event);
      } catch {
        /* non-blocking */
      }
    }
  }

  getHistory(): StudioEventData[] {
    return [...this.history];
  }
  get historyCount(): number {
    return this.history.length;
  }
}
