export interface PlayableLuaScript {
  path: string;
  content: string;
}

const PLACEHOLDER_PATTERN =
  /\b(?:todo|placeholder|not implemented|implement(?:ation)?\s+(?:goes\s+)?here|initialize\s+.+\s+here)\b/i;
const MODULE_RETURN_PATTERN = /\n\s*return\s+[A-Za-z_][A-Za-z0-9_]*\s*;?\s*$/;

/**
 * Fail-closed contract for code that is advertised as a playable Studio import.
 * It intentionally checks observable runtime primitives rather than prose or
 * script volume, which prevents comment-only module skeletons from passing.
 */
export function getPlayableLuaIssues(
  scripts: readonly PlayableLuaScript[],
): string[] {
  const issues: string[] = [];
  const server = scripts.filter((script) =>
    /(?:^|\/)ServerScriptService\//.test(script.path),
  );
  const client = scripts.filter((script) =>
    /(?:^|\/)StarterPlayerScripts\//.test(script.path),
  );

  if (server.length === 0)
    issues.push("at least one server Script is required");
  if (client.length === 0)
    issues.push("at least one client LocalScript is required");

  for (const script of [...server, ...client]) {
    if (script.content.trim().length < 120) {
      issues.push(`${script.path} is too small to implement runtime behavior`);
    }
    if (PLACEHOLDER_PATTERN.test(script.content)) {
      issues.push(`${script.path} contains placeholder implementation text`);
    }
    if (MODULE_RETURN_PATTERN.test(script.content)) {
      issues.push(
        `${script.path} returns a module instead of running as a script`,
      );
    }
  }

  const serverSource = server.map((script) => script.content).join("\n");
  const clientSource = client.map((script) => script.content).join("\n");

  if (
    !/Instance\.new\s*\(/.test(serverSource) ||
    !/\b(?:workspace|Workspace)\b/.test(serverSource)
  ) {
    issues.push("server code must create playable world instances");
  }
  if (!/(?:Touched|Activated)\s*:\s*Connect\s*\(/.test(serverSource)) {
    issues.push("server code must implement a gameplay interaction");
  }
  if (!/Instance\.new\s*\(\s*["']ScreenGui["']/.test(clientSource)) {
    issues.push("client code must create a visible ScreenGui");
  }
  if (!/\bPlayerGui\b/.test(clientSource)) {
    issues.push("client code must attach the HUD to PlayerGui");
  }

  return [...new Set(issues)];
}

export function assertPlayableLuaScripts(
  scripts: readonly PlayableLuaScript[],
): void {
  const issues = getPlayableLuaIssues(scripts);
  if (issues.length > 0) {
    throw new Error(`Lua generation is not playable: ${issues.join("; ")}`);
  }
}
