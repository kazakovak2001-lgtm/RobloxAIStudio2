import { describe, it, expect } from "vitest";

import {
  SECURITY_REVIEW_SCHEMA_VERSION,
  reviewLuaSecurity,
  securityReviewMatchesScripts,
} from "../validation/luaSecurityReview";
import { computeContentHash, deterministicProducer } from "../pipeline/v2";

/**
 * SECURITY-REVIEW-A2 — hardening of the deterministic reviewer.
 *
 * The reviewer stays advisory. What changes is that it can no longer report a
 * pass over input it did not read, it says which exact bytes it reviewed, and
 * every finding carries a location and the source that raised it.
 */

const SERVER = "ServerScriptService/Main.server.lua";
const CLIENT = "StarterPlayerScripts/Hud.client.lua";

function server(body: string) {
  return [{ path: SERVER, content: body }];
}

describe("SECURITY-REVIEW-A2 refuses to report a pass over what it did not read", () => {
  it("does not call an empty review clean", () => {
    // The v2 pipeline reaches this exact call when Lua cannot be normalized.
    const report = reviewLuaSecurity([]);

    expect(report.outcome).toBe("not_inspected");
    expect(report.clean).toBe(false);
    expect(report.reviewedScriptCount).toBe(0);
    expect(report.suppliedScriptCount).toBe(0);
  });

  it("does not call a partial review clean", () => {
    const report = reviewLuaSecurity([
      { path: SERVER, content: "local x = 1" },
      { path: CLIENT, content: undefined as unknown as string },
    ]);

    // One script really was analysed and really did pass, and the report says
    // so per script — but the report as a whole must not.
    expect(report.scripts.find((s) => s.path === SERVER)?.outcome).toBe("pass");
    expect(report.outcome).toBe("not_inspected");
    expect(report.clean).toBe(false);
  });

  it("records an unreadable script rather than dropping it", () => {
    const report = reviewLuaSecurity([
      { path: SERVER, content: 42 as unknown as string },
    ]);

    expect(report.suppliedScriptCount).toBe(1);
    expect(report.scripts[0]).toMatchObject({
      path: SERVER,
      contentHash: null,
      outcome: "not_inspected",
    });
    expect(report.scripts[0].reason).toMatch(/not readable/i);
  });

  it("does not pass a package that also carries a script no rule applies to", () => {
    // Review found this: passing because the *other* scripts passed only
    // moves the blind spot from the whole report into one file inside it.
    const report = reviewLuaSecurity([
      { path: SERVER, content: "local total = 0" },
      { path: "ReplicatedStorage/Shared.lua", content: "return {}" },
    ]);

    expect(report.scripts.find((s) => s.path === SERVER)?.outcome).toBe("pass");
    expect(report.outcome).toBe("not_applicable");
    expect(report.clean).toBe(false);
    expect(report.coverageComplete).toBe(false);
  });

  it("reports incomplete coverage even when it did find something", () => {
    // `outcome` names the defect, because a finding is never a misleading
    // pass. Coverage is stated separately so it cannot be lost.
    const report = reviewLuaSecurity([
      {
        path: SERVER,
        content: [
          "remote.OnServerEvent:Connect(function(player, amount)",
          "  player.leaderstats.Coins.Value += amount",
          "end)",
        ].join("\n"),
      },
      { path: CLIENT, content: undefined as unknown as string },
    ]);

    expect(report.outcome).toBe("finding");
    expect(report.coverageComplete).toBe(false);
    expect(report.scripts.find((s) => s.path === CLIENT)?.outcome).toBe(
      "not_inspected",
    );
  });

  it("names the actual reason a script could not be read", () => {
    const report = reviewLuaSecurity([
      { path: "", content: "local a = 1" },
      { path: SERVER, content: 7 as unknown as string },
    ]);

    expect(report.scripts[0].reason).toMatch(/no path/i);
    expect(report.scripts[1].reason).toMatch(/not readable source text/i);
  });

  it("passes only when everything supplied was analysed and nothing fired", () => {
    const report = reviewLuaSecurity([
      { path: SERVER, content: "local total = 0" },
      { path: CLIENT, content: "local gui = script.Parent" },
    ]);

    expect(report.outcome).toBe("pass");
    expect(report.clean).toBe(true);
    expect(report.reviewedScriptCount).toBe(2);
  });
});

