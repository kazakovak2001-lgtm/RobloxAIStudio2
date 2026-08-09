export interface PlayableLuaScript {
  path: string;
  content: string;
}

type LuaScriptKind = "server" | "client" | "module";

const PLACEHOLDER_PATTERN =
  /\b(?:todo|placeholder|not implemented|implement(?:ation)?\s+(?:goes\s+)?here|initialize\s+.+\s+here)\b/i;
const MODULE_RETURN_PATTERN = /\n\s*return\s+[A-Za-z_][A-Za-z0-9_]*\s*;?\s*$/;

/** Normalize canonical and legacy generator shapes through one Studio path contract. */
export function normalizeLuaScripts(output: unknown): PlayableLuaScript[] {
  if (!isRecord(output))
    throw new Error("Lua generator output must be an object");

  if (Array.isArray(output.scripts) && output.scripts.length > 0) {
    const scripts = output.scripts.map((script, index) => {
      if (!isRecord(script))
        throw new Error(`Lua script ${index + 1} must be an object`);
      if (!isNonEmptyString(script.path)) {
        throw new Error(`Lua script ${index + 1} requires a non-empty path`);
      }
      if (typeof script.content !== "string") {
        throw new Error(`Lua script ${index + 1} requires string content`);
      }
      return { path: script.path, content: script.content };
    });
    assertUniquePaths(scripts);
    return scripts;
  }

  const legacy = isRecord(output.lua_generator)
    ? output.lua_generator
    : undefined;
  const scripts = [
    ...normalizeLuaGroup(legacy?.server, "ServerScriptService", "server"),
    ...normalizeLuaGroup(legacy?.client, "StarterPlayerScripts", "client"),
    ...normalizeLuaGroup(legacy?.shared, "ReplicatedStorage/Shared", "module"),
    ...normalizeLuaGroup(legacy?.modules, "ReplicatedStorage/Shared", "module"),
  ];
  if (scripts.length === 0) {
    throw new Error(
      "Lua generator output must produce a non-empty Studio scripts array",
    );
  }
  assertUniquePaths(scripts);
  return scripts;
}

