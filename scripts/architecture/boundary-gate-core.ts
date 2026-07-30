export interface LayerDefinition {
  modules?: string[];
  canImportFrom?: string[];
}

export interface AllowedLayerEdge {
  from: string;
  to: string;
  reason: string;
}

export interface ArchitectureManifest {
  domains: Record<string, { path: string; layer: string }>;
  layers: Record<string, LayerDefinition>;
  allowedCycles?: string[][];
  allowedLayerEdges?: AllowedLayerEdge[];
  excludedTopLevelEntries?: Array<{ name: string; reason: string }>;
}

export interface ImportEdge {
  from: string;
  to: string;
  file: string;
  importPath: string;
}

export interface LayerViolation extends ImportEdge {
  sourceLayer: string;
  targetLayer: string;
  sourceDomain: string;
  targetDomain: string;
}

export interface BoundaryGateInput {
  manifestErrors: string[];
  criticalViolationCount: number;
  cycles: string[][];
  unresolvedInternalImportCount: number;
  layerViolations: LayerViolation[];
  allowedCycles?: string[][];
  allowedLayerEdges?: AllowedLayerEdge[];
}

export interface BoundaryGateDecision {
  status: "PASS" | "FAIL";
  exitCode: 0 | 1;
  acknowledgedCycles: string[][];
  unexpectedCycles: string[][];
  acknowledgedLayerViolations: LayerViolation[];
  unexpectedLayerViolations: LayerViolation[];
  reasons: string[];
}

function normalizeRepositoryPath(value: string): string {
  const segments: string[] = [];

  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments.at(-1) !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  return segments.join("/");
}

export function canonicalCycle(cycle: readonly string[]): string {
  const closesCycle = cycle.length > 1 && cycle[0] === cycle.at(-1);
  const clean = closesCycle ? cycle.slice(0, -1) : [...cycle];
  if (clean.length === 0) return "";

  return clean
    .map((_, index) => [...clean.slice(index), ...clean.slice(0, index)])
    .map((entry) => entry.join("→"))
    .sort()[0];
}

export function layerEdgeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

export function validateManifestModel(
  manifest: ArchitectureManifest,
  realSubsystems: readonly string[],
): string[] {
  const errors: string[] = [];
  const modeledByTopLevel = new Map<string, string>();
  const real = new Set(realSubsystems);

  for (const [domain, definition] of Object.entries(manifest.domains)) {
    const normalizedPath = normalizeRepositoryPath(definition.path);
    const prefix = "server/src/";
    if (!normalizedPath.startsWith(prefix)) {
      errors.push(
        `Domain '${domain}' is outside server/src: '${definition.path}'.`,
      );
      continue;
    }

    const topLevel = normalizedPath.slice(prefix.length).split("/")[0];
    if (!topLevel) {
      errors.push(
        `Domain '${domain}' has an invalid path '${definition.path}'.`,
      );
      continue;
    }

    const previous = modeledByTopLevel.get(topLevel);
    if (previous) {
      errors.push(
        `Subsystem '${topLevel}' is modeled by both '${previous}' and '${domain}'.`,
      );
    } else {
      modeledByTopLevel.set(topLevel, domain);
    }

    const layer = manifest.layers[definition.layer];
    if (!layer) {
      errors.push(
        `Domain '${domain}' references unknown layer '${definition.layer}'.`,
      );
    } else if (layer.modules && !layer.modules.includes(domain)) {
      errors.push(
        `Layer '${definition.layer}' does not list domain '${domain}'.`,
      );
    }
  }

  for (const subsystem of real) {
    if (!modeledByTopLevel.has(subsystem)) {
      errors.push(`Unmodeled server/src subsystem: '${subsystem}'.`);
    }
  }

  for (const subsystem of modeledByTopLevel.keys()) {
    if (!real.has(subsystem)) {
      errors.push(`Manifest models non-subsystem path: '${subsystem}'.`);
    }
  }

  for (const [layerName, layer] of Object.entries(manifest.layers)) {
    for (const domain of layer.modules ?? []) {
      const definition = manifest.domains[domain];
      if (!definition) {
        errors.push(`Layer '${layerName}' lists unknown domain '${domain}'.`);
      } else if (definition.layer !== layerName) {
        errors.push(
          `Layer '${layerName}' lists '${domain}', but the domain declares '${definition.layer}'.`,
        );
      }
    }

    for (const importedLayer of layer.canImportFrom ?? []) {
      if (!manifest.layers[importedLayer]) {
        errors.push(
          `Layer '${layerName}' can import from unknown layer '${importedLayer}'.`,
        );
      }
    }
  }

  const seenExceptions = new Set<string>();
  for (const exception of manifest.allowedLayerEdges ?? []) {
    const key = layerEdgeKey(exception.from, exception.to);
    if (seenExceptions.has(key)) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' is duplicated.`,
      );
    }
    seenExceptions.add(key);

    const source = manifest.layers[exception.from];
    const target = manifest.layers[exception.to];
    if (!source || !target) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' references an unknown layer.`,
      );
    } else if ((source.canImportFrom ?? []).includes(exception.to)) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' is stale because the edge is already permitted.`,
      );
    }

    if (typeof exception.reason !== "string" || !exception.reason.trim()) {
      errors.push(
        `Allowed layer edge '${exception.from} → ${exception.to}' requires a reason.`,
      );
    }
  }

  return errors;
}

