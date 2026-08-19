import type {
  DurableMutation,
  StorageProvider,
} from "../storage/StorageProvider";

const PROJECTS = "projects";

/**
 * PROJECT-ERASURE-1.
 *
 * A store that owns durable records scoped to a project. `prepareProjectDeletion`
 * must not write anything — it only reads the store's own records for the
 * project and returns the mutations that would remove them, mirroring
 * `IBlueprintRepository.prepareVersion`. Building every child mutation this way
 * is what lets the coordinator commit the whole erasure — every child plus the
 * project record itself — as one transaction.
 */
export interface ProjectDeletionChild {
  prepareProjectDeletion(
    projectId: string,
  ): Promise<readonly DurableMutation[]> | readonly DurableMutation[];
}

/**
 * Deletes a project and every directly project-owned durable record found at
 * this deletion boundary, as a single atomic transaction.
 *
 * The previous delete removed only the "projects" record; blueprint, blueprint
 * version, generation execution, blueprint change proposal and generation
 * history records referencing the project by id all survived as orphans no
 * project-scoped read path could reach again, but that nothing swept either.
 *
 * Committing every child mutation and the project delete in one
 * `applyDurableBatch` call — rather than deleting children first and the
 * project last as separate writes — means a failure anywhere in the batch
 * leaves the project and every child record exactly as they were: there is no
 * intermediate state a crash or a rejected write could leave behind, and no
 * partial cleanup a caller could mistake for success. Retrying after a
 * failure re-runs the same batch; retrying after a completed deletion finds
 * no project record and is a no-op.
 */
export class ProjectDeletionCoordinator {
  constructor(
    private readonly storage: StorageProvider,
    private readonly children: readonly ProjectDeletionChild[],
  ) {}

  /** Resolves false when the project does not exist; never partially deletes. */
  async deleteProject(projectId: string): Promise<boolean> {
    if (!this.storage.get(PROJECTS, projectId)) return false;

    const mutations: DurableMutation[] = [];
    for (const child of this.children) {
      mutations.push(...(await child.prepareProjectDeletion(projectId)));
    }
    mutations.push({
      operation: "delete",
      collection: PROJECTS,
      id: projectId,
    });

    await this.storage.applyDurableBatch(mutations);
    return true;
  }
}
