import { describe, expect, it } from "vitest";
import {
  detectSensitiveContent,
  detectSensitiveFiles,
} from "../commitValidator";

describe("commitValidator", () => {
  it("allows environment templates but still blocks real environment files", () => {
    const result = detectSensitiveFiles([
      ".env.example",
      "config/.env.example",
      "config/.env",
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe("config/.env");
  });

  it("allows low-confidence credential examples in tests and documentation", () => {
    const testResult = detectSensitiveContent(
      'token: "tok_example"',
      "server/src/auth/__tests__/auth.test.ts",
    );
    const docsResult = detectSensitiveContent(
      "Authorization: Bearer token",
      "docs/authentication.md",
    );

    expect(testResult.valid).toBe(true);
    expect(docsResult.valid).toBe(true);
  });

  it("blocks low-confidence credentials in application source", () => {
    const result = detectSensitiveContent(
      'apiKey: "production-key-value"',
      "server/src/config/provider.ts",
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("SENSITIVE_CONTENT");
  });

  it("blocks high-confidence secrets even in examples", () => {
    const result = detectSensitiveContent(
      `OPENAI_API_KEY=\"sk-${"a".repeat(32)}\"`,
      ".env.example",
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("SENSITIVE_CONTENT");
  });
});
