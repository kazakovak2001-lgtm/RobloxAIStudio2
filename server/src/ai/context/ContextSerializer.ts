/**
 * ContextSerializer — Serialize/deserialize session contexts.
 */

import type { SessionContext } from "./ContextTypes";

export class ContextSerializer {
  serialize(context: SessionContext): string {
    return JSON.stringify(context);
  }

  deserialize(data: string): SessionContext | null {
    try {
      return JSON.parse(data) as SessionContext;
    } catch {
      return null;
    }
  }
}
