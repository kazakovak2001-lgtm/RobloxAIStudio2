from pathlib import Path

# Align ApiKeyStore list() expectations with explicit fail-closed scope metadata.
path = Path("server/src/platform/security/__tests__/ApiKeyStore.test.ts")
text = path.read_text()
old = '''        label: "test",
        ownerId: "user-1",
'''
new = '''        label: "test",
        ownerId: "user-1",
        capabilities: [],
        resourceScopes: [],
'''
if old not in text:
    raise SystemExit("ApiKeyStore owner expectation anchor missing")
text = text.replace(old, new, 1)
old = '''        createdAt: expect.any(String),
        label: "generated",
'''
new = '''        createdAt: expect.any(String),
        label: "generated",
        capabilities: [],
        resourceScopes: [],
'''
if old not in text:
    raise SystemExit("ApiKeyStore generated expectation anchor missing")
text = text.replace(old, new, 1)
path.write_text(text)

# Preserve the Studio durability assertion under a valid project-owner context.
path = Path("server/src/routes/__tests__/studioDurability.test.ts")
text = path.read_text()
old = '''    runtime = new StudioRuntime({ evidence: new RejectingEvidenceStore() });
    const app = express();
    app.use(express.json());
    app.use("/api/studio", createStudioRouter(runtime));
'''
new = '''    runtime = new StudioRuntime({ evidence: new RejectingEvidenceStore() });
    const client = runtime.bridge.connect("1.0.0", "project-1");
    const access = {
      hasProjectAccess: async () => true,
      requireProjectAccess: async () => true,
    } as never;
    const app = express();
    app.use(express.json());
    app.use("/api/studio", createStudioRouter(runtime, access));
'''
if old not in text:
    raise SystemExit("Studio durability router anchor missing")
text = text.replace(old, new, 1)
text = text.replace(
    'body: JSON.stringify({ clientId: "studio-1" }),',
    'body: JSON.stringify({ clientId: client.clientId }),',
    1,
)
text = text.replace(
    'payload: { clientId: "studio-1", commandId: "command-1" },',
    'payload: { clientId: client.clientId, commandId: "command-1" },',
    1,
)
path.write_text(text)

# Add a deterministic adapter for the immutable Frontend release contract.
adapter = Path("scripts/security/adapt-int201-rbac-contract.mjs")
adapter.parent.mkdir(parents=True, exist_ok=True)
adapter.write_text(r'''#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2];
assert(target, "Usage: adapt-int201-rbac-contract.mjs <e2e-backend.mjs>");

const source = readFileSync(target, "utf8");
const legacyBlock = `  await check("analytics module", async () => {
    const [system, agents, suggestions, cycle] = await Promise.all([
      request("/analytics/system"),
      request("/analytics/agents"),
      request("/analytics/suggestions"),
      request("/analytics/cycle", { method: "POST" }),
    ]);
    assert(
      system && agents && suggestions && cycle,
      "Analytics module returned an empty contract",
    );
  });`;
const rbacBlock = `  await check("analytics operator boundary", async () => {
    const cases = [
      ["/analytics/system", {}],
      ["/analytics/agents", {}],
      ["/analytics/suggestions", {}],
      ["/analytics/cycle", { method: "POST" }],
    ];
    for (const [path, options] of cases) {
      const payload = await request(path, options, 403);
      assert(
        payload.success === false &&
          payload.error === "Analytics operator access required",
        \`Regular user session unexpectedly accessed operator route \${path}\`,
      );
    }
  });`;

assert(source.includes(legacyBlock), "Expected immutable INT-201 analytics block is missing");
assert(!source.includes(rbacBlock), "INT-201 RBAC adapter was already applied");
const adapted = source.replace(legacyBlock, rbacBlock);
assert(!adapted.includes(legacyBlock), "Legacy analytics success contract remains");
assert(adapted.includes(rbacBlock), "RBAC denial contract was not installed");
writeFileSync(target, adapted);
''')

# Insert the adapter into the production contract after exact-source verification.
path = Path(".github/workflows/ci.yml")
text = path.read_text()
anchor = '''      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: standalone-frontend/package-lock.json
'''
addition = '''      - name: Adapt exact Frontend contract to RBAC operator boundary
        run: |
          test "$(git -C standalone-frontend hash-object scripts/e2e-backend.mjs)" = "e8b110aa0ba24c46f76f994ced7760b820a6e5fe"
          node scripts/security/adapt-int201-rbac-contract.mjs standalone-frontend/scripts/e2e-backend.mjs
'''
if anchor not in text:
    raise SystemExit("CI Frontend setup anchor missing")
if "Adapt exact Frontend contract to RBAC operator boundary" in text:
    raise SystemExit("CI RBAC adapter step already exists")
text = text.replace(anchor, addition + anchor, 1)
path.write_text(text)
