from pathlib import Path

route = Path("server/src/routes/knowledge.ts")
text = route.read_text()
text = text.replace(
    'import type { ProjectAccessControl } from "./projects";\n',
    'import type { ProjectAccessControl } from "./projects";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n',
    1,
)
replacements = [
    (
        '  router.get("/patterns", (req, res) => {\n    const type = req.query.type as string | undefined;\n',
        '  router.get("/patterns", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.knowledge.patterns.read",\n        "knowledge-pattern-registry",\n      )\n    ) {\n      return;\n    }\n    const type = req.query.type as string | undefined;\n',
    ),
    (
        '  router.get("/prompts", (req, res) => {\n    const agent = req.query.agent as string | undefined;\n',
        '  router.get("/prompts", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.knowledge.prompts.read",\n        "knowledge-prompt-registry",\n      )\n    ) {\n      return;\n    }\n    const agent = req.query.agent as string | undefined;\n',
    ),
    (
        '  router.get("/search", (req, res) => {\n    const genre = req.query.genre as string | undefined;\n',
        '  router.get("/search", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.knowledge.search",\n        "knowledge-runtime",\n      )\n    ) {\n      return;\n    }\n    const genre = req.query.genre as string | undefined;\n',
    ),
    (
        '  router.get("/recommend", (req, res) => {\n    const genre = (req.query.genre as string) ?? "adventure";\n',
        '  router.get("/recommend", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.knowledge.recommendations.read",\n        "knowledge-runtime",\n      )\n    ) {\n      return;\n    }\n    const genre = (req.query.genre as string) ?? "adventure";\n',
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"knowledge anchor missing: {old.splitlines()[0]}")
    text = text.replace(old, new, 1)
route.write_text(text)
