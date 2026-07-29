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

export interface ApiKeyMetadata {
  id?: string;
  label?: string;
  ownerId?: string;
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
  revokedAt?: string;
}

export interface RedactedApiKey {
  id: string;
  createdAt: string;
  label?: string;
  ownerId?: string;
  revokedAt?: string;
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
 * Storage-backed API key registry.
 *
 * Issuance and bootstrap seeding retain their compatibility path until their
 * lifecycle is separated. Revocation is acknowledged before the revoked state
 * becomes observable.
 */
export class ApiKeyStore {
  private readonly revocationQueues = new Map<string, Promise<void>>();

  constructor(private readonly storage: StorageProvider) {}

  issue(rawKey: string, metadata: ApiKeyMetadata = {}): IssuedApiKey {
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) {
      throw new Error(
        `API key must contain at least ${MIN_KEY_LENGTH} characters`,
      );
    }

    const id = metadata.id ?? randomUUID();
    const record: StoredApiKey = {
      id,
      digest: digestKey(key),
      createdAt: new Date().toISOString(),
      ...(metadata.label ? { label: metadata.label } : {}),
      ...(metadata.ownerId ? { ownerId: metadata.ownerId } : {}),
    };
    this.storage.set(COLLECTION, id, record);
    return { id, key };
  }

  generate(metadata: ApiKeyMetadata = {}): IssuedApiKey {
    return this.issue(`rai_${randomBytes(32).toString("hex")}`, metadata);
  }

  validate(rawKey: unknown): boolean {
    if (typeof rawKey !== "string") return false;
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) return false;

    const candidateDigest = digestKey(key);
    return this.storage
      .list<StoredApiKey>(COLLECTION)
      .some(
        (record) =>
          !record.revokedAt && isEqualDigest(record.digest, candidateDigest),
      );
  }

  async revokeDurable(id: string): Promise<boolean> {
    const predecessor = this.revocationQueues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = predecessor.then(() => current);
    this.revocationQueues.set(id, queued);

    await predecessor;
    try {
      const record = this.storage.get<StoredApiKey>(COLLECTION, id);
      if (!record || record.revokedAt) return false;

      await this.storage.setDurable(COLLECTION, id, {
        ...record,
        revokedAt: new Date().toISOString(),
      });
      return true;
    } finally {
      release();
      if (this.revocationQueues.get(id) === queued) {
        this.revocationQueues.delete(id);
      }
    }
  }

  list(): RedactedApiKey[] {
    return this.storage.list<StoredApiKey>(COLLECTION).map((record) => ({
      id: record.id,
      createdAt: record.createdAt,
      ...(record.label ? { label: record.label } : {}),
      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
    }));
  }

  /** Seed comma-separated bootstrap keys from API_KEYS. */
  seedFromEnvironment(value = process.env.API_KEYS): number {
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

      this.issue(key, {
        id: `env-${digest.slice(0, 24)}`,
        label: "environment",
      });
      added += 1;
    }
    return added;
  }

  /** Test and administrative cleanup; never returns a credential. */
  clear(): void {
    for (const record of this.storage.list<StoredApiKey>(COLLECTION)) {
      this.storage.delete(COLLECTION, record.id);
    }
  }
}
