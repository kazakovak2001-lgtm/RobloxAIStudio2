/**
 * StorageFactory — Creates the appropriate StorageProvider based on configuration.
 *
 * Set STORAGE_PROVIDER=postgres to use PostgreSQL.
 * Default: inmemory
 */

import type { StorageProvider } from "./StorageProvider";
import { InMemoryStorageProvider } from "./StorageProvider";
import { PostgresStorageProvider } from "./postgres/PostgresStorageProvider";

export type StorageProviderType = "inmemory" | "postgres";

export function createStorageProvider(): StorageProvider {
  const providerType = (process.env.STORAGE_PROVIDER ??
    "inmemory") as StorageProviderType;

  switch (providerType) {
    case "postgres":
      console.log("[Storage] Using PostgreSQL provider");
      return new PostgresStorageProvider();
    case "inmemory":
    default:
      console.log("[Storage] Using InMemory provider");
      return new InMemoryStorageProvider();
  }
}

export function getStorageType(): StorageProviderType {
  return (process.env.STORAGE_PROVIDER ?? "inmemory") as StorageProviderType;
}
