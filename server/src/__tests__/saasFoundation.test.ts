/**
 * SaaS Foundation Tests — Storage, projects, queue, user isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorageProvider } from "../platform/storage";
import { SaaSProjectRepository } from "../platform/projects/SaaSProjectRepository";
import { GenerationQueue } from "../platform/queue/GenerationQueue";

describe("SaaS Foundation", () => {
  describe("StorageProvider", () => {
    const storage = new InMemoryStorageProvider();

    it("stores and retrieves data", () => {
      storage.set("test", "id-1", { name: "Test" });
      expect(storage.get("test", "id-1")).toEqual({ name: "Test" });
    });

    it("lists with filter", () => {
      storage.set("items", "a", { type: "x", val: 1 });
      storage.set("items", "b", { type: "y", val: 2 });
      storage.set("items", "c", { type: "x", val: 3 });
      const xs = storage.list<{ type: string }>("items", (i) => i.type === "x");
      expect(xs).toHaveLength(2);
    });

    it("deletes data", () => {
      storage.set("del", "id", { data: true });
      expect(storage.delete("del", "id")).toBe(true);
      expect(storage.get("del", "id")).toBeNull();
    });
  });

  describe("SaaSProjectRepository", () => {
    let repo: SaaSProjectRepository;

    beforeEach(() => {
      repo = new SaaSProjectRepository(new InMemoryStorageProvider());
    });

    it("creates project with ownership", () => {
      const proj = repo.create("user-1", "My Game", "rpg");
      expect(proj.ownerId).toBe("user-1");
      expect(proj.status).toBe("draft");
    });

    it("isolates projects by owner", () => {
      repo.create("user-1", "Game A", "rpg");
      repo.create("user-2", "Game B", "obby");
      repo.create("user-1", "Game C", "tycoon");

      expect(repo.getByOwner("user-1")).toHaveLength(2);
      expect(repo.getByOwner("user-2")).toHaveLength(1);
    });

    it("verifies ownership", () => {
      const proj = repo.create("user-1", "Game", "rpg");
      expect(repo.verifyOwnership(proj.id, "user-1")).toBe(true);
      expect(repo.verifyOwnership(proj.id, "user-2")).toBe(false);
    });

    it("duplicates project", () => {
      const orig = repo.create("user-1", "Original", "rpg");
      const copy = repo.duplicate(orig.id);
      expect(copy).not.toBeNull();
      expect(copy!.name).toContain("copy");
      expect(copy!.ownerId).toBe("user-1");
      expect(copy!.id).not.toBe(orig.id);
    });

    it("updates project", async () => {
      const proj = repo.create("user-1", "Game", "rpg");
      const updated = await repo.updateDurable(proj.id, {
        status: "generating",
        qualityScore: 75,
      });
      expect(updated!.status).toBe("generating");
      expect(updated!.qualityScore).toBe(75);
    });

    it("deletes project", async () => {
      const proj = repo.create("user-1", "ToDelete", "obby");
      await expect(repo.deleteDurable(proj.id)).resolves.toBe(true);
      expect(repo.get(proj.id)).toBeNull();
    });
  });

  describe("GenerationQueue", () => {
    let queue: GenerationQueue;

    beforeEach(() => {
      queue = new GenerationQueue();
    });

    it("enqueues and dequeues jobs", () => {
      queue.enqueue("proj-1", "user-1");
      queue.enqueue("proj-2", "user-1");
      const job = queue.dequeue();
      expect(job).not.toBeNull();
      expect(job!.status).toBe("running");
    });

    it("completes jobs", () => {
      const job = queue.enqueue("proj-1", "user-1");
      queue.dequeue();
      queue.complete(job.id, { score: 85 });
      expect(queue.getJob(job.id)!.status).toBe("completed");
      expect(queue.getJob(job.id)!.result).toEqual({ score: 85 });
    });

    it("retries failed jobs", () => {
      const job = queue.enqueue("proj-1", "user-1");
      queue.dequeue();
      queue.fail(job.id, "LLM timeout");
      // Should be re-queued (retry count < max)
      expect(queue.getJob(job.id)!.status).toBe("queued");
      expect(queue.getJob(job.id)!.retryCount).toBe(1);
    });

    it("fails permanently after max retries", () => {
      const job = queue.enqueue("proj-1", "user-1");
      // Exhaust all retries (maxRetries=3)
      for (let i = 0; i < 4; i++) {
        queue.dequeue();
        queue.fail(job.id, `error ${i + 1}`);
      }
      expect(queue.getJob(job.id)!.status).toBe("failed");
    });

    it("cancels queued jobs", () => {
      const job = queue.enqueue("proj-1", "user-1");
      expect(queue.cancel(job.id)).toBe(true);
      expect(queue.getJob(job.id)!.status).toBe("cancelled");
    });

    it("respects priority ordering", () => {
      queue.enqueue("low", "u", 10);
      queue.enqueue("high", "u", 1);
      queue.enqueue("mid", "u", 5);
      const first = queue.dequeue();
      expect(first!.projectId).toBe("high");
    });

    it("provides stats", () => {
      queue.enqueue("p1", "u");
      queue.enqueue("p2", "u");
      queue.dequeue();
      const stats = queue.getStats();
      expect(stats.queued).toBe(1);
      expect(stats.running).toBe(1);
    });

    it("isolates jobs by user", () => {
      queue.enqueue("p1", "user-1");
      queue.enqueue("p2", "user-2");
      queue.enqueue("p3", "user-1");
      expect(queue.getByUser("user-1")).toHaveLength(2);
      expect(queue.getByUser("user-2")).toHaveLength(1);
    });
  });

  describe("Multi-User Isolation Security", () => {
    it("user cannot access another user's project", () => {
      const repo = new SaaSProjectRepository(new InMemoryStorageProvider());
      const projA = repo.create("alice", "Alice Game", "rpg");
      const projB = repo.create("bob", "Bob Game", "obby");

      // Alice can access her project
      expect(repo.verifyOwnership(projA.id, "alice")).toBe(true);
      // Alice cannot access Bob's project
      expect(repo.verifyOwnership(projB.id, "alice")).toBe(false);
      // Bob cannot access Alice's project
      expect(repo.verifyOwnership(projA.id, "bob")).toBe(false);
    });

    it("user only sees own projects in list", () => {
      const repo = new SaaSProjectRepository(new InMemoryStorageProvider());
      repo.create("alice", "A1", "rpg");
      repo.create("alice", "A2", "obby");
      repo.create("bob", "B1", "tycoon");

      const aliceProjects = repo.getByOwner("alice");
      const bobProjects = repo.getByOwner("bob");

      expect(aliceProjects.every((p) => p.ownerId === "alice")).toBe(true);
      expect(bobProjects.every((p) => p.ownerId === "bob")).toBe(true);
      expect(aliceProjects).toHaveLength(2);
      expect(bobProjects).toHaveLength(1);
    });
  });
});
