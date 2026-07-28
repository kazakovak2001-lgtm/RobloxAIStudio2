import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function trackedFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();
}

function buildTree(files) {
  const rootNode = new Map();

  for (const file of files) {
    const segments = file.split("/");
    let node = rootNode;
    for (const segment of segments) {
      if (!node.has(segment)) {
        node.set(segment, new Map());
      }
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

const files = trackedFiles();
writeFileSync(
  path.join(root, "_inventory_raw.txt"),
  `${files.join("\n")}\n`,
  "utf8",
);
writeFileSync(
  path.join(root, "ProjectStructure.txt"),
  buildTree(files),
  "utf8",
);
writeFileSync(
  path.join(root, "project_structure.txt"),
  [
    "Compatibility pointer — no repository snapshot is stored here.",
    "Canonical tracked-file inventory: _inventory_raw.txt",
    "Canonical tracked-path tree: ProjectStructure.txt",
    "Regenerate both files with:",
    "node scripts/cleanup/generate-tracked-inventories.mjs",
    "",
  ].join("\n"),
  "utf8",
);

console.log(
  `Generated deterministic inventories for ${files.length} tracked paths.`,
);