describe("SECURITY-REVIEW-A2 ties a report to the bytes it reviewed", () => {
  it("records the ARTIFACT-CONTRACT-2 content hash of every readable script", () => {
    const content = "local total = 0";
    const report = reviewLuaSecurity([{ path: SERVER, content }]);

    // Deliberately the same construction the artifact envelope uses, so the
    // two identities cannot drift apart without this failing.
    expect(report.scripts[0].contentHash).toBe(computeContentHash(content));
  });

  it("detects that a report no longer describes regenerated Lua", () => {
    const original = [{ path: SERVER, content: "local total = 0" }];
    const report = reviewLuaSecurity(original);

    expect(securityReviewMatchesScripts(report, original)).toBe(true);
    // One character of drift is enough: the report reviewed other bytes.
    expect(
      securityReviewMatchesScripts(report, [
        { path: SERVER, content: "local total = 1" },
      ]),
    ).toBe(false);
  });

  it("does not match a set that merely happens to share a path count", () => {
    // A report holding one path twice does not describe a set holding it once.
    const report = {
      scripts: [
        {
          path: SERVER,
          contentHash: computeContentHash("a"),
          outcome: "pass" as const,
        },
        {
          path: SERVER,
          contentHash: computeContentHash("b"),
          outcome: "pass" as const,
        },
      ],
    };

    expect(
      securityReviewMatchesScripts(report, [{ path: SERVER, content: "a" }]),
    ).toBe(false);
  });

  it("detects a changed script set, not only changed content", () => {
    const report = reviewLuaSecurity([
      { path: SERVER, content: "local a = 1" },
    ]);

    expect(
      securityReviewMatchesScripts(report, [
        { path: SERVER, content: "local a = 1" },
        { path: CLIENT, content: "local b = 2" },
      ]),
    ).toBe(false);
  });

  it("keeps the producer version in step with the report shape", () => {
    // The producer version exists to tell durable reports of different shapes
    // apart. If the payload changes and the version does not, artifacts from
    // either side of the change claim the same contract.
    expect(deterministicProducer("lua-security-review").version).toBe(
      SECURITY_REVIEW_SCHEMA_VERSION,
    );
  });

  it("survives the JSON round trip it is persisted through", () => {
    const report = reviewLuaSecurity([
      { path: SERVER, content: "local a = 1" },
    ]);
    const restored = JSON.parse(JSON.stringify(report));

    expect(restored.schemaVersion).toBe(SECURITY_REVIEW_SCHEMA_VERSION);
    expect(
      securityReviewMatchesScripts(restored, [
        { path: SERVER, content: "local a = 1" },
      ]),
    ).toBe(true);
  });
});

describe("SECURITY-REVIEW-A2 rules added to close coverage gaps", () => {
  it("flags a RemoteFunction handler, which was invisible before", () => {
    const report = reviewLuaSecurity(
      server(
        [
          "local remote = Instance.new('RemoteFunction')",
          "remote.OnServerInvoke = function(player, amount)",
          "  player.leaderstats.Coins.Value += amount",
          "  return true",
          "end",
        ].join("\n"),
      ),
    );

    expect(report.findings.map((f) => f.code)).toContain(
      "REMOTE_CLIENT_VALUE_AWARDED",
    );
  });

  it("flags runtime code compilation on the server", () => {
    const report = reviewLuaSecurity(
      server("local chunk = loadstring(payload)\nchunk()"),
    );

    const finding = report.findings.find(
      (f) => f.code === "SERVER_DYNAMIC_CODE_EXECUTION",
    );
    expect(finding?.severity).toBe("critical");
    expect(finding?.line).toBe(1);
  });

  it("flags a handler that acts on a player the client named", () => {
    // The general guard reads `Players[target]` as validation, which is right
    // for a reward table and wrong for a player registry.
    const report = reviewLuaSecurity(
      server(
        [
          "remote.OnServerEvent:Connect(function(player, target)",
          "  local victim = Players[target]",
          "  victim:Kick()",
          "end)",
        ].join("\n"),
      ),
    );

    expect(report.findings.map((f) => f.code)).toContain(
      "REMOTE_CLIENT_IDENTITY_TRUSTED",
    );
  });

  it("flags an outbound request whose target the client chose", () => {
    const report = reviewLuaSecurity(
      server(
        [
          "remote.OnServerEvent:Connect(function(player, url)",
          "  HttpService:PostAsync(url, body)",
          "end)",
        ].join("\n"),
      ),
    );

    expect(report.findings.map((f) => f.code)).toContain(
      "REMOTE_CLIENT_HTTP_TARGET",
    );
  });

  it("stays quiet on the safe shapes each new rule could be confused by", () => {
    const report = reviewLuaSecurity([
      {
        path: SERVER,
        content: [
          // Server-owned table indexed by a client choice: legitimate.
          "remote.OnServerEvent:Connect(function(player, tier)",
          "  local reward = RewardTable[tier]",
          "  player.leaderstats.Coins.Value += reward",
          "end)",
          // Server-decided request with no client value reaching anything.
          "other.OnServerInvoke = function(player)",
          "  return HttpService:PostAsync(CONFIG_URL, '{}')",
          "end",
        ].join("\n"),
      },
    ]);

    expect(report.findings).toEqual([]);
    expect(report.outcome).toBe("pass");
  });
});

