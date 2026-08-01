from pathlib import Path

platform = Path("server/src/routes/platform.ts")
text = platform.read_text()
text = text.replace(
    'import { loginRateLimiter } from "../common/middleware/security";\n',
    'import {\n  loginRateLimiter,\n  requireApiKeyCapability,\n} from "../common/middleware/security";\n',
    1,
)
replacements = [
    (
        '  router.get("/registry/agents", (_req, res) => {\n    res.json({ success: true, data: registry.getActive() });\n',
        '  router.get("/registry/agents", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.platform.registry.agents.list",\n        "platform-agent-registry",\n      )\n    ) {\n      return;\n    }\n    res.json({ success: true, data: registry.getActive() });\n',
    ),
    (
        '  router.get("/registry/agents/:id", (req, res) => {\n    const agent = registry.get(req.params.id);\n',
        '  router.get("/registry/agents/:id", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.platform.registry.agent.read",\n        "platform-agent-registry",\n      )\n    ) {\n      return;\n    }\n    const agent = registry.get(req.params.id);\n',
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"platform anchor missing: {old.splitlines()[0]}")
    text = text.replace(old, new, 1)
platform.write_text(text)

world = Path("server/src/routes/world.ts")
text = world.read_text()
text = text.replace(
    'import type { ProjectAccessControl } from "./projects";\n',
    'import type { ProjectAccessControl } from "./projects";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n',
    1,
)
replacements = [
    (
        '  router.post("/tick", (_req, res) => {\n    try {\n',
        '  router.post("/tick", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.world.tick.metadata.read",\n        "placeholder-metadata",\n      )\n    ) {\n      return;\n    }\n    try {\n',
    ),
    (
        '  router.get("/state/:gameId", (_req, res) => {\n    res.json({\n',
        '  router.get("/state/:gameId", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.world.state.metadata.read",\n        "placeholder-metadata",\n      )\n    ) {\n      return;\n    }\n    res.json({\n',
    ),
    (
        '  router.get("/emergence/:gameId", (_req, res) => {\n    res.json({\n',
        '  router.get("/emergence/:gameId", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.world.emergence.metadata.read",\n        "placeholder-metadata",\n      )\n    ) {\n      return;\n    }\n    res.json({\n',
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"world anchor missing: {old.splitlines()[0]}")
    text = text.replace(old, new, 1)
world.write_text(text)