function normalizeLuaGroup(
  value: unknown,
  root: string,
  kind: LuaScriptKind,
): PlayableLuaScript[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${kind} Lua entry ${index + 1} must be an object`);
    }
    if (isNonEmptyString(entry.path) && typeof entry.content === "string") {
      return { path: entry.path, content: entry.content };
    }
    if (!isNonEmptyString(entry.name) || typeof entry.code !== "string") {
      throw new Error(
        `${kind} Lua entry ${index + 1} requires name/code or path/content`,
      );
    }
    return {
      path: `${root}/${ensureLuaSuffix(entry.name, kind)}`,
      content: entry.code,
    };
  });
}

function ensureLuaSuffix(name: string, kind: LuaScriptKind): string {
  const withoutLua = name.replace(/\.lua$/i, "");
  if (kind === "server") {
    return withoutLua.endsWith(".server")
      ? `${withoutLua}.lua`
      : `${withoutLua}.server.lua`;
  }
  if (kind === "client") {
    return withoutLua.endsWith(".client")
      ? `${withoutLua}.lua`
      : `${withoutLua}.client.lua`;
  }
  return `${withoutLua}.lua`;
}

/**
 * Fail-closed contract for code that is advertised as a playable Studio import.
 * Runtime evidence is inspected after comments are removed, preventing
 * comment-only examples from being accepted as executable behavior.
 */
export function getPlayableLuaIssues(
  scripts: readonly PlayableLuaScript[],
): string[] {
  const issues: string[] = [];
  const server = scripts.filter((script) =>
    script.path.startsWith("ServerScriptService/"),
  );
  const client = scripts.filter((script) =>
    script.path.startsWith("StarterPlayerScripts/"),
  );

  if (server.length === 0)
    issues.push("at least one server Script is required");
  if (client.length === 0)
    issues.push("at least one client LocalScript is required");

  for (const script of [...server, ...client]) {
    const executableSource = stripLuaComments(script.content);
    if (stripLuaStrings(executableSource).trim().length < 120) {
      issues.push(`${script.path} is too small to implement runtime behavior`);
    }
    if (PLACEHOLDER_PATTERN.test(stripLuaStrings(script.content))) {
      issues.push(`${script.path} contains placeholder implementation text`);
    }
    if (MODULE_RETURN_PATTERN.test(executableSource)) {
      issues.push(
        `${script.path} returns a module instead of running as a script`,
      );
    }
  }

  const serverSources = server.map((script) =>
    stripLuaStrings(
      stripLuaComments(script.content),
      new Set([
        "Workspace",
        "RemoteEvent",
        "leaderstats",
        "IntValue",
        "GamePassService",
      ]),
    ),
  );
  const serverSource = serverSources.join("\n");
  const clientSources = client.map((script) =>
    stripLuaStrings(
      stripLuaComments(script.content),
      new Set(["ScreenGui", "PlayerGui", "leaderstats"]),
    ),
  );
  const clientSource = clientSources.join("\n");

  if (/:InsertService\s*\(/i.test(`${serverSource}\n${clientSource}`)) {
    issues.push("runtime code must not call the invalid InsertService API");
  }
  if (/GetService\s*\(\s*["']GamePassService["']\s*\)/i.test(serverSource)) {
    issues.push("server code must not request the nonexistent GamePassService");
  }
  if (serverSources.some((source) => /^return\s*\{/m.test(source))) {
    issues.push("server Scripts must not return ModuleScript tables");
  }

  if (
    !/Instance\.new\s*\(/.test(serverSource) ||
    !/\b(?:workspace|Workspace)\b/.test(serverSource)
  ) {
    issues.push("server code must create playable world instances");
  }
  if (
    !/(?:Touched|Activated|Triggered|MouseClick|OnServerEvent)\s*:\s*Connect\s*\(/i.test(
      serverSource,
    )
  ) {
    issues.push("server code must implement a gameplay interaction");
  }
  if (!/Instance\.new\s*\(\s*["']ScreenGui["']/.test(clientSource)) {
    issues.push("client code must create a visible ScreenGui");
  }
  if (!/\bplayerGui\b/i.test(clientSource)) {
    issues.push("client code must attach the HUD to PlayerGui");
  }

  const serverPublishesProgress =
    (/Instance\.new\s*\(\s*["']RemoteEvent["']/.test(serverSource) &&
      /\b(?:FireClient|FireAllClients)\s*\(/.test(serverSource)) ||
    (/\bleaderstats\b/i.test(serverSource) &&
      /Instance\.new\s*\(\s*["']IntValue["']/.test(serverSource));
  const clientObservesProgress =
    /\bOnClientEvent\s*:\s*Connect\s*\(/.test(clientSource) ||
    (/\bleaderstats\b/i.test(clientSource) &&
      /\.Changed\s*:\s*Connect\s*\(/.test(clientSource));
  if (!serverPublishesProgress || !clientObservesProgress) {
    issues.push(
      "server and client code must connect objective progress to the HUD",
    );
  }

  const hasSelfContainedServerObjective = serverSources.some(
    (source) =>
      /Instance\.new\s*\(/.test(source) &&
      /\b(?:workspace|Workspace)\b/.test(source) &&
      /(?:Touched|Activated|Triggered|MouseClick)\s*:\s*Connect\s*\(/i.test(
        source,
      ) &&
      /Instance\.new\s*\(\s*["']RemoteEvent["']/.test(source) &&
      /\b(?:FireClient|FireAllClients)\s*\(/.test(source),
  );
  if (!hasSelfContainedServerObjective) {
    issues.push(
      "one server Script must own the complete world, objective, and progress event",
    );
  }

  const hasSelfContainedClientHud = clientSources.some((source) => {
    const guiIndex = source.search(/Instance\.new\s*\(\s*["']ScreenGui["']/);
    const listenerIndex = source.search(/\bOnClientEvent\s*:\s*Connect\s*\(/);
    return (
      guiIndex >= 0 &&
      listenerIndex > guiIndex &&
      /WaitForChild\s*\(\s*["']PlayerGui["']\s*\)/.test(source) &&
      /\.Parent\s*=\s*playerGui\b/i.test(source)
    );
  });
  if (!hasSelfContainedClientHud) {
    issues.push(
      "one client LocalScript must create the HUD before observing progress",
    );
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

export function stripLuaComments(source: string): string {
  let result = "";
  let index = 0;
  let quote: '"' | "'" | null = null;
  while (index < source.length) {
    const char = source[index];
    if (quote) {
      result += char;
      if (char === "\\" && index + 1 < source.length) {
        result += source[++index];
      } else if (char === quote) {
        quote = null;
      }
      index++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      index++;
      continue;
    }
    if (char === "-" && source[index + 1] === "-") {
      if (source.slice(index + 2, index + 4) === "[[") {
        const end = source.indexOf("]]", index + 4);
        index = end === -1 ? source.length : end + 2;
      } else {
        const end = source.indexOf("\n", index + 2);
        index = end === -1 ? source.length : end + 1;
        result += "\n";
      }
      continue;
    }
    result += char;
    index++;
  }
  return result;
}

export function stripLuaStrings(
  source: string,
  preservedValues: ReadonlySet<string> = new Set(),
): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const quote = source[index];
    if (quote !== '"' && quote !== "'") {
      if (source.slice(index, index + 2) === "[[") {
        const end = source.indexOf("]]", index + 2);
        result += '""';
        index = end === -1 ? source.length : end + 2;
        continue;
      }
      result += quote;
      index++;
      continue;
    }
    let value = "";
    index++;
    while (index < source.length) {
      if (source[index] === "\\" && index + 1 < source.length) {
        value += source[index] + source[index + 1];
        index += 2;
      } else if (source[index] === quote) {
        index++;
        break;
      } else {
        value += source[index++];
      }
    }
    result += preservedValues.has(value)
      ? `${quote}${value}${quote}`
      : quote + quote;
  }
  return result;
}

function assertUniquePaths(scripts: readonly PlayableLuaScript[]): void {
  const seen = new Set<string>();
  for (const script of scripts) {
    if (seen.has(script.path)) {
      throw new Error(`Duplicate Lua script path: ${script.path}`);
    }
    seen.add(script.path);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
