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
  SECURITY_ANALYSIS_MODES,
  SECURITY_ENFORCEMENT_MODES,
  SECURITY_REVIEW_ANALYSIS_MODE,
  SECURITY_REVIEW_ENFORCEMENT,
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
 * Every case here is a false positive review found in the first version, and
 * none was visible to the original suite. They are grouped so the gap that
 * hid them stays documented.
 */
describe("regressions from review: dangerous shapes that are not defects", () => {
  /**
   * A loop opens its block with the `do` that ends its header, so counting
   * the loop keyword as well left the body unterminated. Everything after the
   * handler was then attributed to its client arguments.
   */
  it("does not run the handler body past a for loop", () => {
    // The trailing statement names the handler's own unvalidated parameter,
    // so it is only clean if the body genuinely stopped at the handler's end.
    // A weaker fixture passes with the bug present and proves nothing.
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        for index = 1, 3 do
          print(index)
        end
      end)

      leaderboard.Coins.Value += amount
    `);

    expect(report.clean).toBe(true);
  });

  it("does not run the handler body past a while loop", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        while running do
          wait(1)
        end
      end)

      leaderboard.Coins.Value += amount
    `);

    expect(report.clean).toBe(true);
  });

  /**
   * The sink must be reached by an unchecked client value. A request-style
   * remote whose argument is only an identifier is the most ordinary shape
   * there is, and flagging it would have made the reviewer unusable.
   */
  it("does not flag a server-decided reward beside an unchecked identifier", () => {
    const report = server(`
      local SERVER_REWARD = 25
      event.OnServerEvent:Connect(function(player, requestId)
        player.leaderstats.Coins.Value += SERVER_REWARD
      end)
    `);

    expect(report.clean).toBe(true);
  });

  it("still flags the same reward when the client value reaches it", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, requestId, amount)
        player.leaderstats.Coins.Value += amount
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_VALUE_AWARDED");
  });

  it("follows a client value through one direct assignment", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, rawAmount)
        local amount = rawAmount
        player.leaderstats.Coins.Value += amount
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_VALUE_AWARDED");
  });

  /**
   * Reshaping is not bounding. `math.floor` and `math.abs` leave the value
   * unbounded above, and `math.max` only raises a floor, so none of them
   * makes a client-chosen reward safe.
   */
  it.each([
    ["math.floor", "amount = math.floor(amount)"],
    ["math.abs", "amount = math.abs(amount)"],
    ["math.max", "amount = math.max(amount, 0)"],
  ])("does not accept %s as validation of a reward", (_label, transform) => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        ${transform}
        player.leaderstats.Coins.Value += amount
      end)
    `);

    expect(codes(report)).toContain("REMOTE_CLIENT_VALUE_AWARDED");
  });

  it.each([
    ["math.clamp", "math.clamp(amount, 0, 10)"],
    ["math.min", "math.min(amount, 10)"],
  ])("accepts %s, which imposes an upper bound", (_label, transform) => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        local safe = ${transform}
        player.leaderstats.Coins.Value += safe
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

/**
 * A historical report must state how it was produced and what it was allowed
 * to do, so a later blocking regime cannot be read backwards onto records
 * written under an advisory one.
 */
describe("self-describing analysis and enforcement contract", () => {
  it("declares deterministic-pattern analysis and advisory enforcement", () => {
    const report = server("-- nothing");

    expect(report.analysisMode).toBe("deterministic-pattern");
    expect(report.enforcement).toBe("advisory");
  });

  it("stays advisory when findings exist", () => {
    const report = server(`
      event.OnServerEvent:Connect(function(player, amount)
        player.leaderstats.Coins.Value += amount
      end)
    `);

    // Enforcement is a property of the regime, never of what was found.
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.enforcement).toBe("advisory");
    expect(report.clean).toBe(false);
  });

  it("uses the declared vocabulary rather than loose strings", () => {
    const report = server("-- nothing");

    expect(SECURITY_ANALYSIS_MODES).toContain(report.analysisMode);
    expect(SECURITY_ENFORCEMENT_MODES).toContain(report.enforcement);
    expect(report.enforcement).toBe(SECURITY_REVIEW_ENFORCEMENT);
    expect(report.analysisMode).toBe(SECURITY_REVIEW_ANALYSIS_MODE);
  });

  it("survives JSON serialization, which is how it is persisted and shipped", () => {
    const report = server("-- nothing");
    const roundTripped = JSON.parse(JSON.stringify(report));

    expect(roundTripped.analysisMode).toBe("deterministic-pattern");
    expect(roundTripped.enforcement).toBe("advisory");
    expect(roundTripped.schemaVersion).toBe(SECURITY_REVIEW_SCHEMA_VERSION);
  });
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

  it("reviews only server and client scripts, and says so instead of passing", () => {
    // SECURITY-REVIEW-A2 corrected this expectation. A shared module carries
    // no trust boundary, so no rule can apply to it — but reporting that as
    // `clean` said the reviewer had checked something it never looked at.
    const report = reviewLuaSecurity([
      { path: "ReplicatedStorage/Shared/Config.lua", content: "return {}" },
    ]);

    expect(report.reviewedScriptCount).toBe(0);
    expect(report.suppliedScriptCount).toBe(1);
    expect(report.outcome).toBe("not_applicable");
    expect(report.clean).toBe(false);
    expect(report.scripts[0].outcome).toBe("not_applicable");
    expect(report.scripts[0].reason).toMatch(/no rule applies/i);
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
