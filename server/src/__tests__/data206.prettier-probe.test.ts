import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const target = "server/src/__tests__/harden2a.auth-contract.test.ts";

describe("DATA-206 Prettier probe", () => {
  it("prints the exact formatter diff", () => {
    const formatted = spawnSync(
      "node",
      ["node_modules/prettier/bin/prettier.cjs", target],
      { encoding: "utf8" },
    );
    expect(formatted.status).toBe(0);

    const current = readFileSync(target, "utf8");
    if (current !== formatted.stdout) {
      const output = "/tmp/data206-prettier-output.ts";
      writeFileSync(output, formatted.stdout);
      const diff = spawnSync("diff", ["-u", target, output], {
        encoding: "utf8",
      });
      console.log(diff.stdout);
    }

    expect(current).toBe(formatted.stdout);
  });
});
