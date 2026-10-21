/**
 * AUDIT-BODY-SUPPLIED-BLUEPRINT-001.
 *
 * economy, world, simulation, lifecycle and generation-v2 each authorize an
 * ephemeral analysis blueprint by pulling `blueprint.id` out of the request
 * body and passing it straight to `requireProjectAccess`. There is no stored
 * resource behind these routes to derive a project from the way
 * `requireOwned` does, so `blueprint.id` really is the only project identity
 * the request carries — but eight call sites each wrote that binding by
 * hand, which is exactly the kind of duplication that drifts silently.
 *
 * `requireProjectAccessForBlueprint` is now the one place that binding is
 * written. These tests exercise it directly rather than re-asserting route
 * source text, which is what the finding's evidence gap actually was.
 */

import type { Response } from "express";
import { describe, expect, it } from "vitest";
import { requireProjectAccessForBlueprint } from "../routes/resourceAuthorization";

function fakeResponse() {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    headersSent: false,
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, calls };
}

const request = {} as Parameters<typeof requireProjectAccessForBlueprint>[1];

describe("AUDIT-BODY-SUPPLIED-BLUEPRINT-001 requireProjectAccessForBlueprint", () => {
  it("refuses a blueprint with no id before ever touching access control", async () => {
    const seen: string[] = [];
    const access = {
      requireProjectAccess: async (
        _req: unknown,
        _res: unknown,
        projectId: string,
      ) => {
        seen.push(projectId);
        return true;
      },
    };
    const { res, calls } = fakeResponse();

    const result = await requireProjectAccessForBlueprint(
      access,
      request,
      res,
      { id: undefined },
    );

    expect(result).toBeNull();
    expect(seen).toEqual([]);
    expect(calls).toEqual({
      status: 400,
      body: { success: false, error: "Blueprint with id required" },
    });
  });

  it("uses a caller-supplied missing-blueprint message when given one", async () => {
    const access = { requireProjectAccess: async () => true };
    const { res, calls } = fakeResponse();

    await requireProjectAccessForBlueprint(access, request, res, null, {
      missingBlueprintMessage: "Blueprint required",
    });

    expect(calls.body).toEqual({
      success: false,
      error: "Blueprint required",
    });
  });

  it("authorizes exactly the id the blueprint carries, nothing else", async () => {
    const seen: string[] = [];
    const access = {
      requireProjectAccess: async (
        _req: unknown,
        _res: unknown,
        projectId: string,
      ) => {
        seen.push(projectId);
        return projectId === "project-allowed";
      },
    };
    const { res } = fakeResponse();

    const denied = await requireProjectAccessForBlueprint(
      access,
      request,
      res,
      {
        id: "project-forbidden",
      },
    );
    expect(denied).toBeNull();

    const { res: res2 } = fakeResponse();
    const allowed = await requireProjectAccessForBlueprint(
      access,
      request,
      res2,
      { id: "project-allowed" },
    );
    expect(allowed).toBe("project-allowed");
    expect(seen).toEqual(["project-forbidden", "project-allowed"]);
  });

  it("passes the api-key capability through to the access check", async () => {
    const seen: Array<string | undefined> = [];
    const access = {
      requireProjectAccess: async (
        _req: unknown,
        _res: unknown,
        _projectId: string,
        capability?: string,
      ) => {
        seen.push(capability);
        return true;
      },
    };
    const { res } = fakeResponse();

    await requireProjectAccessForBlueprint(
      access,
      request,
      res,
      { id: "p1" },
      {
        apiKeyCapability: "project.economy.analyze",
      },
    );

    expect(seen).toEqual(["project.economy.analyze"]);
  });

  it("does not double-write a response the access check already sent", async () => {
    const access = {
      requireProjectAccess: async (_req: unknown, res: Response) => {
        res.status(403).json({ success: false, error: "Access denied" });
        return false;
      },
    };
    const { res, calls } = fakeResponse();

    const result = await requireProjectAccessForBlueprint(
      access,
      request,
      res,
      {
        id: "p1",
      },
    );

    expect(result).toBeNull();
    expect(calls).toEqual({
      status: 403,
      body: { success: false, error: "Access denied" },
    });
  });
});
