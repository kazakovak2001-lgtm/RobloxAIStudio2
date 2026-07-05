# ADR-0008: Project Assembly & Roblox Workspace Builder

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

After the Generation Pipeline (v0.9) produces a validated `GameBlueprint`, the system needs to transform it into a structure that mirrors a real Roblox experience. This "assembly" step maps abstract game design sections (gameplay, architecture, scripts, UI, world) into concrete Roblox service placements (ServerScriptService, StarterGui, ReplicatedStorage, Workspace, etc.) without generating actual Roblox files yet.

## Decision

Implement a Project Assembly layer (`server/src/assembly/`) that:

1. **FolderMapper** — Declarative rules map blueprint sections to Roblox services and folder paths. No hardcoded paths; rules are configurable.
2. **ScriptAssembler** — Assigns each script a `ScriptType` (Script/LocalScript/ModuleScript), target service, and full path. Only logical placement — no Lua optimization.
3. **WorkspaceBuilder** — Creates workspace entries (folders, spawn locations, terrain placeholders, NPC stubs, tags, collections), asset placeholders, networking remotes, and configuration values.
4. **AssemblyValidator** — Validates structural integrity (no duplicate services, valid references, folder consistency, network integrity). Scores 0–100.
5. **AssemblyBuilder** — Orchestrates the full flow: map → assemble → build → validate → manifest → store. Emits assembly events via SSE/Socket.io.
6. **AssemblyRegistry** — In-memory store for completed assemblies and manifests.

**Assembly flow:**

```
GameBlueprint (from GenerationPipeline)
  → FolderMapper.mapFolders()      → AssemblyFolder[]
  → ScriptAssembler.assemble()     → scripts[] + modules[] + ui[]
  → WorkspaceBuilder.build()       → world[] + assets[] + network[] + config[]
  → AssemblyValidator.validate()   → score, issues
  → AssemblyManifest generated
  → ProjectAssembly stored
  → assembly.completed event emitted
```

**Roblox services modeled:** 17 core services including Workspace, ServerScriptService, ReplicatedStorage, StarterGui, StarterPlayer, ServerStorage, Lighting, SoundService, etc.

## Consequences

**Positive:**

- Blueprint-to-Roblox mapping is fully internal and testable without Roblox Studio
- Configurable folder mapping rules allow customization per game type
- Asset placeholders enable future asset generation without blocking assembly
- Network layout prepared for multiplayer without implementation
- Validation catches structural issues before any export attempt

**Negative:**

- No actual file generation (deferred to export milestone)
- Assembly is derived from blueprint — changes to blueprint require reassembly

## Future Export Strategy

The `ProjectAssembly` model is designed to be consumed by:

1. **Rojo project generation** — map AssemblyScript paths to Rojo JSON
2. **rbxl/rbxmx export** — serialize workspace entries to Roblox XML
3. **Studio plugin** — push assembly to Roblox Studio via Open Cloud API

Each export target reads the same `ProjectAssembly` — the assembly is the universal intermediate representation.

## Alternatives Considered

| Alternative                                   | Reason Not Chosen                                                     |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Direct .rbxl generation                       | Requires Roblox SDK / binary format knowledge; out of scope for v0.x  |
| Rojo integration now                          | External tooling dependency; assembly model must stabilize first      |
| Skip assembly, export directly from blueprint | Blueprint is abstract design; Roblox needs concrete service placement |
