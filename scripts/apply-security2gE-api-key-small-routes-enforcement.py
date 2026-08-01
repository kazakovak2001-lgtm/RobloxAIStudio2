from pathlib import Path

routes = {
    "server/src/routes/economy.ts": [
        (
            'import type { ProjectAccessControl } from "./projects";\n',
            'import type { ProjectAccessControl } from "./projects";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n',
        ),
        (
            '  router.post("/balance", (req, res) => {\n    try {\n',
            '  router.post("/balance", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.economy.balance.execute",\n        "request-economy-report",\n      )\n    ) {\n      return;\n    }\n    try {\n',
        ),
        (
            '  router.get("/report/:gameId", (_req, res) => {\n    res.json({\n',
            '  router.get("/report/:gameId", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.economy.report.metadata.read",\n        "placeholder-metadata",\n      )\n    ) {\n      return;\n    }\n    res.json({\n',
        ),
    ],
    "server/src/routes/simulation.ts": [
        (
            'import type { ProjectAccessControl } from "./projects";\n',
            'import type { ProjectAccessControl } from "./projects";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n',
        ),
        (
            '  router.post("/feedback", (req, res) => {\n    const { report, metrics } = req.body;\n',
            '  router.post("/feedback", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.simulation.feedback.analyze",\n        "request-simulation-report",\n      )\n    ) {\n      return;\n    }\n    const { report, metrics } = req.body;\n',
        ),
    ],
    "server/src/routes/generation-v2.ts": [
        (
            'import type { ProjectAccessControl } from "./projects";\n',
            'import type { ProjectAccessControl } from "./projects";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n',
        ),
        (
            '  router.post("/blueprint", (req, res) => {\n    try {\n',
            '  router.post("/blueprint", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.generation.v2.blueprint.generate",\n        "request-generation-outputs",\n      )\n    ) {\n      return;\n    }\n    try {\n',
        ),
    ],
}

for path, replacements in routes.items():
    file = Path(path)
    text = file.read_text()
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f"anchor missing in {path}: {old.splitlines()[0]}")
        text = text.replace(old, new, 1)
    file.write_text(text)
