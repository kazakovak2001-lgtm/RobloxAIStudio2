import type { RepairSessionState } from "./RepairTypes";

export interface RepairSessionStore {
  ready(): Promise<void>;
  save(session: RepairSessionState): Promise<void>;
  get(projectId: string): RepairSessionState | null;
  getAll(): RepairSessionState[];
}

export type RepairSessionStoreFactory = () => RepairSessionStore;

let configuredFactory: RepairSessionStoreFactory | null = null;

export function configureRepairSessionStoreFactory(
  factory: RepairSessionStoreFactory,
): void {
  configuredFactory = factory;
}

export function createConfiguredRepairSessionStore(): RepairSessionStore | null {
  return configuredFactory?.() ?? null;
}

export class InMemoryRepairSessionStore implements RepairSessionStore {
  private readonly sessions = new Map<string, RepairSessionState>();

  async ready(): Promise<void> {}

  async save(session: RepairSessionState): Promise<void> {
    this.sessions.set(session.projectId, structuredClone(session));
  }

  get(projectId: string): RepairSessionState | null {
    const session = this.sessions.get(projectId);
    return session ? structuredClone(session) : null;
  }

  getAll(): RepairSessionState[] {
    return [...this.sessions.values()].map((session) =>
      structuredClone(session),
    );
  }
}
