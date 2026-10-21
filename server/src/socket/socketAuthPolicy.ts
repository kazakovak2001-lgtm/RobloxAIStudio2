/**
 * Socket.IO authentication policy.
 *
 * Authentication is required by default in every environment. The
 * unauthenticated development bypass is an explicit opt-in
 * (SOCKET_AUTH_DEV_BYPASS=true) and is refused outright when
 * NODE_ENV=production, so a misconfigured release fails at startup instead of
 * accepting anonymous sockets.
 */

export type SocketAuthMode = "required" | "dev-bypass";

export function resolveSocketAuthMode(
  env: NodeJS.ProcessEnv = process.env,
): SocketAuthMode {
  const raw = env.SOCKET_AUTH_DEV_BYPASS;
  if (raw === undefined || raw === "" || raw === "false") return "required";
  if (raw !== "true") {
    throw new Error(
      `Unrecognized SOCKET_AUTH_DEV_BYPASS "${raw}"; expected "true" or "false".`,
    );
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "SOCKET_AUTH_DEV_BYPASS=true is not allowed with NODE_ENV=production.",
    );
  }
  return "dev-bypass";
}

/**
 * Builds the project-room authorizer. A socket with an authenticated userId may
 * join only projects that user owns. A socket without a userId is admitted only
 * under the explicit dev bypass; otherwise the join is denied. There is no
 * API-key socket principal today, so no other identity can authorize a join.
 */
export function createProjectJoinAuthorizer(
  mode: SocketAuthMode,
  verifyOwnership: (projectId: string, userId: string) => boolean,
): (projectId: string, userId?: string) => boolean {
  return (projectId, userId) => {
    if (userId) return verifyOwnership(projectId, userId);
    return mode === "dev-bypass";
  };
}
