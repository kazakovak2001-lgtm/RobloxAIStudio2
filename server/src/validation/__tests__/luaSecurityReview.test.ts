/**
 * SECREVIEW-1 — deterministic trust-boundary review.
 *
 * Two properties matter equally here. The reviewer must catch the exploit
 * shapes the platform currently ships blind, and it must stay quiet on correct
 * code — a reviewer that fires on every generation gets ignored, which is
 * worse than having none. The false-positive suite below is therefore not
 * padding; it is half the contract.
 */

import { describe, it, expect } from "vitest";
import {
  reviewLuaSecurity,
  SECURITY_REVIEW_SCHEMA_VERSION,
} from "../luaSecurityReview";
import { AgentRegistry } from "../../agents/core/AgentRegistry";
import { normalizeLuaScripts } from "../../types/playableLua";

const SERVER = "ServerScriptService/Main.server.lua";
const CLIENT = "StarterPlayerScripts/Hud.client.lua";

function server(code: string) {
  return reviewLuaSecurity([{ path: SERVER, content: code }]);
}

function codes(report: ReturnType<typeof reviewLuaSecurity>) {
  return report.findings.map((f) => f.code);
}

describe("client-authority defects the platform currently ships blind", () => {
  it("flags a reward whose amount comes straight from the client", () => {
    const report = server(`
      local event = Instance.new("RemoteEvent")
      event.OnServerEvent:Connect(function(player, amount)
        local stats = player:FindFirstChild("leaderstats")
        stats.Coins.Value += amount
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_VALUE_AWARDED");
    expect(report.clean).toBe(false);
    expect(report.findings[0].message).toContain("amount");
  });

  it("flags client-supplied damage", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, target, damage)
        target.Humanoid:TakeDamage(damage)
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_DAMAGE");
  });

  it("flags a client-chosen teleport destination", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, destination)
        player.Character:PivotTo(destination)
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_TELEPORT");
  });

  it("flags destroying an instance the client named", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, thing)
        thing:Destroy()
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_INSTANCE_MUTATION");
  });

  it("flags persisting a client-supplied value", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, save)
        store:SetAsync(player.UserId, save)
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_PERSISTED");
  });

  it("flags server logic misplaced on the client", () => {
    const report = reviewLuaSecurity([
      {
        path: CLIENT,
        content: `local store = game:GetService("DataStoreService"):GetDataStore("Save")
        local secret = game.ServerStorage.Weapons`,
      },
    ]);

    expect(codes(report)).toEqual(
      expect.arrayContaining([
        "CLIENT_DATASTORE_ACCESS",
        "CLIENT_SERVER_CONTAINER_ACCESS",
      ]),
    );
  });
});

describe("does not cry wolf on correct server-authoritative code", () => {
  it("stays quiet when the server decides the amount itself", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player)
        local stats = player:FindFirstChild("leaderstats")
        stats.Coins.Value += 10
      end)
    `);

    expect(report.clean).toBe(true);
  });

  it("stays quiet when the client argument is range-checked", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        if amount > 5 then return end
        player.leaderstats.Coins.Value += amount
      end)
    `);

    expect(report.clean).toBe(true);
  });

  it("stays quiet when the client argument only selects from server state", () => {
    const report = server(`
      local PRICES = { sword = 100, shield = 50 }
      event.OnServerEvent:Connect(function(player, itemName)
        local price = PRICES[itemName]
        if not price then return end
        player.leaderstats.Coins.Value -= price
      end)
    `);

    expect(report.clean).toBe(true);
  });

  it("stays quiet when the argument is type-checked", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, slot)
        if type(slot) ~= "number" then return end
        player.Character:MoveTo(SPAWNS[slot])
      end)
    `);

    expect(report.clean).toBe(true);
  });

  it("stays quiet when a handler takes no client argument at all", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player)
        player.Character:Destroy()
      end)
    `);

    expect(report.clean).toBe(true);
  });

  /**
   * The playability contract *requires* this exact shape, so a reviewer that
   * flagged it would fire on every single generation the platform produces.
   */
  it("stays quiet on the shape the playability contract mandates", () => {
    const report = server(`
      local progress = Instance.new("RemoteEvent")
      progress.Name = "ObjectiveProgress"
      progress.Parent = ReplicatedStorage
      local orb = Instance.new("Part")
      orb.Parent = workspace
      orb.Touched:Connect(function(hit)
        local player = Players:GetPlayerFromCharacter(hit.Parent)
        if not player then return end
        orb:Destroy()
        progress:FireAllClients(1, 5)
      end)
    `);

    expect(report.clean).toBe(true);
  });
});

/**
 * The strongest false-positive guard available: the actual Lua the platform
 * ships when no model authors it. If the reviewer fires here it fires on the
 * single most common real output, and would be switched off within a day.
 */
describe("the platform's own shipped game", () => {
  it("passes the review", async () => {
    const registry = new AgentRegistry();
    const output = await registry.executeAgent("lua_generator", {
      blueprint: { name: "Orb Quest", description: "Collect orbs." },
    });

    const scripts = normalizeLuaScripts(output);
    const report = reviewLuaSecurity(scripts);

    expect(report.reviewedScriptCount).toBeGreaterThan(0);
    expect(report.findings).toEqual([]);
  }, 20000);
});

describe("analysis hygiene", () => {
  it("ignores dangerous-looking text inside comments and strings", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        -- never do stats.Coins.Value += amount here
        local warning = "stats.Coins.Value += amount"
        if amount ~= nil then return end
      end)
    `);

    expect(report.clean).toBe(true);
  });

  it("reviews only server and client scripts", () => {
    const report = reviewLuaSecurity([
      { path: "ReplicatedStorage/Shared/Config.lua", content: "return {}" },
    ]);

    expect(report.reviewedScriptCount).toBe(0);
    expect(report.clean).toBe(true);
  });

  it("scopes each finding to the script that raised it", () => {
    const report = reviewLuaSecurity([
      {
        path: SERVER,
        content: `event.OnServerEvent:Connect(function(player, amount)
          player.leaderstats.Coins.Value += amount
        end)`,
      },
      { path: CLIENT, content: "local gui = Instance.new('ScreenGui')" },
    ]);

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].path).toBe(SERVER);
  });

  it("never throws, so a reviewer bug cannot block delivery", () => {
    expect(() =>
      reviewLuaSecurity([
        { path: SERVER, content: "event.OnServerEvent:Connect(function(" },
      ]),
    ).not.toThrow();
  });

  it("states its own limits rather than implying completeness", () => {
    const report = server("-- nothing");

    expect(report.schemaVersion).toBe(SECURITY_REVIEW_SCHEMA_VERSION);
    expect(report.limits.length).toBeGreaterThan(0);
    expect(report.limits.join(" ")).toContain("not proof of safety");
  });

  it("carries remediation on every finding", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        player.leaderstats.Coins.Value += amount
      end)
    `);

    for (const finding of report.findings) {
      expect(finding.remediation.length).toBeGreaterThan(10);
      expect(finding.severity).toBeTruthy();
    }
  });
});
