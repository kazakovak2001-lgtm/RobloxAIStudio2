/**
 * ConfigurationBuilder.ts — Converts ConfigurationSet into config file artifacts.
 */

import type { ConfigurationSet } from "../GenerationModel";
import type { ProjectNode } from "../model/RobloxProjectModel";

export interface BuiltConfig {
  node: ProjectNode;
  path: string;
  content: string;
  sizeBytes: number;
}

export class ConfigurationBuilder {
  build(config: ConfigurationSet, gameName: string): BuiltConfig[] {
    const configs: BuiltConfig[] = [];

    configs.push(
      this.buildOne(
        "GameConfig",
        "ReplicatedStorage/Config/GameConfig.lua",
        config.gameSettings,
        gameName,
      ),
    );
    configs.push(
      this.buildOne(
        "ServerConfig",
        "ServerStorage/Config/ServerConfig.lua",
        config.serverSettings,
        gameName,
      ),
    );
    configs.push(
      this.buildOne(
        "ClientConfig",
        "StarterPlayerScripts/Config/ClientConfig.lua",
        config.clientSettings,
        gameName,
      ),
    );

    return configs;
  }

  private buildOne(
    name: string,
    path: string,
    settings: Record<string, unknown>,
    gameName: string,
  ): BuiltConfig {
    const content = this.generateConfigLua(name, settings, gameName);
    return {
      node: { name, type: "ModuleScript", path, content },
      path,
      content,
      sizeBytes: content.length * 2,
    };
  }

  private generateConfigLua(
    name: string,
    settings: Record<string, unknown>,
    gameName: string,
  ): string {
    const lines = [
      `-- ${name} for ${gameName}`,
      `-- Auto-generated configuration`,
      ``,
      `local ${name} = {`,
    ];
    for (const [key, value] of Object.entries(settings)) {
      lines.push(`    ${key} = ${this.luaValue(value)},`);
    }
    lines.push(`}`, ``, `return ${name}`);
    return lines.join("\n");
  }

  private luaValue(value: unknown): string {
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return String(value);
    if (Array.isArray(value))
      return `{${value.map((v) => this.luaValue(v)).join(", ")}}`;
    return `nil`;
  }
}
