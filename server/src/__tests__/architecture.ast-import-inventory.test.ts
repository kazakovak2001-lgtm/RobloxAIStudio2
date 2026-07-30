import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAstImportInventory } from "../../../scripts/architecture/ast-import-inventory";

const roots: string[] = [];

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "architecture-ast-"));
  roots.push(root);

  mkdirSync(join(root, "server", "src", "game"), { recursive: true });
  mkdirSync(join(root, "server", "src", "routes"), { recursive: true });

  writeFileSync(
    join(root, "server", "src", "game", "fixture.ts"),
    [
      'import "../routes/static";',
      'export * from "../routes/reexport";',
      'void import("../routes/dynamic");',
      'require("../routes/commonjs");',
    ].join("\n"),
  );

  writeFileSync(
    join(root, "server", "src", "routes", "static.ts"),
    "export {};",
  );
  writeFileSync(
    join(root, "server", "src", "routes", "reexport.ts"),
    "export {};",
  );
  writeFileSync(
    join(root, "server", "src", "routes", "dynamic.ts"),
    "export {};",
  );
  writeFileSync(
    join(root, "server", "src", "routes", "commonjs.ts"),
    "export {};",
  );

  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("AST import inventory fixtures", () => {
  it("classifies static, re-export, dynamic and CommonJS imports", () => {
    const root = createFixture();
    const inventory = buildAstImportInventory(root, {
      resolveDomain(filePath: string): string {
        if (filePath.includes("server/src/game")) return "game";
        if (filePath.includes("server/src/routes")) return "routes";
        return "unknown";
      },
    });

    expect(inventory.unresolvedInternalImports).toEqual([]);
    expect(inventory.edges.map((edge) => edge.kind).sort()).toEqual([
      "dynamic-import",
      "import",
      "re-export",
      "require",
    ]);
    expect(inventory.reExportsAnalyzed).toBe(1);
    expect(inventory.specificationsAnalyzed).toBe(4);
  });

  it("reports an unresolved internal target as fail-closed evidence", () => {
    const root = createFixture();
    mkdirSync(join(root, "server", "src", "unresolved"), { recursive: true });
    writeFileSync(
      join(root, "server", "src", "game", "unknown.ts"),
      'export * from "../unresolved/target";',
    );

    const inventory = buildAstImportInventory(root, {
      resolveDomain(filePath: string): string {
        if (filePath.includes("server/src/game")) return "game";
        if (filePath.includes("server/src/routes")) return "routes";
        return "unknown";
      },
    });

    expect(inventory.unresolvedInternalImports).toContainEqual({
      file: "server/src/game/unknown.ts",
      importPath: "../unresolved/target",
    });
  });
});
