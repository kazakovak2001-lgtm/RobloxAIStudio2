/**
 * API key storage and validation.
 *
 * Plain-text API keys are accepted only at issue/seed time. The storage layer
 * keeps SHA-256 digests, so diagnostics and durable storage never expose a
 * reusable credential.
 */

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { StorageProvider } from "../storage/StorageProvider";

const COLLECTION = "platform_api_keys";
const MIN_KEY_LENGTH = 16;
export const STUDIO_PROJECT_ACCESS_CAPABILITY = "studio.project.access";

export interface ApiKeyMetadata {
  id?: string;
  label?: string;
  ownerId?: string;
  capabilities?: string[];
  resourceScopes?: string[];
}

export interface ApiKeyPrincipal {
  type: "api-key";
  keyId: string;
  ownerId?: string;
  capabilities: string[];
  resourceScopes: string[];
}

export interface IssuedApiKey {
  id: string;
  key: string;
}

export interface StoredApiKey {
  id: string;
  digest: string;
  createdAt: string;
  label?: string;
  ownerId?: string;
  capabilities?: string[];
  resourceScopes?: string[];
  revokedAt?: string;
}

export interface RedactedApiKey {
  id: string;
  createdAt: string;
  label?: string;
  ownerId?: string;
  capabilities: string[];
  resourceScopes: string[];
  revokedAt?: string;
}

