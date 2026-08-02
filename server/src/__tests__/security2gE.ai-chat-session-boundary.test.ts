import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "server/src/routes/aiChat.ts"),
  "utf8",
);

describe("SECURITY-2G-E AI chat session boundary", () => {
  it("requires a user session before entering the chat handler", () => {
    const route = source.indexOf('router.post("/chat"');
    const guard = source.indexOf("requireAiChatUserSession", route);
    const llmCall = source.indexOf("llm.generate", route);
    expect(source).toContain("function requireAiChatUserSession(");
    expect(route).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(route);
    expect(llmCall).toBeGreaterThan(guard);
  });

  it("fails closed when no session principal is attached", () => {
    expect(source).toContain("AI chat user session required");
    expect(source).toContain("res.status(403)");
    expect(source).toContain("user?.userId");
  });
});
