import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = "architecture.manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const reasons = new Map([
  [
    "domains→infrastructure",
    "RUNTIME-2D owns the exact domain-to-runtime edges recorded in architecture.layer-debt.json from AssemblyBuilder.ts, CompilerAPI.ts, CompilerContextManager.ts, CompilerOrchestrator.ts, GenerationPipeline.ts, CIControlPipeline.ts, AutonomousOrchestrator.ts, GenerationArtifactRecorder.ts, StudioRuntime.ts, ArtifactTransferManager.ts and ProjectSyncManager.ts; replace direct socket and pipeline imports with runtime ports.",
  ],
  [
    "shared→api",
    "DURABILITY-2E owns the exact shared-to-platform edges recorded in architecture.layer-debt.json from common/middleware/security.ts and services/ChatPersistenceService.ts; invert auth, security and storage dependencies behind shared ports.",
  ],
  [
    "infrastructure→api",
    "DURABILITY-2E owns the exact pipeline-to-platform edge recorded in architecture.layer-debt.json from pipeline/v2/ArtifactStore.ts importing platform/storage/StorageFactory; move the storage contract below the API layer.",
  ],
  [
    "domains→api",
    "STUDIO-2F owns the exact studio-to-platform edge recorded in architecture.layer-debt.json from studio/v2/StudioRuntime.ts importing platform/storage/StorageProvider; extract a neutral Studio storage port.",
  ],
]);

for (const edge of manifest.allowedLayerEdges ?? []) {
  const key = `${edge.from}→${edge.to}`;
  const reason = reasons.get(key);
  if (!reason) throw new Error(`Missing ARCH-206 reason for ${key}`);
  edge.reason = reason;
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
