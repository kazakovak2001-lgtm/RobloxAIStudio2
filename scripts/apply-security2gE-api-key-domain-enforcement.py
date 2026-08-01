from pathlib import Path

route = Path("server/src/routes/domain.ts")
text = route.read_text()
text = text.replace(
'''import type { GameGenre } from "../domain";\n''',
'''import type { GameGenre } from "../domain";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n''',
1,
)
replacements = [
(
'''  router.get("/genres", (_req, res) => {\n    res.json({ success: true, data: engine.genres.getAll() });\n''',
'''  router.get("/genres", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.domain.genres.list",\n        "domain-taxonomy",\n      )\n    ) {\n      return;\n    }\n    res.json({ success: true, data: engine.genres.getAll() });\n'''
),
(
'''  router.get("/genres/:genre", (req, res) => {\n    const blueprint = engine.genres.get(req.params.genre as GameGenre);\n''',
'''  router.get("/genres/:genre", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.domain.genre.read",\n        "domain-taxonomy",\n      )\n    ) {\n      return;\n    }\n    const blueprint = engine.genres.get(req.params.genre as GameGenre);\n'''
),
(
'''  router.get("/patterns", (req, res) => {\n    const category = req.query.category as string | undefined;\n''',
'''  router.get("/patterns", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.domain.patterns.read",\n        "domain-knowledge",\n      )\n    ) {\n      return;\n    }\n    const category = req.query.category as string | undefined;\n'''
),
(
'''  router.get("/recommendations", (req, res) => {\n    const genre = (req.query.genre as GameGenre) ?? "adventure";\n''',
'''  router.get("/recommendations", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.domain.recommendations.read",\n        "domain-knowledge",\n      )\n    ) {\n      return;\n    }\n    const genre = (req.query.genre as GameGenre) ?? "adventure";\n'''
),
(
'''  router.post("/analyze", (req, res) => {\n    const input = req.body;\n''',
'''  router.post("/analyze", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.domain.analysis.execute",\n        "request-domain-input",\n      )\n    ) {\n      return;\n    }\n    const input = req.body;\n'''
),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"domain anchor missing: {old.splitlines()[0]}")
    text = text.replace(old, new, 1)
route.write_text(text)
