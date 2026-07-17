/**
 * Shared AuthService Singleton
 *
 * Provides a single AuthService instance that can be imported by both
 * the security middleware and the platform router (and any other module
 * that needs token validation).
 */

import { AuthService } from "./AuthService";

export const authService = new AuthService();
