from pathlib import Path

security = Path("server/src/common/middleware/security.ts")
text = security.read_text()
text = text.replace('''  "/api/system/status",\n  "/api/system/agents",\n''', '', 1)
security.write_text(text)

route = Path("server/src/routes/system.ts")
text = route.read_text()
text = text.replace(
'''import { createDefaultPromptEngine } from "../ai/prompts";\n''',
'''import { createDefaultPromptEngine } from "../ai/prompts";\nimport { requireApiKeyCapability } from "../common/middleware/security";\n''',
1,
)
text = text.replace(
'''  router.get("/status", (_req, res) => {\n    const registry = getGovernanceAgentRegistry();\n''',
'''  router.get("/status", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.platform.status.read",\n        "platform-runtime-metadata",\n      )\n    ) {\n      return;\n    }\n    const registry = getGovernanceAgentRegistry();\n''',
1,
)
text = text.replace(
'''  router.get("/agents", (_req, res) => {\n    const registry = getGovernanceAgentRegistry();\n''',
'''  router.get("/agents", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.platform.agents.list",\n        "governance-agent-registry",\n      )\n    ) {\n      return;\n    }\n    const registry = getGovernanceAgentRegistry();\n''',
1,
)
text = text.replace(
'''  router.get("/agents/:id", (req, res) => {\n    const registry = getGovernanceAgentRegistry();\n''',
'''  router.get("/agents/:id", (req, res) => {\n    if (\n      !requireApiKeyCapability(\n        req,\n        res,\n        "system.platform.agent.read",\n        "governance-agent-registry",\n      )\n    ) {\n      return;\n    }\n    const registry = getGovernanceAgentRegistry();\n''',
1,
)
route.write_text(text)
