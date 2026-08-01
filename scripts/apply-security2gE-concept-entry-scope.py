from pathlib import Path

route = Path("server/src/routes/concept.ts")
text = route.read_text()

text = text.replace(
    '  const concepts = new Map<string, Record<string, unknown>>();',
    '  const concepts = new Map<string, Record<string, unknown>>();\n  const conceptOwners = new Map<string, string>();',
    1,
)

text = text.replace(
    '  router.post("/generate", (req, res) => {',
    '  router.post("/generate", async (req, res) => {',
    1,
)
generate_anchor = '''    const {\n      gameDescription,\n      genre,\n      style,\n      targetAudience,\n      additionalRequirements,\n    } = req.body;\n'''
generate_replacement = generate_anchor + '''    const userId = await access.requireAuthenticatedUser(req, res);\n    if (!userId) return;\n'''
if generate_anchor not in text:
    raise SystemExit("concept generate anchor missing")
text = text.replace(generate_anchor, generate_replacement, 1)
text = text.replace(
    '    concepts.set(conceptId, concept);',
    '    concepts.set(conceptId, concept);\n    conceptOwners.set(conceptId, userId);',
    1,
)

text = text.replace(
    '  router.get("/:id", (req, res) => {',
    '  router.get("/:id", async (req, res) => {',
    1,
)
read_anchor = '''  router.get("/:id", async (req, res) => {\n    const concept = concepts.get(req.params.id);\n    if (!concept) {\n      res.status(404).json({ success: false, error: "Concept not found" });\n      return;\n    }\n    res.json({ success: true, data: concept });\n  });\n'''
read_replacement = '''  router.get("/:id", async (req, res) => {\n    const conceptId = req.params.id;\n    const concept = concepts.get(conceptId);\n    const ownerId = conceptOwners.get(conceptId);\n    if (!concept || !ownerId) {\n      res.status(404).json({ success: false, error: "Concept not found" });\n      return;\n    }\n    const userId = await access.requireAuthenticatedUser(req, res);\n    if (!userId) return;\n    if (userId !== ownerId) {\n      res.status(404).json({ success: false, error: "Concept not found" });\n      return;\n    }\n    res.json({ success: true, data: concept });\n  });\n'''
if read_anchor not in text:
    raise SystemExit("concept read anchor missing")
text = text.replace(read_anchor, read_replacement, 1)

experience_anchor = '''  router.post("/experience/generate", async (req, res) => {\n    const { conceptId } = req.body;\n    const concept = concepts.get(conceptId);\n\n    if (!concept) {\n      res.status(404).json({\n        success: false,\n        error: "Concept not found. Generate a concept first.",\n      });\n      return;\n    }\n\n    try {\n'''
experience_replacement = '''  router.post("/experience/generate", async (req, res) => {\n    const { conceptId } = req.body;\n    const concept = concepts.get(conceptId);\n    const ownerId = conceptOwners.get(conceptId);\n\n    if (!concept || !ownerId) {\n      res.status(404).json({\n        success: false,\n        error: "Concept not found",\n      });\n      return;\n    }\n    const userId = await access.requireAuthenticatedUser(req, res);\n    if (!userId) return;\n    if (userId !== ownerId) {\n      res.status(404).json({ success: false, error: "Concept not found" });\n      return;\n    }\n\n    try {\n'''
if experience_anchor not in text:
    raise SystemExit("concept experience anchor missing")
text = text.replace(experience_anchor, experience_replacement, 1)

direct_anchor = '''    if (!projectId || typeof projectId !== "string") {\n      res.status(400).json({ success: false, error: "projectId is required" });\n      return;\n    }\n\n    try {\n'''
direct_replacement = '''    if (!projectId || typeof projectId !== "string") {\n      res.status(400).json({ success: false, error: "projectId is required" });\n      return;\n    }\n    if (!(await access.requireProjectAccess(req, res, projectId))) return;\n\n    try {\n'''
if direct_anchor not in text:
    raise SystemExit("concept direct generation anchor missing")
text = text.replace(direct_anchor, direct_replacement, 1)
route.write_text(text)

generator = Path("scripts/generate-authorization-matrix.ts")
matrix = generator.read_text()
if "const conceptEntryScopeEvidence =" not in matrix:
    anchor = '''const platformRemainingScopeEvidence =\n  "server/src/__tests__/security2gE.platform-remaining-scope.test.ts";\n'''
    addition = '''const conceptEntryScopeEvidence =\n  "server/src/__tests__/security2gE.concept-entry-scope.test.ts";\n'''
    if anchor not in matrix:
        raise SystemExit("concept entry evidence anchor missing")
    matrix = matrix.replace(anchor, anchor + addition, 1)

if "user.concept.create" not in matrix:
    block = '''  ...[\n    ["POST /generate", "user.concept.create"],\n    ["GET /:id", "user.concept.read"],\n    ["POST /experience/generate", "user.concept.pipeline.generate"],\n  ].map(([operation, capability]) => [\n    `rest|server/src/routes/concept.ts|${operation}`,\n    classified(\n      "user-self",\n      "user-session",\n      capability,\n      "session-owned-concept",\n      conceptEntryScopeEvidence,\n      conceptEntryScopeEvidence,\n    ),\n  ] as const),\n  [\n    "rest|server/src/routes/concept.ts|POST /experience/generate-direct",\n    classified(\n      "project-owner",\n      "user-session",\n      "project.concept.pipeline.generate-direct",\n      "body-project",\n      conceptEntryScopeEvidence,\n      conceptEntryScopeEvidence,\n    ),\n  ],\n'''
    anchor = "]);\n\nconst current = JSON.parse("
    if anchor not in matrix:
        raise SystemExit("concept entry classification anchor missing")
    matrix = matrix.replace(anchor, block + anchor, 1)

generator.write_text(matrix)