describe("SECURITY-REVIEW-A2 finding identity and shape", () => {
  const report = reviewLuaSecurity(
    server(
      [
        "local remote = Instance.new('RemoteEvent')",
        "remote.OnServerEvent:Connect(function(player, amount)",
        "  player.leaderstats.Coins.Value += amount",
        "end)",
      ].join("\n"),
    ),
  );

  it("carries a stable code, a severity, a line and the matched source", () => {
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      code: "REMOTE_CLIENT_VALUE_AWARDED",
      severity: "critical",
      path: SERVER,
      line: 3,
    });
    expect(report.findings[0].evidence).toContain("Coins.Value +=");
    expect(report.findings[0].remediation).not.toHaveLength(0);
  });

  it("points at a line that really holds the matched source", () => {
    const source = [
      "local remote = Instance.new('RemoteEvent')",
      "remote.OnServerEvent:Connect(function(player, amount)",
      "  player.leaderstats.Coins.Value += amount",
      "end)",
    ];

    // Resolve the reported line against the source it claims to describe,
    // rather than asserting a number that happens to match.
    expect(source[report.findings[0].line! - 1]).toContain("Coins.Value +=");
  });

  it("keeps a line correct after a multi-line string shifts every offset", () => {
    const withLongString = reviewLuaSecurity(
      server(
        [
          "local banner = [[",
          "  a long string that mentions SetAsync and spans lines",
          "]]",
          "remote.OnServerEvent:Connect(function(player, amount)",
          "  player.leaderstats.Coins.Value += amount",
          "end)",
        ].join("\n"),
      ),
    );

    expect(withLongString.findings[0].line).toBe(5);
  });
});

describe("SECURITY-REVIEW-A2 deterministic output", () => {
  const scripts = [
    {
      path: "ServerScriptService/B.server.lua",
      content: [
        "remote.OnServerEvent:Connect(function(player, amount)",
        "  player.leaderstats.Coins.Value += amount",
        "end)",
      ].join("\n"),
    },
    {
      path: "ServerScriptService/A.server.lua",
      content: [
        "remote.OnServerEvent:Connect(function(player, hp)",
        "  player.Character.Humanoid.Health = hp",
        "end)",
      ].join("\n"),
    },
  ];

  it("orders findings by path, then line, then code", () => {
    const report = reviewLuaSecurity(scripts);

    // The fixture is deliberately supplied B-before-A, so an unsorted report
    // would emit B first and this exact sequence would not hold.
    expect(report.findings.map((f) => `${f.path}:${f.line}:${f.code}`)).toEqual(
      [
        "ServerScriptService/A.server.lua:2:REMOTE_CLIENT_DAMAGE",
        "ServerScriptService/B.server.lua:2:REMOTE_CLIENT_VALUE_AWARDED",
      ],
    );
  });

  it("does not depend on the order the scripts arrived in", () => {
    // The strongest form of the ordering claim: the report is a function of
    // the input set, not of how the caller happened to sequence it.
    expect(JSON.stringify(reviewLuaSecurity(scripts).findings)).toBe(
      JSON.stringify(reviewLuaSecurity([...scripts].reverse()).findings),
    );
  });

  it("produces byte-identical output for the same input", () => {
    expect(JSON.stringify(reviewLuaSecurity(scripts))).toBe(
      JSON.stringify(reviewLuaSecurity(scripts)),
    );
  });

  it("collapses one defect the scanner reaches twice", () => {
    // A nested handler puts the same statement inside two handler bodies, so
    // the scanner genuinely visits it twice. A reader must see one finding,
    // not one per path the scanner happened to take to it.
    const nested = [
      "remote.OnServerEvent:Connect(function(player, amount)",
      "  inner.OnServerEvent:Connect(function(other, amount)",
      "    other.leaderstats.Coins.Value += amount",
      "  end)",
      "end)",
    ].join("\n");
    const report = reviewLuaSecurity(server(nested));

    const awarded = report.findings.filter(
      (f) => f.code === "REMOTE_CLIENT_VALUE_AWARDED",
    );
    expect(awarded).toHaveLength(1);
    expect(awarded[0].line).toBe(3);
  });

  it("keeps distinct occurrences of the same rule apart", () => {
    // Deduplication must not collapse two real defects on different lines.
    const twice = [
      "remote.OnServerEvent:Connect(function(player, amount)",
      "  player.leaderstats.Coins.Value += amount",
      "end)",
      "other.OnServerEvent:Connect(function(player, amount)",
      "  player.leaderstats.Coins.Value += amount",
      "end)",
    ].join("\n");
    const report = reviewLuaSecurity(server(twice));

    expect(report.findings.map((f) => f.line)).toEqual([2, 5]);
  });
});

describe("SECURITY-REVIEW-A2 keeps the review advisory", () => {
  it("stays advisory whatever it finds", () => {
    const withFinding = reviewLuaSecurity(
      server(
        [
          "remote.OnServerEvent:Connect(function(player, amount)",
          "  player.leaderstats.Coins.Value += amount",
          "end)",
        ].join("\n"),
      ),
    );

    expect(withFinding.enforcement).toBe("advisory");
    expect(reviewLuaSecurity([]).enforcement).toBe("advisory");
    expect(withFinding.analysisMode).toBe("deterministic-pattern");
  });

  it("never throws, whatever it is handed", () => {
    expect(() => reviewLuaSecurity(undefined as never)).not.toThrow();
    expect(() =>
      reviewLuaSecurity([null as never, { path: SERVER } as never]),
    ).not.toThrow();
  });
});
