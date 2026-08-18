/**
 * MAR-001 — the canonical way to authorize access to a resource.
 *
 * Four findings in the Studio surface shared one shape: the identifier the
 * caller was authorized for was not the thing the operation acted on. The worst
 * of them let a caller present a project they legitimately owned for the access
 * check and another tenant's client for the work.
 *
 * The defence is structural rather than procedural. `requireOwned` takes no
 * project identifier at all. It takes the resource's own id and a loader, and
 * derives the authoritative project from what the loader returned. A caller
 * therefore has nowhere to put an unrelated project id, so the mismatch is not
 * discouraged — it is unrepresentable. A helper that accepted a project
 * alongside a resource id would be a tidier spelling of the same defect.
 *
 * The second rule is that a refusal reveals nothing. A resource that does not
 * exist and a resource belonging to someone else produce the same status and
 * the same body, and that body is built from the resource *name* rather than
 * from the resource, so there is nothing of the refused object in it to leak.
 */

import type { Response } from "express";
import type { ProjectAccessControl } from "./projects";

/** The request shape the project access control accepts. */
type AccessRequest = Parameters<
  ProjectAccessControl["requireProjectAccess"]
>[0];

export interface OwnedResourceSpec<T> {
  /**
   * How the resource is named in the refusal, e.g. "Project" or "Command".
   * Deliberately a name and not the resource: the denial body must not be
   * derived from an object the caller was refused.
   */
  resource: string;
  /** The resource's own identifier, as supplied by the caller. */
  id: string;
  /** Fetches the resource, or nothing when there is no such resource. */
  load: (id: string) => Promise<T | null | undefined> | T | null | undefined;
  /**
   * The authoritative project for the loaded resource.
   *
   * This is the whole point of the helper: the project comes from the resource,
   * never from the caller. For a project it is its own id; for a child it is
   * the parent it records.
   */
  projectOf: (loaded: T) => string | undefined;
  /** Capability an API key principal must hold for this operation. */
  capability?: string;
}

/**
 * Refuse without saying whether the resource exists.
 *
 * Used for absence and for another tenant's resource alike, which is what makes
 * the two indistinguishable.
 */
export function denyAsAbsent(res: Response, resource: string): void {
  if (res.headersSent) return;
  res.status(404).json({ success: false, error: `${resource} not found` });
}

/**
 * Load a resource and return it only if the caller may have it.
 *
 * Returns null after answering the request, so a route can `if (!x) return;`.
 * Fails closed: a missing access control, a resource with no project, and a
 * denied project all refuse the same way.
 */
export function createResourceAuthorizer(access?: ProjectAccessControl) {
  return async function requireOwned<T>(
    req: AccessRequest,
    res: Response,
    spec: OwnedResourceSpec<T>,
  ): Promise<T | null> {
    const loaded = await spec.load(spec.id);
    if (!loaded) {
      denyAsAbsent(res, spec.resource);
      return null;
    }

    // Derived, never supplied. Everything above this line came from storage.
    const projectId = spec.projectOf(loaded);
    if (!projectId) {
      denyAsAbsent(res, spec.resource);
      return null;
    }

    // A deployment without the concealing check must refuse, not fall back to
    // one that answers differently for absent and foreign resources.
    if (!access?.hasProjectAccess) {
      denyAsAbsent(res, spec.resource);
      return null;
    }

    if (!(await access.hasProjectAccess(req, projectId, spec.capability))) {
      denyAsAbsent(res, spec.resource);
      return null;
    }

    return loaded;
  };
}

export type ResourceAuthorizer = ReturnType<typeof createResourceAuthorizer>;
