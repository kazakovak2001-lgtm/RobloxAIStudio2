import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeReviewControllerAgent } from "../../../agents/implementations/CodeReviewControllerAgent";
import { GenerationSandbox } from "../../ai/GenerationSandbox";
import { CodebaseKnowledge } from "../../../knowledge/CodebaseKnowledge";
import { ARCHITECTURE, resolveBoundary } from "../ArchitecturePolicy";
import { BoundaryValidator } from "../BoundaryValidator";
import { RuntimeBoundaryGuard } from "../RuntimeBoundaryGuard";

const temporaryRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "cleanup-1d-"));
  temporaryRoots.push(root);
  return root;
}

function createFile(root: string, path: string, content = ""): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CLEANUP-1D post-removal architecture", () => {
  it("recognizes only backend and Studio plugin source zones", () => {
    expect(resolveBoundary("server/src/index.ts")).toBe("backend");
    expect(resolveBoundary("studio-plugin/src/Main.lua")).toBe("studio-plugin");
    expect(resolveBoundary("src/App.tsx")).toBe("unknown");
    expect(resolveBoundary("shared/contracts.ts")).toBe("unknown");
    expect(resolveBoundary("server/src/../../src/App.tsx")).toBe("unknown");
  });

  it("rejects the removed root while allowing canonical source paths", () => {
    const validator = new BoundaryValidator();

    expect(validator.isPathAllowed("server/src/index.ts")).toEqual({
      allowed: true,
    });
    expect(validator.isPathAllowed("studio-plugin/src/Main.lua")).toEqual({
      allowed: true,
    });
    expect(validator.isPathAllowed("src/reintroduced.ts")).toEqual({
      allowed: false,
      reason:
        'File "src/reintroduced.ts" is outside all defined boundary zones',
    });
  });

  it("limits generated source to backend and Studio plugin targets", () => {
    const sandbox = new GenerationSandbox();

    expect(sandbox.getValidPrefix("backend")).toBe("server/src/");
    expect(sandbox.getValidPrefix("studio-plugin")).toBe("studio-plugin/src/");
    expect(sandbox.isValidTarget("backend", "src/generated.ts")).toBe(false);
    expect(
      sandbox.isValidTarget("backend", "server/src/../../src/generated.ts"),
    ).toBe(false);
    expect(
      sandbox.isValidTarget(
        "studio-plugin",
        "studio-plugin/src/services/NewService.lua",
      ),
    ).toBe(true);
  });

  it("detects side-effect imports of the retired frontend alias", async () => {
    const result = await new CodeReviewControllerAgent().execute({
      code: 'import "@/retired-side-effect";\n',
      filePath: "server/src/example.ts",
    });

    expect(result.success).toBe(true);
    const review = result.data?.review as {
      staticFindings: Array<{ rule: string; passed: boolean }>;
    };
    expect(review.staticFindings).toContainEqual(
      expect.objectContaining({ rule: "R1", passed: false }),
    );
  });

  it("fails the runtime guard when root src is reintroduced", () => {
    const root = createRoot();
    mkdirSync(join(root, ARCHITECTURE.backendRoot), { recursive: true });
    mkdirSync(join(root, ARCHITECTURE.studioPluginRoot), { recursive: true });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(new RuntimeBoundaryGuard(root).validate().status).toBe("STABLE");

    mkdirSync(join(root, ARCHITECTURE.removedFrontendRoot), {
      recursive: true,
    });
    const result = new RuntimeBoundaryGuard(root).validate();

    expect(result.status).toBe("CRITICAL");
    expect(result.checks).toContainEqual({
      name: "No forbidden root: src",
      passed: false,
      message: "CRITICAL: Forbidden source root detected: src",
    });
  });

  it("indexes backend TypeScript and Studio Luau but ignores root src", () => {
    const root = createRoot();
    createFile(
      root,
      "server/src/example.ts",
      "export const backendValue = 1;\n",
    );
    createFile(
      root,
      "studio-plugin/src/Main.lua",
      "local pluginName = 'RobloxAIStudio'\nreturn pluginName\n",
    );
    createFile(
      root,
      "src/legacy.ts",
      "export const shouldNotBeIndexed = true;\n",
    );

    const knowledge = new CodebaseKnowledge(root);
    knowledge.indexSourceTree();
    const indexedPaths = knowledge
      .getAllFiles()
      .map((file) => file.path)
      .sort();

    expect(indexedPaths).toEqual([
      "server/src/example.ts",
      "studio-plugin/src/Main.lua",
    ]);
  });
});