export function collectLayerViolations(
  manifest: ArchitectureManifest,
  edges: readonly ImportEdge[],
): LayerViolation[] {
  const violations: LayerViolation[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const sourceLayer = manifest.domains[edge.from]?.layer;
    const targetLayer = manifest.domains[edge.to]?.layer;
    if (!sourceLayer || !targetLayer) continue;
    if (sourceLayer === targetLayer) continue;

    const allowedLayers = manifest.layers[sourceLayer]?.canImportFrom ?? [];
    if (allowedLayers.includes(targetLayer)) continue;

    const key = [edge.file, edge.importPath, edge.from, edge.to].join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    violations.push({
      ...edge,
      sourceLayer,
      targetLayer,
      sourceDomain: edge.from,
      targetDomain: edge.to,
    });
  }

  return violations;
}

export function evaluateBoundaryGate(
  input: BoundaryGateInput,
): BoundaryGateDecision {
  const allowedCycles = new Set(
    (input.allowedCycles ?? []).map((cycle) => canonicalCycle(cycle)),
  );
  const acknowledgedCycles = input.cycles.filter((cycle) =>
    allowedCycles.has(canonicalCycle(cycle)),
  );
  const unexpectedCycles = input.cycles.filter(
    (cycle) => !allowedCycles.has(canonicalCycle(cycle)),
  );

  const allowedLayerEdges = new Set(
    (input.allowedLayerEdges ?? []).map((edge) =>
      layerEdgeKey(edge.from, edge.to),
    ),
  );
  const acknowledgedLayerViolations = input.layerViolations.filter(
    (violation) =>
      allowedLayerEdges.has(
        layerEdgeKey(violation.sourceLayer, violation.targetLayer),
      ),
  );
  const unexpectedLayerViolations = input.layerViolations.filter(
    (violation) =>
      !allowedLayerEdges.has(
        layerEdgeKey(violation.sourceLayer, violation.targetLayer),
      ),
  );

  const reasons: string[] = [];
  if (input.manifestErrors.length > 0) reasons.push("manifest");
  if (input.criticalViolationCount > 0) reasons.push("critical-boundary");
  if (unexpectedCycles.length > 0) reasons.push("cycle");
  if (input.unresolvedInternalImportCount > 0) {
    reasons.push("unresolved-import");
  }
  if (unexpectedLayerViolations.length > 0) reasons.push("layer-edge");

  const failed = reasons.length > 0;
  return {
    status: failed ? "FAIL" : "PASS",
    exitCode: failed ? 1 : 0,
    acknowledgedCycles,
    unexpectedCycles,
    acknowledgedLayerViolations,
    unexpectedLayerViolations,
    reasons,
  };
}
