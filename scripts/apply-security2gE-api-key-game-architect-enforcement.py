from pathlib import Path

route = Path("server/src/routes/gameArchitect.ts")
text = route.read_text()
text = text.replace(
    'import type { GameIdeaInput } from "../ai/gameArchitect";\n',
    'import type { GameIdeaInput } from "../ai/gameArchitect";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n',
    1,
)
replacements = [
    (
        '  router.post("/analyze", (req, res) => {\n    const input = req.body as GameIdeaInput;\n',
        '  router.post("/analyze", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.game-architect.analysis.execute",\n        "request-game-idea",\n      )\n    ) {\n      return;\n    }\n    const input = req.body as GameIdeaInput;\n',
    ),
    (
        '  router.post("/generate-design", (req, res) => {\n    const input = req.body as GameIdeaInput;\n',
        '  router.post("/generate-design", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.game-architect.design.generate",\n        "request-game-idea",\n      )\n    ) {\n      return;\n    }\n    const input = req.body as GameIdeaInput;\n',
    ),
    (
        '  router.post("/generate-prompts", (req, res) => {\n    const input = req.body as GameIdeaInput;\n',
        '  router.post("/generate-prompts", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.game-architect.prompts.generate",\n        "request-game-idea",\n      )\n    ) {\n      return;\n    }\n    const input = req.body as GameIdeaInput;\n',
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"game architect anchor missing: {old.splitlines()[0]}")
    text = text.replace(old, new, 1)
route.write_text(text)
