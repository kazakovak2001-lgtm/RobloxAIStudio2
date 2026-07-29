import { describe, expect, it } from "vitest";
import { AuthService } from "./AuthService";
import {
  DurableStorageError,
  InMemoryStorageProvider,
  type DurableMutation,
  type DurableMutationResult,
} from "../storage/StorageProvider";

class ControlledAuthStorage extends InMemoryStorageProvider {
  rejectBatches = false;
  holdBatches = false;
  batchCalls = 0;
  heldBatches = 0;
  private releaseHeldBatches: (() => void) | undefined;
  private heldBatchGate = new Promise<void>((resolve) => {
    this.releaseHeldBatches = resolve;
  });

  override async applyDurableBatch(
    mutations: readonly DurableMutation[],
  ): Promise<readonly DurableMutationResult[]> {
    this.batchCalls += 1;
    if (this.rejectBatches) {
      throw new DurableStorageError(
        "injected auth storage rejection",
        "transaction",
      );
    }
    if (this.holdBatches) {
      this.heldBatches += 1;
      await this.heldBatchGate;
    }
    return super.applyDurableBatch(mutations);
  }

  releaseBatches(): void {
    this.releaseHeldBatches?.();
  }
}

function registeredAuth(storage: ControlledAuthStorage): AuthService {
  const auth = new AuthService(storage);
  expect(
    auth.register("owner@example.test", "correct-password", "user-1"),
  ).toBe(true);
  return auth;
}

describe("AuthService durable session lifecycle", () => {
  it("does not expose a partial session when durable login is rejected", async () => {
    const storage = new ControlledAuthStorage();
    const auth = registeredAuth(storage);
    storage.rejectBatches = true;

    await expect(
      auth.loginDurable("owner@example.test", "correct-password", "user-1"),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(storage.count("auth_sessions")).toBe(0);
    expect(storage.count("auth_refresh_credentials")).toBe(0);

    storage.rejectBatches = false;
    const login = await auth.loginDurable(
      "owner@example.test",
      "correct-password",
      "user-1",
    );
    expect(login.success).toBe(true);
    expect(storage.count("auth_sessions")).toBe(1);
    expect(storage.count("auth_refresh_credentials")).toBe(1);
  });

  it("preserves the old session when refresh rotation persistence is rejected", async () => {
    const storage = new ControlledAuthStorage();
    const auth = registeredAuth(storage);
    const login = auth.login(
      "owner@example.test",
      "correct-password",
      "user-1",
    );
    expect(login.success).toBe(true);
    storage.rejectBatches = true;

    await expect(
      auth.refreshSessionDurable(login.refreshToken!),
    ).rejects.toBeInstanceOf(DurableStorageError);

    expect(auth.validateToken(login.token!)).not.toBeNull();
    expect(storage.count("auth_sessions")).toBe(1);
    expect(storage.count("auth_refresh_credentials")).toBe(1);

    storage.rejectBatches = false;
    const rotated = await auth.refreshSessionDurable(login.refreshToken!);
    expect(rotated.success).toBe(true);
    expect(auth.validateToken(login.token!)).toBeNull();
    expect(auth.validateToken(rotated.token!)).not.toBeNull();
  });

  it("allows exactly one winner for concurrent refresh replay", async () => {
    const storage = new ControlledAuthStorage();
    const auth = registeredAuth(storage);
    const login = auth.login(
      "owner@example.test",
      "correct-password",
      "user-1",
    );
    expect(login.success).toBe(true);
    storage.holdBatches = true;

    const first = auth.refreshSessionDurable(login.refreshToken!);
    const second = auth.refreshSessionDurable(login.refreshToken!);
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.heldBatches).toBe(2);

    storage.releaseBatches();
    const results = await Promise.all([first, second]);
    const successful = results.filter((result) => result.success);
    const rejectedReplay = results.filter((result) => !result.success);

    expect(successful).toHaveLength(1);
    expect(rejectedReplay).toEqual([
      { success: false, error: "Invalid refresh token" },
    ]);
    expect(storage.count("auth_sessions")).toBe(1);
    expect(storage.count("auth_refresh_credentials")).toBe(1);
    expect(auth.validateToken(login.token!)).toBeNull();
    expect(auth.validateToken(successful[0].token!)).not.toBeNull();
    expect(
      (await auth.refreshSessionDurable(login.refreshToken!)).success,
    ).toBe(false);
  });

  it("does not claim logout success when durable revocation is rejected", async () => {
    const storage = new ControlledAuthStorage();
    const auth = registeredAuth(storage);
    const login = auth.login(
      "owner@example.test",
      "correct-password",
      "user-1",
    );
    expect(login.success).toBe(true);
    storage.rejectBatches = true;

    await expect(auth.logoutDurable(login.token!)).rejects.toBeInstanceOf(
      DurableStorageError,
    );
    expect(auth.validateToken(login.token!)).not.toBeNull();

    storage.rejectBatches = false;
    await expect(auth.logoutDurable(login.token!)).resolves.toBe(true);
    expect(auth.validateToken(login.token!)).toBeNull();
    expect(storage.count("auth_refresh_credentials")).toBe(0);
  });
});
