/**
 * StorageFactory — Creates the appropriate StorageProvider based on configuration.
 *
 * Set STORAGE_PROVIDER=postgres to use PostgreSQL.
 * Default: inmemory
 */

import type { StorageProvider } from "./StorageProvider";
import { InMemoryStorageProvider } from "./StorageProvider";
import { PostgresStorageProvider } from "./postgres/PostgresStorageProvider";

export type { StorageProvider } from "./StorageProvider";
export type StorageProviderType = "inmemory" | "postgres";
export type StoragePostInitializeHook = () => Promise<void>;

let configuredStorageProvider: StorageProvider | null = null;
const postInitializeHooks = new Set<StoragePostInitializeHook>();

export function createStorageProvider(): StorageProvider {
  const providerType = (process.env.STORAGE_PROVIDER ??
    "inmemory") as StorageProviderType;

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
    default:
      console.log("[Storage] Using InMemory provider");
      configuredStorageProvider = new InMemoryStorageProvider();
      break;
  }

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
  return (process.env.STORAGE_PROVIDER ?? "inmemory") as StorageProviderType;
}
