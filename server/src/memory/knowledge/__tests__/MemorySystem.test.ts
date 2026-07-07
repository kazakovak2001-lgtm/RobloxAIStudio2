/**
 * Memory & Knowledge System Integration Tests (v2.9)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KnowledgeMemoryManager } from "../MemoryManager";
import { KnowledgeRepository } from "../KnowledgeRepository";
import { ArtifactIndex } from "../ArtifactIndex";
import { ContextResolver } from "../ContextResolver";
import { MemoryStorage } from "../MemoryStorage";
import { MemoryMetrics } from "../MemoryMetrics";

describe("KnowledgeMemoryManager", () => {
  let manager: KnowledgeMemoryManager;
  beforeEach(() => {
    manager = new KnowledgeMemoryManager();
  });

  it("stores and retrieves entries", () => {
    const entry = manager.store(
      "proj-1",
      "gameplay",
      "mechanics",
      { jump: true },
      "test",
    );
    expect(entry.id).toMatch(/^mem-/);
    expect(manager.retrieve(entry.id)?.value).toEqual({ jump: true });
  });

  it("updates existing entries", () => {
    manager.store("proj-1", "gameplay", "mechanics", { v: 1 }, "test");
    const updated = manager.store(
      "proj-1",
      "gameplay",
      "mechanics",
      { v: 2 },
      "test",
    );
    expect(updated.version).toBe(2);
    expect(updated.value).toEqual({ v: 2 });
    expect(manager.entryCount).toBe(1);
  });

  it("finds by category", () => {
    manager.store("proj-1", "lua", "scripts", {}, "test");
    manager.store("proj-1", "ui", "screens", {}, "test");
    expect(manager.findByCategory("proj-1", "lua").length).toBe(1);
  });

  it("finds by tags", () => {
    manager.store("proj-1", "gameplay", "x", {}, "test", ["obby", "jump"]);
    manager.store("proj-1", "gameplay", "y", {}, "test", ["rpg"]);
    expect(manager.findByTags("proj-1", ["obby"]).length).toBe(1);
  });

  it("starts sessions", () => {
    const session = manager.startSession("proj-1");
    expect(session.projectId).toBe("proj-1");
    expect(manager.getSession(session.sessionId)).toBeDefined();
  });
});

describe("KnowledgeRepository", () => {
  let repo: KnowledgeRepository;
  beforeEach(() => {
    repo = new KnowledgeRepository();
  });

  it("adds and retrieves documents", () => {
    const doc = repo.add(
      "lua",
      "Lua Best Practices",
      { content: "use local" },
      ["lua", "best-practices"],
    );
    expect(repo.get(doc.id)?.title).toBe("Lua Best Practices");
  });

  it("searches by query", () => {
    repo.add("architecture", "Folder Structure", {}, ["folders"]);
    repo.add("lua", "Lua Patterns", {}, ["patterns"]);
    expect(repo.search("lua").length).toBe(1);
    expect(repo.search("folder").length).toBe(1);
  });

  it("filters by category", () => {
    repo.add("ui", "Buttons", {}, []);
    repo.add("ui", "Frames", {}, []);
    repo.add("lua", "Scripts", {}, []);
    expect(repo.getByCategory("ui").length).toBe(2);
  });
});

describe("ArtifactIndex", () => {
  let index: ArtifactIndex;
  beforeEach(() => {
    index = new ArtifactIndex();
  });

  it("indexes and retrieves artifacts", () => {
    index.add({
      id: "a1",
      artifactType: "script",
      name: "Main",
      path: "Server/Main.lua",
      projectId: "p1",
      generatedBy: "test",
      version: 1,
      size: 100,
      tags: ["server"],
      createdAt: Date.now(),
    });
    expect(index.get("a1")?.name).toBe("Main");
    expect(index.getByPath("Server/Main.lua")).toBeDefined();
    expect(index.getByProject("p1").length).toBe(1);
  });

  it("searches by name/path", () => {
    index.add({
      id: "a1",
      artifactType: "module",
      name: "Utils",
      path: "Shared/Utils.lua",
      projectId: "p1",
      generatedBy: "t",
      version: 1,
      size: 50,
      tags: [],
      createdAt: Date.now(),
    });
    expect(index.search("utils").length).toBe(1);
  });

  it("filters by type and tags", () => {
    index.add({
      id: "a1",
      artifactType: "script",
      name: "A",
      path: "a",
      projectId: "p1",
      generatedBy: "t",
      version: 1,
      size: 10,
      tags: ["server"],
      createdAt: Date.now(),
    });
    index.add({
      id: "a2",
      artifactType: "module",
      name: "B",
      path: "b",
      projectId: "p1",
      generatedBy: "t",
      version: 1,
      size: 10,
      tags: ["shared"],
      createdAt: Date.now(),
    });
    expect(index.getByType("script").length).toBe(1);
    expect(index.getByTags(["shared"]).length).toBe(1);
  });
});

describe("ContextResolver", () => {
  it("assembles context within size limit", () => {
    const manager = new KnowledgeMemoryManager();
    const repo = new KnowledgeRepository();
    const index = new ArtifactIndex();
    manager.store("p1", "gameplay", "mech", { data: "x".repeat(100) }, "test");
    manager.store("p1", "lua", "scripts", { data: "y".repeat(100) }, "test");
    index.add({
      id: "a1",
      artifactType: "script",
      name: "A",
      path: "a",
      projectId: "p1",
      generatedBy: "t",
      version: 1,
      size: 50,
      tags: [],
      createdAt: Date.now(),
    });

    const resolver = new ContextResolver(manager, repo, index);
    const result = resolver.resolve({ projectId: "p1" });
    expect(result.valid).toBe(true);
    expect(result.window.entries.length).toBe(2);
    expect(result.window.artifacts.length).toBe(1);
  });

  it("filters by category", () => {
    const manager = new KnowledgeMemoryManager();
    manager.store("p1", "lua", "a", {}, "t");
    manager.store("p1", "ui", "b", {}, "t");
    const resolver = new ContextResolver(
      manager,
      new KnowledgeRepository(),
      new ArtifactIndex(),
    );
    const result = resolver.resolve({ projectId: "p1", categories: ["lua"] });
    expect(result.window.entries.length).toBe(1);
  });
});

describe("MemoryStorage", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("saves and loads snapshots", () => {
    storage.save(
      "p1",
      [
        {
          id: "m1",
          projectId: "p1",
          category: "lua",
          key: "x",
          value: 1,
          tags: [],
          version: 1,
          createdAt: 0,
          updatedAt: 0,
          source: "t",
        },
      ],
      [],
      [],
    );
    const loaded = storage.load("p1");
    expect(loaded).not.toBeNull();
    expect(loaded!.entries.length).toBe(1);
    expect(loaded!.entries[0].value).toBe(1);
  });

  it("handles corrupted data gracefully", () => {
    const result = storage.restore("not-valid-json{{{");
    expect(result).toBeNull();
  });

  it("tracks versions", () => {
    storage.snapshot("p1", [], [], []);
    expect(storage.getVersion("p1")).toBe(1);
    storage.snapshot("p1", [], [], []);
    expect(storage.getVersion("p1")).toBe(2);
  });
});

describe("MemoryMetrics", () => {
  it("collects retrieval metrics", () => {
    const metrics = new MemoryMetrics();
    const manager = new KnowledgeMemoryManager();
    const repo = new KnowledgeRepository();
    const index = new ArtifactIndex();
    manager.store("p1", "lua", "x", {}, "t");
    metrics.recordRetrieval(true, 5);
    metrics.recordRetrieval(false, 10);
    metrics.recordCacheAccess(true);
    metrics.recordCacheAccess(false);
    const m = metrics.getMetrics(manager, repo, index);
    expect(m.storedEntries).toBe(1);
    expect(m.retrievalSuccessRate).toBe(0.5);
    expect(m.cacheHitRatio).toBe(0.5);
  });
});
