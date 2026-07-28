import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  ImportBoundaryValidator,
  extractImportSpecifications,
  type ImportSpecification,
} from "../ImportBoundaryValidator";

describe("ARCH-201 TypeScript AST import graph", () => {
  it("extracts every supported syntax without string or comment false positives", () => {
    const fixtureUrl = new URL(
      "fixtures/import-syntax.fixture.ts.txt",
      import.meta.url,
    );
    const fixture = readFileSync(fixtureUrl, "utf8");

    expect(
      extractImportSpecifications(fixture, "import-syntax.fixture.ts"),
    ).toEqual<ImportSpecification[]>([
      { specifier: "./default", syntax: "static-import" },
      { specifier: "./namespace", syntax: "static-import" },
      { specifier: "./named", syntax: "static-import" },
      { specifier: "./type-only", syntax: "type-import" },
      { specifier: "./inline-type-only", syntax: "type-import" },
      { specifier: "./side-effect", syntax: "side-effect-import" },
      { specifier: "./re-export-named", syntax: "re-export" },
      { specifier: "./re-export-all", syntax: "re-export" },
      { specifier: "./re-export-namespace", syntax: "re-export" },
      { specifier: "./re-export-type", syntax: "type-re-export" },
      { specifier: "./re-export-inline-type", syntax: "type-re-export" },
      { specifier: "./dynamic", syntax: "dynamic-import" },
      { specifier: "./template-dynamic", syntax: "dynamic-import" },
      { specifier: "./required", syntax: "require-call" },
      { specifier: "./import-equals", syntax: "import-equals-require" },
      { specifier: "./type-query", syntax: "import-type-query" },
    ]);
  });

  it("turns a forbidden re-export into a critical boundary violation", () => {
    const root = mkdtempSync(join(tmpdir(), "arch-201-"));

    try {
      const routesDir = join(root, "server", "src", "routes");
      const cloudDir = join(root, "server", "src", "cloud");
      const quarantineDir = join(root, "server", "src", "_quarantine");
      mkdirSync(routesDir, { recursive: true });
      mkdirSync(cloudDir, { recursive: true });
      mkdirSync(quarantineDir, { recursive: true });

      writeFileSync(
        join(root, "architecture.manifest.json"),
        JSON.stringify({
          domains: {
            routes: { path: "server/src/routes", layer: "api" },
            cloud: { path: "server/src/cloud", layer: "infrastructure" },
          },
          forbiddenEdges: [
            {
              from: ["routes"],
              to: ["cloud"],
              rule: "API_NO_INFRA_BYPASS",
              message: "Routes must use a service boundary.",
            },
          ],
          hardBans: [],
        }),
      );
      writeFileSync(
        join(routesDir, "index.ts"),
        'export { cloudClient } from "../cloud/service";\n',
      );
      writeFileSync(
        join(cloudDir, "service.ts"),
        "export const cloudClient = true;\n",
      );
      writeFileSync(
        join(routesDir, "ignored.test.ts"),
        'export { cloudClient } from "../cloud/service";\n',
      );
      writeFileSync(
        join(quarantineDir, "ignored.ts"),
        'export { cloudClient } from "../cloud/service";\n',
      );

      const result = new ImportBoundaryValidator(root).scanProject();

      expect(result.filesScanned).toBe(2);
      expect(result.importsAnalyzed).toBe(1);
      expect(result.edges).toEqual([
        {
          from: "routes",
          to: "cloud",
          file: "server/src/routes/index.ts",
          importPath: "../cloud/service",
        },
      ]);
      expect(result.violations).toEqual([
        expect.objectContaining({
          file: "server/src/routes/index.ts",
          importPath: "../cloud/service",
          sourceDomain: "routes",
          targetDomain: "cloud",
          rule: "API_NO_INFRA_BYPASS",
          severity: "critical",
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("matches the reviewed production AST baseline", () => {
    const result = new ImportBoundaryValidator(process.cwd()).scanProject();

    expect(result.filesScanned).toBe(547);
    expect(result.importsAnalyzed).toBe(1460);
    expect(result.violations).toEqual([]);
  });
});
