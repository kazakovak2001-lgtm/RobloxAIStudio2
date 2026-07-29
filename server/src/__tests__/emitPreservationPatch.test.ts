import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "vitest";

test("emit deterministic preservation update payload", () => {
  const path = new URL("./preservationProperty.test.ts", import.meta.url);
  const original = readFileSync(path, "utf8");
  const before = 'const updated = projects.update(p.id, { name: "Updated Game" });';
  const after =
    'const updated = await projects.updateDurable(p.id, { name: "Updated Game" });';

  if (!original.includes(before)) {
    throw new Error("Expected preservation update call was not found");
  }

  const modified = original.replace(before, after);
  const encoded = Buffer.from(modified, "utf8").toString("base64");
  const chunkSize = 6000;
  const chunks = Math.ceil(encoded.length / chunkSize);

  console.log(`PRESERVATION_PATCH_SHA256:${createHash("sha256").update(modified).digest("hex")}`);
  console.log(`PRESERVATION_PATCH_CHUNKS:${chunks}`);
  for (let index = 0; index < chunks; index += 1) {
    console.log(
      `PRESERVATION_PATCH_${index}:${encoded.slice(index * chunkSize, (index + 1) * chunkSize)}`,
    );
  }
});
