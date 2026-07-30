import { describe, expect, it } from "vitest";
import { UserRepository } from "./UserRepository";
import { UserService } from "./UserService";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../storage/StorageProvider";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;
  setDurableCalls = 0;
  onSetStart?: () => void;
  setBarrier?: Promise<void>;

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    this.setDurableCalls += 1;
    this.onSetStart?.();
    if (this.setBarrier) {
      await this.setBarrier;
    }
    if (this.rejectSet) {
      throw new DurableStorageError("injected set rejection", "set");
    }
    await super.setDurable(collection, id, data);
  }
}

describe("user durable acknowledgement", () => {
  it("retains the exact previous user after rejected tier mutation", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const service = new UserService(storage);
    const user = await repository.createDurable({
      email: "tier-before@example.com",
      displayName: "Tier Before",
    });
    storage.rejectSet = true;

    await expect(
      service.updateUser(user.id, { tier: "pro" }),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(service.findById(user.id)).toEqual(user);
  });

  it("retains the exact previous user after rejected status mutation", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const service = new UserService(storage);
    const user = await repository.createDurable({
      email: "status-before@example.com",
      displayName: "Status Before",
    });
    storage.rejectSet = true;

    await expect(service.deactivateUser(user.id)).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(service.findById(user.id)).toEqual(user);
  });

  it("publishes acknowledged tier and status mutations", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const service = new UserService(storage);
    const user = await repository.createDurable({
      email: "admin-committed@example.com",
      displayName: "Admin Committed",
    });

    await expect(
      service.updateUser(user.id, { tier: "pro" }),
    ).resolves.toMatchObject({
      id: user.id,
      tier: "pro",
    });
    await expect(service.deactivateUser(user.id)).resolves.toBe(true);
    expect(service.findById(user.id)).toMatchObject({
      id: user.id,
      tier: "pro",
      status: "suspended",
    });
  });

  it("retains the exact previous user after rejected usage accounting", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const user = await repository.createDurable({
      email: "usage-before@example.com",
      displayName: "Usage Before",
    });
    storage.rejectSet = true;

    await expect(
      repository.recordGenerationDurable(user.id, 1500),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(repository.getById(user.id)).toEqual(user);
  });

  it("publishes acknowledged generation usage", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const user = await repository.createDurable({
      email: "usage-committed@example.com",
      displayName: "Usage Committed",
    });

    await expect(
      repository.recordGenerationDurable(user.id, 1500),
    ).resolves.toBe(true);
    expect(repository.getById(user.id)).toMatchObject({
      id: user.id,
      usage: {
        generationsToday: 1,
        generationsTotal: 1,
        tokensUsedToday: 1500,
        tokensUsedTotal: 1500,
      },
    });
  });

  it("serializes concurrent generation usage for the same user", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const user = await repository.createDurable({
      email: "usage-concurrent@example.com",
      displayName: "Usage Concurrent",
    });
    let markStarted!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    storage.onSetStart = markStarted;
    storage.setBarrier = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });

    const first = repository.recordGenerationDurable(user.id, 100);
    await writeStarted;
    const second = repository.recordGenerationDurable(user.id, 250);

    expect(storage.setDurableCalls).toBe(1);
    releaseWrite();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(storage.setDurableCalls).toBe(2);
    expect(repository.getById(user.id)).toMatchObject({
      id: user.id,
      usage: {
        generationsToday: 2,
        generationsTotal: 2,
        tokensUsedToday: 350,
        tokensUsedTotal: 350,
      },
    });
  });
});
