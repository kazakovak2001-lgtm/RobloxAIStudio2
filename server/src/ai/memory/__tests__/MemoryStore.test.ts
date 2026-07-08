import { describe, it, expect } from "vitest";
import { AIMemoryStore } from "../MemoryStore";
import { MemorySearch } from "../MemorySearch";

describe("AIMemoryStore", () => {
  it("stores and retrieves entries", () => {
    const store = new AIMemoryStore();
    const entry = store.store({
      type: "decision",
      agentId: "game_designer",
      sessionId: "s1",
      content: { choice: "obby" },
      importance: 8,
      tags: ["gameplay"],
    });
    expect(entry.id).toMatch(/^mem-/);
    expect(store.size).toBe(1);
  });

  it("retrieves by agent", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "output",
      agentId: "planner",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: [],
    });
    store.store({
      type: "output",
      agentId: "designer",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: [],
    });
    expect(store.getByAgent("planner").length).toBe(1);
  });

  it("retrieves by session", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "decision",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: [],
    });
    store.store({
      type: "decision",
      agentId: "b",
      sessionId: "s2",
      content: {},
      importance: 5,
      tags: [],
    });
    expect(store.getBySession("s1").length).toBe(1);
  });

  it("retrieves by type", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "failure",
      agentId: "a",
      sessionId: "s1",
      content: { error: "timeout" },
      importance: 9,
      tags: ["error"],
    });
    store.store({
      type: "decision",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: [],
    });
    expect(store.getByType("failure").length).toBe(1);
  });

  it("searches by tags", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "asset",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: ["texture", "ui"],
    });
    store.store({
      type: "asset",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: ["sound"],
    });
    expect(store.searchByTags(["ui"]).length).toBe(1);
  });

  it("gets top importance entries", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "decision",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 3,
      tags: [],
    });
    store.store({
      type: "decision",
      agentId: "b",
      sessionId: "s1",
      content: {},
      importance: 9,
      tags: [],
    });
    store.store({
      type: "decision",
      agentId: "c",
      sessionId: "s1",
      content: {},
      importance: 6,
      tags: [],
    });
    const top = store.getTopImportance(2);
    expect(top[0].importance).toBe(9);
    expect(top.length).toBe(2);
  });

  it("gets relevant entries for agent", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "output",
      agentId: "planner",
      sessionId: "s1",
      content: {},
      importance: 5,
      tags: [],
    });
    store.store({
      type: "failure",
      agentId: "lua_generator",
      sessionId: "s1",
      content: {},
      importance: 8,
      tags: [],
    });
    const relevant = store.getRelevantForAgent("s1", "lua_generator", 10);
    expect(relevant.length).toBe(2); // both match session
  });
});

describe("MemorySearch", () => {
  it("queries with combined filters", () => {
    const store = new AIMemoryStore();
    store.store({
      type: "decision",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 9,
      tags: ["core"],
    });
    store.store({
      type: "decision",
      agentId: "a",
      sessionId: "s1",
      content: {},
      importance: 2,
      tags: ["minor"],
    });
    const search = new MemorySearch(store);
    const results = search.query({ sessionId: "s1", minImportance: 5 });
    expect(results.length).toBe(1);
    expect(results[0].importance).toBe(9);
  });

  it("respects limit", () => {
    const store = new AIMemoryStore();
    for (let i = 0; i < 10; i++)
      store.store({
        type: "output",
        agentId: "a",
        sessionId: "s1",
        content: {},
        importance: 5,
        tags: [],
      });
    const search = new MemorySearch(store);
    const results = search.query({ sessionId: "s1", limit: 3 });
    expect(results.length).toBe(3);
  });
});
