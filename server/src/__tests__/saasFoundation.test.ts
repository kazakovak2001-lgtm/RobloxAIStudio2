/**
 * SaaS Foundation Tests — Storage, projects, queue, user isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../platform/storage";
import { SaaSProjectRepository } from "../platform/projects/SaaSProjectRepository";
import { GenerationQueue } from "../platform/queue/GenerationQueue";

class DeferredProjectSetStorage extends InMemoryStorageProvider {
  calls = 0;
  private acknowledge!: () => void;
  private readonly acknowledged = new Promise<void>((resolve) => {
    this.acknowledge = resolve;
  });

  release(): void {
    this.acknowledge();
  }

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    this.calls += 1;
    await this.acknowledged;
    await super.setDurable(collection, id, data);
  }
}

class RejectingProjectSetStorage extends InMemoryStorageProvider {
  override async setDurable<T>(
    _collection: string,
    _id: string,
    _data: T,
  ): Promise<void> {
    throw new DurableStorageError(
      "Injected project duplication rejection",
      "set",
    );
  }
}

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

    it("creates project with ownership", async () => {
      const proj = await repo.createDurable("user-1", "My Game", "rpg");
      expect(proj.ownerId).toBe("user-1");
      expect(proj.status).toBe("draft");
    });

    it("isolates projects by owner", async () => {
      await repo.createDurable("user-1", "Game A", "rpg");
      await repo.createDurable("user-2", "Game B", "obby");
      await repo.createDurable("user-1", "Game C", "tycoon");

      expect(repo.getByOwner("user-1")).toHaveLength(2);
      expect(repo.getByOwner("user-2")).toHaveLength(1);
    });

    it("verifies ownership", async () => {
      const proj = await repo.createDurable("user-1", "Game", "rpg");
      expect(repo.verifyOwnership(proj.id, "user-1")).toBe(true);
      expect(repo.verifyOwnership(proj.id, "user-2")).toBe(false);
    });

    it("duplicates project", async () => {
      const orig = await repo.createDurable("user-1", "Original", "rpg");
      const copy = await repo.duplicate(orig.id);
      expect(copy).not.toBeNull();
      expect(copy!.name).toContain("copy");
      expect(copy!.ownerId).toBe("user-1");
      expect(copy!.id).not.toBe(orig.id);
    });

    it("returns null without writing when the duplicate source is missing", async () => {
      const storage = new DeferredProjectSetStorage();
      const repository = new SaaSProjectRepository(storage);

      await expect(repository.duplicate("missing")).resolves.toBeNull();
      expect(storage.calls).toBe(0);
    });

    it("does not publish a duplicate before acknowledgement", async () => {
      const storage = new DeferredProjectSetStorage();
      const repository = new SaaSProjectRepository(storage);
      storage.set("projects", "source", {
        id: "source",
        ownerId: "owner-1",
        name: "Original",
        description: "Description",
        genre: "adventure",
        status: "draft",
        qualityScore: 0,
        generationCount: 0,
        scriptCount: 0,
        assetCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });

      const duplication = repository.duplicate("source", "owner-2");
      await Promise.resolve();
      await Promise.resolve();

      expect(repository.getByOwner("owner-2")).toEqual([]);

      storage.release();
      const copy = await duplication;
      expect(copy).not.toBeNull();
      expect(repository.get(copy!.id)).toBe(copy);
    });

    it("preserves only the source when duplicate persistence rejects", async () => {
      const storage = new RejectingProjectSetStorage();
      const repository = new SaaSProjectRepository(storage);
      const source = {
        id: "source",
        ownerId: "owner-1",
        name: "Original",
        description: "Description",
        genre: "adventure",
        status: "draft" as const,
        qualityScore: 0,
        generationCount: 0,
        scriptCount: 0,
        assetCount: 0,
        createdAt: 1,
        updatedAt: 1,
      };
      storage.set("projects", source.id, source);

      await expect(repository.duplicate(source.id)).rejects.toBeInstanceOf(
        DurableStorageError,
      );
      expect(repository.get(source.id)).toBe(source);
      expect(repository.getByOwner(source.ownerId)).toEqual([source]);
    });

    it("publishes an acknowledged duplicate with the requested owner", async () => {
      const storage = new InMemoryStorageProvider();
      const repository = new SaaSProjectRepository(storage);
      const source = await repository.createDurable(
        "owner-1",
        "Original",
        "adventure",
        "Description",
      );

      const copy = await repository.duplicate(source.id, "owner-2");

      expect(copy).toEqual(
        expect.objectContaining({
          ownerId: "owner-2",
          name: "Original (copy)",
          genre: "adventure",
          description: "Description",
        }),
      );
      expect(repository.get(copy!.id)).toBe(copy);
    });

    it("updates project", async () => {
      const proj = await repo.createDurable("user-1", "Game", "rpg");
      const updated = await repo.updateDurable(proj.id, {
        status: "generating",
        qualityScore: 75,
      });
      expect(updated!.status).toBe("generating");
      expect(updated!.qualityScore).toBe(75);
    });

    it("deletes project", async () => {
      const proj = await repo.createDurable("user-1", "ToDelete", "obby");
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
      expect(queue.getJob(job.id)!.status).toBe("queued");
      expect(queue.getJob(job.id)!.retryCount).toBe(1);
    });

    it("fails permanently after max retries", () => {
      const job = queue.enqueue("proj-1", "user-1");
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
    it("user cannot access another user's project", async () => {
      const repo = new SaaSProjectRepository(new InMemoryStorageProvider());
      const projA = await repo.createDurable("alice", "Alice Game", "rpg");
      const projB = await repo.createDurable("bob", "Bob Game", "obby");

      expect(repo.verifyOwnership(projA.id, "alice")).toBe(true);
      expect(repo.verifyOwnership(projB.id, "alice")).toBe(false);
      expect(repo.verifyOwnership(projA.id, "bob")).toBe(false);
    });

    it("user only sees own projects in list", async () => {
      const repo = new SaaSProjectRepository(new InMemoryStorageProvider());
      await repo.createDurable("alice", "A1", "rpg");
      await repo.createDurable("alice", "A2", "obby");
      await repo.createDurable("bob", "B1", "tycoon");

      const aliceProjects = repo.getByOwner("alice");
      const bobProjects = repo.getByOwner("bob");

      expect(aliceProjects.every((p) => p.ownerId === "alice")).toBe(true);
      expect(bobProjects.every((p) => p.ownerId === "bob")).toBe(true);
      expect(aliceProjects).toHaveLength(2);
      expect(bobProjects).toHaveLength(1);
    });
  });
});
