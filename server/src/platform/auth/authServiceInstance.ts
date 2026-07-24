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

export let authService = new AuthService(new InMemoryStorageProvider());

/** Configure the process-wide authentication boundary with the app storage. */
export function configureAuthService(storage: StorageProvider): AuthService {
  authService = new AuthService(storage);
  return authService;
}
