import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDirectory = path.resolve(
  root,
  process.env.LEGACY_FRONTEND_AUDIT_OUTPUT ??
    "artifacts/post-removal-invariants",
);

mkdirSync(outputDirectory, { recursive: true });

const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .sort();

function buildTree(files) {
  const rootNode = new Map();
  for (const file of files) {
    let node = rootNode;
    for (const segment of file.split("/")) {
      if (!node.has(segment)) node.set(segment, new Map());
      node = node.get(segment);
    }
  }

  const lines = ["."];
  const render = (node, prefix) => {
    const entries = [...node.entries()].sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    );
    entries.forEach(([name, children], index) => {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}`);
      if (children.size > 0) {
        render(children, `${prefix}${last ? "    " : "│   "}`);
      }
    });
  };

  render(rootNode, "");
  return `${lines.join("\n")}\n`;
}

writeFileSync(
  path.join(outputDirectory, "expected_inventory_raw.txt"),
  `${trackedFiles.join("\n")}\n`,
);
writeFileSync(
  path.join(outputDirectory, "expected_ProjectStructure.txt"),
  buildTree(trackedFiles),
);
writeFileSync(
  path.join(outputDirectory, "inventory-generation.json"),
  `${JSON.stringify(
    {
      status: "generated",
      head: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      trackedFileCount: trackedFiles.length,
    },
    null,
    2,
  )}\n`,
);

throw new Error("Diagnostic inventory generation complete");
