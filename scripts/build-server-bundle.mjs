#!/usr/bin/env node
/**
 * BUILD-1. Bundle the production server into plain JavaScript that Node.js
 * runs directly, without the tsx loader.
 *
 * The server is compiled with `moduleResolution: "bundler"` and imports its own
 * modules without file extensions, which Node's ESM resolver cannot load. tsx
 * used to resolve those imports at runtime; esbuild now resolves them at build
 * time instead.
 *
 * Every npm package stays external (`packages: "external"`), so dependencies
 * still load from `node_modules` exactly as before: `pg`'s dynamic import, the
 * socket.io and express runtimes, and anything that reads files relative to its
 * own package. Only the server's own source is bundled.
 *
 * Usage: node scripts/build-server-bundle.mjs [outdir]
 */
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(ROOT, process.argv[2] ?? "dist/server-bundle");

await build({
  entryPoints: [join(ROOT, "server/src/index.ts")],
  outfile: join(outdir, "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
  tsconfig: join(ROOT, "server/tsconfig.json"),
  // A few server modules call `require` from ESM source; tsx provided it at
  // runtime. Give the bundle the same `require`, bound to its own location.
  banner: {
    js: 'import { createRequire as __bundleCreateRequire } from "node:module";\nconst require = __bundleCreateRequire(import.meta.url);',
  },
  logLevel: "info",
});
