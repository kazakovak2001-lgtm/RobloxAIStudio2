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

/**
 * The concealing check, which answers with a bare boolean and so cannot say
 * whether a resource exists.
 *
 * The helper takes this function rather than the whole access control, and
 * takes it as a requirement rather than an option. `hasProjectAccess` is
 * optional on `ProjectAccessControl`, and a route migrated to `requireOwned`
 * whose control happened to omit it would refuse every request as absent — a
 * silent outage discovered in production rather than at compile time. Demanding
 * the function makes that impossible to write.
 */
export type ProjectAccessCheck = NonNullable<
  ProjectAccessControl["hasProjectAccess"]
>;

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
 * A resource that does not exist, one whose project cannot be determined, and
 * one the caller may not have all refuse the same way.
 */
export function createResourceAuthorizer(hasProjectAccess: ProjectAccessCheck) {
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

    if (!(await hasProjectAccess(req, projectId, spec.capability))) {
      denyAsAbsent(res, spec.resource);
      return null;
    }

    return loaded;
  };
}

export type ResourceAuthorizer = ReturnType<typeof createResourceAuthorizer>;

/**
 * AUDIT-BODY-SUPPLIED-BLUEPRINT-001.
 *
 * Several routes (economy, world, simulation, lifecycle, generation-v2)
 * accept an ephemeral analysis blueprint straight from the request body —
 * there is no stored resource behind it, so there is nothing to load and
 * derive a project from the way `requireOwned` does. `blueprint.id` is the
 * only project identity the request carries, and it is what gets authorized.
 *
 * That made each route write its own copy of "pull `blueprint.id`, hope it's
 * there, pass it to `requireProjectAccess`" — eight near-identical call
 * sites that could silently drift out of sync. This is the one place that
 * pattern is allowed to live now, so a future change to how blueprint
 * identity is bound only has to happen here.
 *
 * This is NOT the right helper for a route that loads a *stored* resource by
 * a separate id (e.g. `blueprintId` route param resolved via a repository) —
 * that case must derive its project from the loaded record via
 * `requireOwned`/`createResourceAuthorizer`, per SEC-GENERATION-BLUEPRINT-001.
 */
export async function requireProjectAccessForBlueprint(
  access: Pick<ProjectAccessControl, "requireProjectAccess">,
  req: AccessRequest,
  res: Response,
  blueprint: { id?: string } | null | undefined,
  options: { missingBlueprintMessage?: string; apiKeyCapability?: string } = {},
): Promise<string | null> {
  if (!blueprint?.id) {
    if (!res.headersSent) {
      res.status(400).json({
        success: false,
        error: options.missingBlueprintMessage ?? "Blueprint with id required",
      });
    }
    return null;
  }

  if (
    !(await access.requireProjectAccess(
      req,
      res,
      blueprint.id,
      options.apiKeyCapability,
    ))
  ) {
    return null;
  }

  return blueprint.id;
}
