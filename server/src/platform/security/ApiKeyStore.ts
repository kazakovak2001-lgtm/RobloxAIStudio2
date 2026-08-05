/**
 * API key storage and validation.
 *
 * Plain-text API keys are accepted only at issue/seed time. The storage layer
 * keeps salted, versioned scrypt digests, so diagnostics and durable storage
 * never expose a reusable credential.
 */

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { StorageProvider } from "../storage/StorageProvider";

const COLLECTION = "platform_api_keys";
const MIN_KEY_LENGTH = 16;
const SCRYPT_PREFIX = "scrypt-v1";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_BYTES = 32;
const API_KEY_PATTERN = /^rai_([0-9a-f]{16})_[A-Za-z0-9_-]{32,}$/;
const STUDIO_ENVIRONMENT_LABEL = "studio-environment";
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
  lookupId: string;
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

function parseLookupId(key: string): string | null {
  return API_KEY_PATTERN.exec(key)?.[1] ?? null;
}

function deriveKey(key: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      key,
      salt,
      SCRYPT_KEY_BYTES,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

async function hashKey(key: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await deriveKey(key, salt);
  return [
    SCRYPT_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

function isEqualBuffer(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function isSupportedDigest(digest: string): boolean {
  const [prefix, cost, blockSize, parallelization, saltHex, derivedHex] =
    digest.split("$");
  return (
    prefix === SCRYPT_PREFIX &&
    cost === String(SCRYPT_COST) &&
    blockSize === String(SCRYPT_BLOCK_SIZE) &&
    parallelization === String(SCRYPT_PARALLELIZATION) &&
    new RegExp("^[0-9a-f]{" + SCRYPT_SALT_BYTES * 2 + "}$").test(
      saltHex ?? "",
    ) &&
    new RegExp("^[0-9a-f]{" + SCRYPT_KEY_BYTES * 2 + "}$").test(
      derivedHex ?? "",
    )
  );
}
async function verifyDigest(digest: string, key: string): Promise<boolean> {
  const [
    prefix,
    cost,
    blockSize,
    parallelization,
    saltHex = "",
    derivedHex = "",
  ] = digest.split("$");
  if (
    prefix !== SCRYPT_PREFIX ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !new RegExp("^[0-9a-f]{" + SCRYPT_SALT_BYTES * 2 + "}$").test(saltHex) ||
    !new RegExp("^[0-9a-f]{" + SCRYPT_KEY_BYTES * 2 + "}$").test(derivedHex)
  ) {
    return false;
  }

  const expected = Buffer.from(derivedHex, "hex");
  const actual = await deriveKey(key, Buffer.from(saltHex, "hex"));
  return isEqualBuffer(actual, expected);
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

  private async findActiveRecord(key: string): Promise<StoredApiKey | null> {
    const lookupId = parseLookupId(key);
    if (!lookupId) return null;

    const candidates = this.storage
      .list<StoredApiKey>(COLLECTION)
      .filter(
        (candidate) => !candidate.revokedAt && candidate.lookupId === lookupId,
      );
    for (const candidate of candidates) {
      if (await verifyDigest(candidate.digest, key)) return candidate;
    }
    return null;
  }

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
    const lookupId = parseLookupId(key);
    if (key.length < MIN_KEY_LENGTH || !lookupId) {
      throw new Error(
        "API key must use rai_<16 hex lookup characters>_<32+ secret characters>",
      );
    }
    if (this.cleanupRequests > 0) {
      await this.cleanupTail;
    }

    const id = metadata.id ?? randomUUID();
    return this.enqueueKeyMutation(`lookup:${lookupId}`, async () => {
      const lookupOwner = this.storage
        .list<StoredApiKey>(COLLECTION)
        .find(
          (record) =>
            !record.revokedAt &&
            record.lookupId === lookupId &&
            isSupportedDigest(record.digest) &&
            record.id !== id,
        );
      if (lookupOwner) {
        throw new Error("API key lookup ID is already active");
      }

      const record: StoredApiKey = {
        id,
        lookupId,
        digest: await hashKey(key),
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
      `rai_${randomBytes(8).toString("hex")}_${randomBytes(32).toString("hex")}`,
      metadata,
    );
  }

  async resolvePrincipal(rawKey: unknown): Promise<ApiKeyPrincipal | null> {
    if (typeof rawKey !== "string") return null;
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) return null;

    const record = await this.findActiveRecord(key);
    if (!record) return null;

    return {
      type: "api-key",
      keyId: record.id,
      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      capabilities: normalizeScopeValues(record.capabilities),
      resourceScopes: normalizeScopeValues(record.resourceScopes),
    };
  }

  async validate(rawKey: unknown): Promise<boolean> {
    return (await this.resolvePrincipal(rawKey)) !== null;
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

      const existing = await this.findActiveRecord(key);
      if (existing) continue;

      await this.issueDurable(key, {
        id: "env-" + randomUUID(),
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
    if (!key && !projectId) {
      return this.revokeSupersededStudioEnvironmentKeys();
    }
    if (!key || !projectId) {
      throw new Error(
        "STUDIO_API_KEY and STUDIO_PROJECT_ID must be configured together",
      );
    }

    const existing = await this.findActiveRecord(key);
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
        return this.revokeSupersededStudioEnvironmentKeys(existing.id);
      }
      throw new Error(
        "STUDIO_API_KEY already exists with different access metadata",
      );
    }

    const issued = await this.issueDurable(key, {
      id: "studio-env-" + randomUUID(),
      label: STUDIO_ENVIRONMENT_LABEL,
      capabilities: [STUDIO_PROJECT_ACCESS_CAPABILITY],
      resourceScopes: [projectId],
    });
    await this.revokeSupersededStudioEnvironmentKeys(issued.id);
    return 1;
  }

  private async revokeSupersededStudioEnvironmentKeys(
    activeId?: string,
  ): Promise<number> {
    const superseded = this.storage
      .list<StoredApiKey>(COLLECTION)
      .filter(
        (record) =>
          record.label === STUDIO_ENVIRONMENT_LABEL &&
          !record.revokedAt &&
          record.id !== activeId,
      );
    let revoked = 0;
    for (const record of superseded) {
      if (await this.revokeDurable(record.id)) revoked += 1;
    }
    return revoked;
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
