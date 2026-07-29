import { describe, expect, it } from "vitest";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../storage/StorageProvider";
import { UserRepository } from "../users/UserRepository";
import { AuthService } from "./AuthService";
import {
  AccountRegistrationConflictError,
  AccountRegistrationService,
} from "./AccountRegistrationService";

class ControlledAccountStorage extends InMemoryStorageProvider {
  rejectBatch = false;

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    if (this.rejectBatch) {
      throw new DurableStorageError(
        "injected account rejection",
        "transaction",
      );
    }
    return super.applyDurableBatch(mutations);
  }
}

function context(storage = new ControlledAccountStorage()) {
  const users = new UserRepository(storage);
  const auth = new AuthService(storage);
  const registration = new AccountRegistrationService(storage, users, auth);
  return { storage, users, auth, registration };
}

const input = {
  email: "Owner@Example.Test",
  displayName: " Owner ",
  password: "correct-password",
};

describe("AccountRegistrationService", () => {
  it("commits user, credentials, role and session as one account", async () => {
    const { storage, users, auth, registration } = context();

    const registered = await registration.register(input);

    expect(registered.user.email).toBe("owner@example.test");
    expect(registered.user.displayName).toBe("Owner");
    expect(users.getById(registered.user.id)).toEqual(registered.user);
    expect(storage.count("users")).toBe(1);
    expect(storage.count("auth_credentials")).toBe(1);
    expect(storage.count("auth_roles")).toBe(1);
    expect(storage.count("auth_sessions")).toBe(1);
    expect(storage.count("auth_refresh_credentials")).toBe(1);
    expect(auth.validateToken(registered.loginResult.token!)).toMatchObject({
      userId: registered.user.id,
      role: "creator",
    });
  });

  it("leaves no orphan account record when durable commit is rejected", async () => {
    const storage = new ControlledAccountStorage();
    const { registration } = context(storage);
    storage.rejectBatch = true;

    await expect(registration.register(input)).rejects.toBeInstanceOf(
      DurableStorageError,
    );

    expect(storage.count("users")).toBe(0);
    expect(storage.count("auth_credentials")).toBe(0);
    expect(storage.count("auth_roles")).toBe(0);
    expect(storage.count("auth_sessions")).toBe(0);
    expect(storage.count("auth_refresh_credentials")).toBe(0);
  });

  it("maps duplicate credentials to a registration conflict without an orphan user", async () => {
    const { storage, registration } = context();
    const first = await registration.register(input);

    await expect(
      registration.register({ ...input, displayName: "Duplicate" }),
    ).rejects.toMatchObject({
      name: "AccountRegistrationConflictError",
      email: "owner@example.test",
    });

    expect(storage.count("users")).toBe(1);
    expect(storage.count("auth_credentials")).toBe(1);
    expect(storage.count("auth_roles")).toBe(1);
    expect(storage.count("auth_sessions")).toBe(1);
    expect(storage.count("auth_refresh_credentials")).toBe(1);
    expect(storage.get("users", first.user.id)).toEqual(first.user);
  });

  it("allows exactly one successful registration for the same normalized email", async () => {
    const { storage, registration } = context();

    const results = await Promise.allSettled([
      registration.register(input),
      registration.register({
        ...input,
        email: " owner@example.test ",
        displayName: "Concurrent",
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(AccountRegistrationConflictError);
    expect(storage.count("users")).toBe(1);
    expect(storage.count("auth_credentials")).toBe(1);
    expect(storage.count("auth_roles")).toBe(1);
    expect(storage.count("auth_sessions")).toBe(1);
    expect(storage.count("auth_refresh_credentials")).toBe(1);
  });
});
