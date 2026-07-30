import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { AuthService } from "../../platform/auth/AuthService";
import { InMemoryStorageProvider } from "../../platform/storage/StorageProvider";
import { createProjectRuntime } from "../projects";

function request(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as Request;
}

function response() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { response: { status, json } as unknown as Response, status, json };
}

describe("project runtime access control", async () => {
  it("requires an authenticated owner for project access", async () => {
    const storage = new InMemoryStorageProvider();
    const auth = new AuthService(storage);
    auth.register("owner@example.com", "password123", "owner");
    auth.register("other@example.com", "password123", "other");
    const ownerToken = auth.login(
      "owner@example.com",
      "password123",
      "owner",
    ).token!;
    const otherToken = auth.login(
      "other@example.com",
      "password123",
      "other",
    ).token!;
    const runtime = createProjectRuntime(storage, auth);
    const project = await runtime.projectRepository.createDurable(
      "owner",
      "Game",
      "adventure",
    );

    const unauthenticated = response();
    expect(
      await runtime.access.requireProjectAccess(
        request(),
        unauthenticated.response,
        project.id,
      ),
    ).toBe(false);
    expect(unauthenticated.status).toHaveBeenCalledWith(401);

    const foreign = response();
    expect(
      await runtime.access.requireProjectAccess(
        request(otherToken),
        foreign.response,
        project.id,
      ),
    ).toBe(false);
    expect(foreign.status).toHaveBeenCalledWith(403);

    const owner = response();
    expect(
      await runtime.access.requireProjectAccess(
        request(ownerToken),
        owner.response,
        project.id,
      ),
    ).toBe(true);
  });
});
