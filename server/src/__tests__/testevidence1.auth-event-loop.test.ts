/**
 * TEST-EVIDENCE-1 / AUTH-BCRYPT-EVENTLOOP-001 — password hashing must not block
 * the event loop.
 *
 * `bcryptjs` is a pure JavaScript implementation, so its synchronous form runs
 * the entire cost-12 computation in one uninterrupted block. Measured on this
 * machine, one `hashSync` took about 520ms and allowed zero timer callbacks to
 * run during it, while the asynchronous form took the same time and allowed
 * several. The cost factor is identical either way, so this is not a strength
 * question: it is whether the process can serve anything else while hashing.
 *
 * This asserts the property directly rather than through the timing of some
 * other test. A duration assertion would be flaky on a loaded machine; timer
 * starvation is a yes-or-no observation about the same run.
 */

import { describe, expect, it } from "vitest";
import { AuthService } from "../platform/auth/AuthService";
import { InMemoryStorageProvider } from "../platform/storage/StorageProvider";

/**
 * Counts timer callbacks that run while `work` is in flight. A blocking
 * implementation yields none, however long it takes.
 */
async function ticksDuring(work: () => Promise<unknown>): Promise<number> {
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
  }, 5);
  try {
    await work();
  } finally {
    clearInterval(timer);
  }
  return ticks;
}

describe("TEST-EVIDENCE-1 authentication event loop", () => {
  it("keeps the event loop responsive while registering", async () => {
    const auth = new AuthService(new InMemoryStorageProvider());

    const ticks = await ticksDuring(() =>
      auth.registerDurable(
        "loop-register@example.com",
        "password123",
        "loop-1",
      ),
    );

    // The synchronous implementation yielded exactly zero.
    expect(ticks).toBeGreaterThan(0);
  });

  it("keeps the event loop responsive while verifying a password", async () => {
    const auth = new AuthService(new InMemoryStorageProvider());
    await auth.registerDurable(
      "loop-login@example.com",
      "password123",
      "loop-2",
    );

    const ticks = await ticksDuring(() =>
      auth.loginDurable("loop-login@example.com", "password123", "loop-2"),
    );

    expect(ticks).toBeGreaterThan(0);
  });

  it("keeps the event loop responsive while preparing a registration", async () => {
    const auth = new AuthService(new InMemoryStorageProvider());

    const ticks = await ticksDuring(() =>
      auth.prepareRegistration(
        "loop-prepare@example.com",
        "password123",
        "loop-3",
      ),
    );

    expect(ticks).toBeGreaterThan(0);
  });

  it("still hashes at the unchanged cost factor and still verifies", async () => {
    const storage = new InMemoryStorageProvider();
    const auth = new AuthService(storage);

    expect(
      await auth.registerDurable("cost@example.com", "password123", "cost-1"),
    ).toBe(true);

    const stored = storage.get<{ passwordHash: string }>(
      "auth_credentials",
      "cost@example.com",
    );
    // bcrypt hashes carry their cost in the prefix, so a weakened factor would
    // show up here rather than silently passing.
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$12\$/);

    await expect(
      auth.loginDurable("cost@example.com", "password123", "cost-1"),
    ).resolves.toMatchObject({ success: true });
    await expect(
      auth.loginDurable("cost@example.com", "wrong-password", "cost-1"),
    ).resolves.toMatchObject({ success: false });
  });
});
