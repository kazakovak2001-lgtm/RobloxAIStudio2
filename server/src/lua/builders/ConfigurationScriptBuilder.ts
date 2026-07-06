/**
 * ConfigurationScriptBuilder.ts — Builds configuration Lua modules.
 */

import type { ConfigurationSet } from "../../generation/engine/GenerationModel";
import { ConfigurationTemplate } from "../templates/ConfigurationTemplate";
import { LuaFormatter } from "../LuaFormatter";
import type { BuiltLuaFile } from "./ServerScriptBuilder";

export class ConfigurationScriptBuilder {
  private template = new ConfigurationTemplate();
  private formatter = new LuaFormatter();

  build(config: ConfigurationSet, gameName: string): BuiltLuaFile[] {
    return [
      this.buildOne(
        "GameConfig",
        `ReplicatedStorage/Config/${gameName}Config.lua`,
        config.gameSettings,
      ),
      this.buildOne(
        "ServerConfig",
        "ServerStorage/Config/ServerConfig.lua",
        config.serverSettings,
      ),
      this.buildOne(
        "ClientConfig",
        "StarterPlayerScripts/Config/ClientConfig.lua",
        config.clientSettings,
      ),
    ];
  }

  private buildOne(
    name: string,
    path: string,
    settings: Record<string, unknown>,
  ): BuiltLuaFile {
    const content = this.formatter.format(
      this.template.render({ name, metadata: {}, settings }),
    );
    return {
      path,
      content,
      lines: content.split("\n").length,
      size: content.length * 2,
    };
  }
}
