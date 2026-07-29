import { describe, expect, it } from "vitest";
import { UserRepository } from "./UserRepository";
import { UserService } from "./UserService";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../storage/StorageProvider";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;

  override async setDurable<T>(
    collection: string,
    id: string,
    data: T,
  ): Promise<void> {
    if (this.rejectSet) {
      throw new DurableStorageError("injected set rejection", "set");
    }
    await super.setDurable(collection, id, data);
  }
}

describe("user administration durable acknowledgement", () => {
  it("retains the exact previous user after rejected tier mutation", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const service = new UserService(storage);
    const user = repository.create({
      email: "tier-before@example.com",
      displayName: "Tier Before",
    });
    storage.rejectSet = true;

    await expect(service.updateUser(user.id, { tier: "pro" })).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(service.findById(user.id)).toEqual(user);
  });

  it("retains the exact previous user after rejected status mutation", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new UserRepository(storage);
    const service = new UserService(storage);
    const user = repository.create({
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
    const user = repository.create({
      email: "admin-committed@example.com",
      displayName: "Admin Committed",
    });

    await expect(service.updateUser(user.id, { tier: "pro" })).resolves.toMatchObject({
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
});
