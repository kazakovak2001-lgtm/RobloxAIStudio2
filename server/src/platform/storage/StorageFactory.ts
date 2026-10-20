/**
 * StorageFactory — Creates the appropriate StorageProvider based on configuration.
 *
 * Set STORAGE_PROVIDER=postgres to use PostgreSQL.
 * Default (unset): inmemory. An unrecognized value is a configuration error,
 * and NODE_ENV=production refuses inmemory storage unless the operator opts in
 * explicitly with ALLOW_INMEMORY_STORAGE_IN_PRODUCTION=true.
 */

import type { StorageProvider } from "./StorageProvider";
import { InMemoryStorageProvider } from "./StorageProvider";
import { PostgresStorageProvider } from "./postgres/PostgresStorageProvider";
import { configureOperationalStores } from "./OperationalStoreComposition";

export type { StorageProvider } from "./StorageProvider";
export type StorageProviderType = "inmemory" | "postgres";
export type StoragePostInitializeHook = () => Promise<void>;

let configuredStorageProvider: StorageProvider | null = null;
const postInitializeHooks = new Set<StoragePostInitializeHook>();

const STORAGE_PROVIDER_TYPES: readonly StorageProviderType[] = [
  "inmemory",
  "postgres",
];

function isStorageProviderType(value: string): value is StorageProviderType {
  return (STORAGE_PROVIDER_TYPES as readonly string[]).includes(value);
}

/**
 * Resolves STORAGE_PROVIDER fail-closed. Absence means the historical
 * inmemory default; an unrecognized value throws rather than degrading to
 * non-durable storage. Production inmemory storage would lose every record on
 * restart, so it is refused unless explicitly allowed.
 */
export function resolveStorageProviderType(
  env: NodeJS.ProcessEnv = process.env,
): StorageProviderType {
  const providerType = env.STORAGE_PROVIDER ?? "inmemory";
  if (!isStorageProviderType(providerType)) {
    throw new Error(
      `Unrecognized STORAGE_PROVIDER "${providerType}"; expected one of: ${STORAGE_PROVIDER_TYPES.join(", ")}.`,
    );
  }
  if (
    providerType === "inmemory" &&
    env.NODE_ENV === "production" &&
    env.ALLOW_INMEMORY_STORAGE_IN_PRODUCTION !== "true"
  ) {
    throw new Error(
      "NODE_ENV=production resolved to inmemory storage, which is not durable; set STORAGE_PROVIDER=postgres, or ALLOW_INMEMORY_STORAGE_IN_PRODUCTION=true for an ephemeral smoke run.",
    );
  }
  return providerType;
}

export function createStorageProvider(): StorageProvider {
  const providerType = resolveStorageProviderType();

  switch (providerType) {
    case "postgres":
      if (!process.env.DATABASE_URL) {
        throw new Error(
          "STORAGE_PROVIDER=postgres requires DATABASE_URL; refusing cache-only production storage.",
        );
      }
      console.log("[Storage] Using PostgreSQL provider");
      configuredStorageProvider = new PostgresStorageProvider({ strict: true });
      break;
    case "inmemory":
      console.log("[Storage] Using InMemory provider");
      configuredStorageProvider = new InMemoryStorageProvider();
      break;
  }

  configureOperationalStores(configuredStorageProvider);
  return configuredStorageProvider;
}

/**
 * Returns the provider created during application bootstrap.
 * Compatibility repositories use this accessor when an older constructor does
 * not yet accept explicit dependency injection.
 */
export function getConfiguredStorageProvider(): StorageProvider | null {
  return configuredStorageProvider;
}

export function registerStoragePostInitializeHook(
  hook: StoragePostInitializeHook,
): () => void {
  postInitializeHooks.add(hook);
  return () => postInitializeHooks.delete(hook);
}

export async function initializeStorageProvider(
  provider: StorageProvider,
): Promise<void> {
  await provider.ready?.();
  for (const hook of postInitializeHooks) {
    await hook();
  }
}

export async function flushStorageProvider(
  provider: StorageProvider,
): Promise<void> {
  await provider.flush?.();
}

export async function closeStorageProvider(
  provider: StorageProvider,
): Promise<void> {
  await provider.close?.();
}

export function getStorageType(): StorageProviderType {
  return resolveStorageProviderType();
}
