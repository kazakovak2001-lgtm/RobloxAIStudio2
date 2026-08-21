/**
 * GameValidationEngine.gates.test.ts
 *
 * MAR-009 / MAR-010. Regression fixtures proving that generated Luau which
 * fails an existing blocking check (compile/policy or GameValidationEngine's
 * own exploit-risk rules) is refused, while a valid minimal generation still
 * passes. Also pins that the deep security scanner (SECREVIEW-1) is reused
 * rather than duplicated, and stays advisory per
 * docs/00-project-control/SECURITY-REVIEW-B_PROMOTION_CRITERIA.md.
 */

import { describe, expect, it } from "vitest";
import { GameBlueprintEngine } from "../../blueprint/GameBlueprintEngine";
import { LuaGenerator, type LuaGenerationResult } from "../../lua/LuaGenerator";
import { AssetGenerator } from "../../assets/AssetGenerator";
import { GameValidationEngine } from "../GameValidationEngine";

function baseline() {
  const blueprint = new GameBlueprintEngine().generate({});
  const lua = new LuaGenerator().generate(blueprint);
  const assets = new AssetGenerator().generate(blueprint);
  return { blueprint, lua, assets };
}

function withMutatedScript(
  lua: LuaGenerationResult,
  name: string,
  mutate: (code: string) => string,
): LuaGenerationResult {
  return {
    ...lua,
    scripts: lua.scripts.map((script) =>
      script.name === name ? { ...script, code: mutate(script.code) } : script,
    ),
  };
}

describe("MAR-009/010 — generated Luau validation gates", () => {
  it("passes a valid minimal playable generation", () => {
    const { blueprint, lua, assets } = baseline();
    const validator = new GameValidationEngine();

    const result = validator.validate(blueprint, lua, assets);

    expect(result.passed).toBe(true);
    expect(result.errors).toBe(0);
  });

  it("fails closed on syntax-invalid Luau (unclosed function)", () => {
    const { blueprint, lua, assets } = baseline();
    const broken = withMutatedScript(
      lua,
      "GameManager",
      (code) => `${code}\nfunction Broken1()\nfunction Broken2()`,
    );
    const validator = new GameValidationEngine();

    const result = validator.validate(blueprint, broken, assets);

    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.severity === "error" && issue.code === "LUA_CODE_ERROR",
      ),
    ).toBe(true);
  });

  it("fails closed on forbidden/insecure generated code (loadstring)", () => {
    const { blueprint, lua, assets } = baseline();
    const insecure = withMutatedScript(
      lua,
      "GameManager",
      (code) => `loadstring("print(1)")()\n${code}`,
    );
    const validator = new GameValidationEngine();

    const result = validator.validate(blueprint, insecure, assets);

    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.severity === "error" &&
          issue.code === "LUA_CODE_ERROR" &&
          issue.message.includes("loadstring"),
      ),
    ).toBe(true);
  });

  it("fails closed on an existing exploit-risk rule (client DataStore access)", () => {
    const { blueprint, lua, assets } = baseline();
    const insecure = withMutatedScript(
      lua,
      "ClientController",
      (code) => `${code}\nlocal ds = game:GetService("DataStoreService")`,
    );
    const validator = new GameValidationEngine();

    const result = validator.validate(blueprint, insecure, assets);

    expect(result.passed).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.severity === "error" && issue.code === "CLIENT_DATASTORE",
      ),
    ).toBe(true);
  });

  it("attaches the reused SECREVIEW-1 scanner's findings as advisory only", () => {
    const { blueprint, lua, assets } = baseline();
    // A server RemoteEvent handler that awards a client-supplied amount
    // unchecked — the canonical trust-boundary finding reviewLuaSecurity
    // exists to catch, and which none of this engine's own rules detect.
    const exploitable = withMutatedScript(
      lua,
      "EconomyService",
      (code) =>
        `${code}\nlocal Remote = Instance.new("RemoteEvent")\nRemote.OnServerEvent:Connect(function(player, amount)\n\tplayer.leaderstats.Coins.Value += amount\nend)`,
    );
    const validator = new GameValidationEngine();

    const result = validator.validate(blueprint, exploitable, assets);

    const securityFindings = result.issues.filter((issue) =>
      issue.code.startsWith("SECURITY_REVIEW_"),
    );
    expect(securityFindings.length).toBeGreaterThan(0);
    // Advisory: present, but never severity "error", so it cannot block
    // delivery — the reviewer's own enforcement contract.
    expect(securityFindings.every((issue) => issue.severity === "info")).toBe(
      true,
    );
  });
});
