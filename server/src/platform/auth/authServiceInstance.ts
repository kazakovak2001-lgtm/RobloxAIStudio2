/**
 * Shared AuthService Singleton
 *
 * Provides a single AuthService instance that can be imported by both
 * the security middleware and the platform router (and any other module
 * that needs token validation).
 */

import { AuthService } from "./AuthService";
import {
  InMemoryStorageProvider,
  type StorageProvider,
} from "../storage/StorageProvider";
import { registerStoragePostInitializeHook } from "../storage/StorageFactory";

type BootstrapCompatibleAuthService = AuthService & {
  migrateLegacyRefreshCredentials(): number;
};

function withBootstrapCompatibility(
  service: AuthService,
): BootstrapCompatibleAuthService {
  Object.defineProperty(service, "migrateLegacyRefreshCredentials", {
    configurable: true,
    value: () => 0,
  });
  return service as BootstrapCompatibleAuthService;
}

export let authService = withBootstrapCompatibility(
  new AuthService(new InMemoryStorageProvider()),
);

let unregisterMigrationHook: (() => void) | undefined;

/** Configure the process-wide authentication boundary with the app storage. */
export function configureAuthService(storage: StorageProvider): AuthService {
  unregisterMigrationHook?.();
  authService = withBootstrapCompatibility(new AuthService(storage));
  unregisterMigrationHook = registerStoragePostInitializeHook(async () => {
    await authService.migrateLegacyRefreshCredentialsDurable();
  });
  return authService;
}
