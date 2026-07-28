import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/src/**/*.test.ts", "server/src/**/*.spec.ts"],
    passWithNoTests: false,
  },
});