function normalizeScopeValues(values: string[] | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

function digestKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function isEqualDigest(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

/**
 * Storage-backed API key registry with acknowledged mutation boundaries.
 *
 * Issuance, revocation, and cleanup are coordinated so mutations for the same
 * key are serialized and cleanup cannot race a newly issued credential.
 */
export class ApiKeyStore {
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private cleanupTail: Promise<void> = Promise.resolve();
  private cleanupRequests = 0;

  constructor(private readonly storage: StorageProvider) {}

  private async enqueueKeyMutation<T>(
    id: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const predecessor = this.mutationQueues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = predecessor.then(() => current);
    this.mutationQueues.set(id, queued);

    await predecessor;
    try {
      return await operation();
    } finally {
      release();
      if (this.mutationQueues.get(id) === queued) {
        this.mutationQueues.delete(id);
      }
    }
  }

  async issueDurable(
    rawKey: string,
    metadata: ApiKeyMetadata = {},
  ): Promise<IssuedApiKey> {
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) {
      throw new Error(
        `API key must contain at least ${MIN_KEY_LENGTH} characters`,
      );
    }
    if (this.cleanupRequests > 0) {
      await this.cleanupTail;
    }

    const id = metadata.id ?? randomUUID();
    return this.enqueueKeyMutation(id, async () => {
      const record: StoredApiKey = {
        id,
        digest: digestKey(key),
        createdAt: new Date().toISOString(),
        ...(metadata.label ? { label: metadata.label } : {}),
        ...(metadata.ownerId ? { ownerId: metadata.ownerId } : {}),
        capabilities: normalizeScopeValues(metadata.capabilities),
        resourceScopes: normalizeScopeValues(metadata.resourceScopes),
      };
      await this.storage.setDurable(COLLECTION, id, record);
      return { id, key };
    });
  }

  async generateDurable(metadata: ApiKeyMetadata = {}): Promise<IssuedApiKey> {
    return this.issueDurable(
      `rai_${randomBytes(32).toString("hex")}`,
      metadata,
    );
  }

  resolvePrincipal(rawKey: unknown): ApiKeyPrincipal | null {
    if (typeof rawKey !== "string") return null;
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) return null;

    const candidateDigest = digestKey(key);
    const record = this.storage
      .list<StoredApiKey>(COLLECTION)
      .find(
        (candidate) =>
          !candidate.revokedAt &&
          isEqualDigest(candidate.digest, candidateDigest),
      );
    if (!record) return null;

    return {
      type: "api-key",
      keyId: record.id,
      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      capabilities: normalizeScopeValues(record.capabilities),
      resourceScopes: normalizeScopeValues(record.resourceScopes),
    };
  }

  validate(rawKey: unknown): boolean {
    return this.resolvePrincipal(rawKey) !== null;
  }

  async revokeDurable(id: string): Promise<boolean> {
    if (this.cleanupRequests > 0) {
      await this.cleanupTail;
    }

    return this.enqueueKeyMutation(id, async () => {
      const record = this.storage.get<StoredApiKey>(COLLECTION, id);
      if (!record || record.revokedAt) return false;

      await this.storage.setDurable(COLLECTION, id, {
        ...record,
        revokedAt: new Date().toISOString(),
      });
      return true;
    });
  }

  list(): RedactedApiKey[] {
    return this.storage.list<StoredApiKey>(COLLECTION).map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      ...(record.label ? { label: record.label } : {}),
      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      capabilities: normalizeScopeValues(record.capabilities),
      resourceScopes: normalizeScopeValues(record.resourceScopes),
      ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    }));
  }

  /** Seed comma-separated bootstrap keys from API_KEYS after acknowledgement. */
  async seedFromEnvironmentDurable(
    value = process.env.API_KEYS,
  ): Promise<number> {
    if (!value) return 0;

    let added = 0;
    for (const candidate of value.split(",")) {
      const key = candidate.trim();
      if (key.length < MIN_KEY_LENGTH) continue;

      const digest = digestKey(key);
      const exists = this.storage
        .list<StoredApiKey>(COLLECTION)
        .some((record) => record.digest === digest);
      if (exists) continue;

      await this.issueDurable(key, {
        id: `env-${digest.slice(0, 24)}`,
        label: "environment",
      });
      added += 1;
    }
    return added;
  }

  /** Seed one project-scoped Studio key without embedding it in the plugin. */
  async seedStudioFromEnvironmentDurable(
    rawKey = process.env.STUDIO_API_KEY,
    rawProjectId = process.env.STUDIO_PROJECT_ID,
  ): Promise<number> {
    const key = rawKey?.trim() ?? "";
    const projectId = rawProjectId?.trim() ?? "";
    if (!key && !projectId) return 0;
    if (!key || !projectId) {
      throw new Error(
        "STUDIO_API_KEY and STUDIO_PROJECT_ID must be configured together",
      );
    }

    const digest = digestKey(key);
    const existing = this.storage
      .list<StoredApiKey>(COLLECTION)
      .find((record) => record.digest === digest);
    if (existing) {
      const capabilities = normalizeScopeValues(existing.capabilities);
      const resourceScopes = normalizeScopeValues(existing.resourceScopes);
      if (
        !existing.revokedAt &&
        capabilities.length === 1 &&
        capabilities[0] === STUDIO_PROJECT_ACCESS_CAPABILITY &&
        resourceScopes.length === 1 &&
        resourceScopes[0] === projectId
      ) {
        return 0;
      }
      throw new Error(
        "STUDIO_API_KEY already exists with different access metadata",
      );
    }

    await this.issueDurable(key, {
      id: "studio-env-" + digest.slice(0, 24),
      label: "studio-environment",
      capabilities: [STUDIO_PROJECT_ACCESS_CAPABILITY],
      resourceScopes: [projectId],
    });
    return 1;
  }

  /**
   * Test and administrative cleanup; never returns a credential.
   *
   * Cleanup calls are serialized. Each cleanup waits for key mutations that were
   * already in flight, and new mutations wait for all queued cleanups.
   * Deletions are acknowledged individually. A rejection is propagated to the
   * caller and the rejected record remains visible. This is not an atomic
   * all-or-nothing batch across multiple keys.
   */
  async clearDurable(): Promise<number> {
    this.cleanupRequests += 1;
    const predecessor = this.cleanupTail;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.cleanupTail = predecessor.then(() => current);

    await predecessor;
    try {
      await Promise.all([...this.mutationQueues.values()]);

      let deleted = 0;
      for (const record of this.storage.list<StoredApiKey>(COLLECTION)) {
        if (await this.storage.deleteDurable(COLLECTION, record.id)) {
          deleted += 1;
        }
      }
      return deleted;
    } finally {
      this.cleanupRequests -= 1;
      release();
    }
  }
}
