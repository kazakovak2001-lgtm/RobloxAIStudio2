/**
 * AI Governance Layer
 *
 * Defines behavior rules for AI-assisted development:
 * - Automatic commit splitting
 * - Subsystem detection
 * - Architecture-aware grouping
 * - Traceability optimization
 * - Prevention of mixed feature commits
 */

export interface Subsystem {
  name: string;
  path: string;
  description: string;
}

export interface ChangeGroup {
  subsystem: Subsystem;
  files: string[];
  commitType: CommitType;
  scope: string;
  description: string;
  confidence: number;
}

export interface SplitDecision {
  groups: ChangeGroup[];
  reasoning: string;
  requiresManualReview: boolean;
}

export type CommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "perf"
  | "docs"
  | "test"
  | "build"
  | "ci"
  | "chore";

const SUBSYSTEM_MAP: Subsystem[] = [
  {
    name: "core-engine",
    path: "server/src/core",
    description: "Runtime, configuration, lifecycle",
  },
  {
    name: "ai-agents",
    path: "agents",
    description: "Agent definitions, orchestration",
  },
  {
    name: "generation-pipeline",
    path: "server/src/execution",
    description: "Pipeline stages, transforms",
  },
  {
    name: "blueprint-system",
    path: "server/src/blueprints",
    description: "Templates, schemas",
  },
  {
    name: "validation-layer",
    path: "server/src/validation",
    description: "Validation, enforcement",
  },
  {
    name: "manifest-system",
    path: "server/src/manifest",
    description: "Package manifests",
  },
  {
    name: "ci-cd-pipeline",
    path: ".github/workflows",
    description: "CI/CD automation",
  },
  {
    name: "governance-layer",
    path: "server/src/governance",
    description: "Policy enforcement",
  },
  { name: "documentation-system", path: "docs", description: "Documentation" },
  { name: "test-suite", path: "tests", description: "Test files" },
  { name: "tooling", path: ".vscode", description: "VS Code tooling" },
];

/**
 * Detect which subsystem a file belongs to based on its path.
 */
export function detectSubsystem(filePath: string): Subsystem | null {
  const normalized = filePath.replace(/\\/g, "/");

  for (const subsystem of SUBSYSTEM_MAP) {
    if (
      normalized.startsWith(subsystem.path + "/") ||
      normalized === subsystem.path
    ) {
      return subsystem;
    }
  }

  return null;
}

/**
 * Group changed files by their subsystem for atomic commit splitting.
 */
export function groupBySubsystem(filePaths: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const filePath of filePaths) {
    const subsystem = detectSubsystem(filePath);
    const key = subsystem?.name ?? "root";

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(filePath);
  }

  return groups;
}

/**
 * Determine if a set of changes should be split into multiple commits.
 */
export function shouldSplitChanges(filePaths: string[]): SplitDecision {
  const groups = groupBySubsystem(filePaths);
  const changeGroups: ChangeGroup[] = [];

  for (const [subsystemName, files] of groups) {
    const subsystem = SUBSYSTEM_MAP.find((s) => s.name === subsystemName) ?? {
      name: "root",
      path: ".",
      description: "Repository root",
    };

    const commitType = inferCommitType(files);
    const confidence = computeConfidence(files, subsystemName);

    changeGroups.push({
      subsystem,
      files,
      commitType,
      scope: subsystemName,
      description: `${commitType}(${subsystemName}): changes to ${files.length} file(s)`,
      confidence,
    });
  }

  const requiresManualReview = changeGroups.some((g) => g.confidence < 0.7);
  const shouldSplit = changeGroups.length > 1;

  return {
    groups: changeGroups,
    reasoning: shouldSplit
      ? `Changes span ${changeGroups.length} subsystems and should be split into separate commits`
      : "All changes belong to a single subsystem",
    requiresManualReview,
  };
}

/**
 * Infer the commit type from file paths.
 */
function inferCommitType(files: string[]): CommitType {
  const hasTestFiles = files.some(
    (f) => f.includes("test") || f.includes("spec"),
  );
  const hasDocFiles = files.some(
    (f) => f.endsWith(".md") || f.includes("docs/"),
  );
  const hasCiFiles = files.some((f) => f.includes(".github/workflows"));
  const hasBuildFiles = files.some(
    (f) =>
      f.includes("package.json") ||
      f.includes("tsconfig") ||
      f.includes("vite.config"),
  );

  if (
    hasTestFiles &&
    files.every((f) => f.includes("test") || f.includes("spec"))
  ) {
    return "test";
  }
  if (
    hasDocFiles &&
    files.every((f) => f.endsWith(".md") || f.includes("docs/"))
  ) {
    return "docs";
  }
  if (hasCiFiles && files.every((f) => f.includes(".github/"))) {
    return "ci";
  }
  if (hasBuildFiles && files.length === 1) {
    return "build";
  }

  return "feat";
}

/**
 * Compute confidence score for a change group classification.
 */
function computeConfidence(files: string[], subsystem: string): number {
  if (files.length === 0) return 0;

  let score = 0.5;

  // All files in the same subsystem directory
  const allSameDir = files.every((f) => {
    const detected = detectSubsystem(f);
    return detected?.name === subsystem;
  });
  if (allSameDir) score += 0.3;

  // Small number of files increases confidence
  if (files.length <= 5) score += 0.1;

  // Files with similar extensions
  const extensions = new Set(files.map((f) => f.split(".").pop()));
  if (extensions.size <= 2) score += 0.1;

  return Math.min(1.0, score);
}

/**
 * Validate that a proposed commit does not mix unrelated subsystem concerns.
 */
export function validateCommitCohesion(filePaths: string[]): {
  cohesive: boolean;
  subsystems: string[];
  recommendation: string;
} {
  const groups = groupBySubsystem(filePaths);
  const subsystems = Array.from(groups.keys());

  if (subsystems.length <= 1) {
    return {
      cohesive: true,
      subsystems,
      recommendation: "Commit is cohesive — single subsystem affected",
    };
  }

  return {
    cohesive: false,
    subsystems,
    recommendation: `Split into ${subsystems.length} commits: ${subsystems.join(", ")}`,
  };
}
