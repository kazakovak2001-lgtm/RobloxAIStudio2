import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response } from "express";
import { describe, expect, it } from "vitest";
import { SaaSProjectRepository } from "../../platform/projects";
import {
  DurableStorageError,
  InMemoryStorageProvider,
} from "../../platform/storage/StorageProvider";
import type { GenerationHistoryRepository } from "../../projects/repository/generationHistory.repository";
import { StorageBlueprintRepository } from "../../projects/repository/storageBlueprint.repository";
import type { CreateBlueprintInput } from "../../projects/types/blueprint";
import { createProjectsRouter, type ProjectRuntime } from "../projects";

class ControlledMutationStorage extends InMemoryStorageProvider {
  rejectSet = false;
  rejectDelete = false;

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

  override async deleteDurable(
    collection: string,
    id: string,
  ): Promise<boolean> {
    if (this.rejectDelete) {
      throw new DurableStorageError("injected delete rejection", "delete");
    }
    return super.deleteDurable(collection, id);
  }
}

const emptyHistory: GenerationHistoryRepository = {
  record() {},
  getByProject: () => [],
  getByPipeline: () => null,
  getAll: () => [],
};

function runtime(storage: ControlledMutationStorage): ProjectRuntime {
  return {
    projectRepository: new SaaSProjectRepository(storage),
    generationHistory: emptyHistory,
    access: {
      getRequestUserId: () => "owner",
      requireAuthenticatedUser: () => "owner",
      requireProjectAccess: (
        _req: Request,
        _res: Response,
        projectId: string,
      ) => storage.get("projects", projectId) !== null,
    },
  };
}

async function withServer<T>(
  projectRuntime: ProjectRuntime,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/projects", createProjectsRouter(projectRuntime));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;

  try {
    return await callback(`http://127.0.0.1:${port}/projects`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function mutation(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function blueprintInput(projectId = "project-1"): CreateBlueprintInput {
  return {
    project_id: projectId,
    name: "Durable Blueprint",
    description: "Blueprint durability fixture",
    game_type: "obby",
    genre: ["adventure"],
    target_audience: "all",
    difficulty: "medium",
    estimated_players: "small-group",
    gameplay: {
      mechanics: [],
      progression: {},
      balance: {},
    },
    ui_layouts: [],
    architecture: {
      client_architecture: {},
      server_architecture: {},
      networking: {},
    },
    assets: {
      models: [],
      textures: [],
      sounds: [],
      animations: [],
    },
    code_spec: {
      modules: [],
      patterns: [],
    },
  };
}

describe("projects durable HTTP acknowledgement", () => {
  it("returns 503 and exposes no project when create persistence is rejected", async () => {
    const storage = new ControlledMutationStorage();
    storage.rejectSet = true;
    const projectRuntime = runtime(storage);

    await withServer(projectRuntime, async (baseUrl) => {
      const result = await mutation(baseUrl, "POST", {
        name: "Uncommitted",
        genre: "adventure",
        difficulty: "hard",
      });

      expect(result).toMatchObject({
        status: 503,
        body: {
          success: false,
          error: "Durable storage is temporarily unavailable",
        },
      });
      expect(storage.count("projects")).toBe(0);
    });
  });

  it("returns 503 and retains the previous project after update rejection", async () => {
    const storage = new ControlledMutationStorage();
    const projectRuntime = runtime(storage);
    const project = projectRuntime.projectRepository.create(
      "owner",
      "Before",
      "obby",
    );
    storage.rejectSet = true;

    await withServer(projectRuntime, async (baseUrl) => {
      const result = await mutation(`${baseUrl}/${project.id}`, "PUT", {
        name: "After",
      });

      expect(result.status).toBe(503);
      expect(projectRuntime.projectRepository.get(project.id)?.name).toBe(
        "Before",
      );
    });
  });

  it("returns 503 and retains the project after delete rejection", async () => {
    const storage = new ControlledMutationStorage();
    const projectRuntime = runtime(storage);
    const project = projectRuntime.projectRepository.create(
      "owner",
      "Keep",
      "simulator",
    );
    storage.rejectDelete = true;

    await withServer(projectRuntime, async (baseUrl) => {
      const result = await mutation(`${baseUrl}/${project.id}`, "DELETE");

      expect(result.status).toBe(503);
      expect(projectRuntime.projectRepository.get(project.id)).toEqual(project);
    });
  });

  it("makes an acknowledged create immediately readable", async () => {
    const storage = new ControlledMutationStorage();
    const projectRuntime = runtime(storage);

    await withServer(projectRuntime, async (baseUrl) => {
      const result = await mutation(baseUrl, "POST", {
        name: "Committed",
        genre: "rpg",
        gameType: "quest",
      });

      expect(result.status).toBe(200);
      const data = result.body.data as { id: string; name: string };
      expect(projectRuntime.projectRepository.get(data.id)?.name).toBe(
        "Committed",
      );
      expect(storage.count("projects")).toBe(1);
    });
  });
});

describe("blueprint durable repository acknowledgement", () => {
  it("does not expose a blueprint when create acknowledgement is rejected", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new StorageBlueprintRepository(storage);
    storage.rejectSet = true;

    await expect(
      repository.createBlueprint("owner", blueprintInput()),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(storage.count("game_blueprints")).toBe(0);
  });

  it("retains the previous blueprint when update acknowledgement is rejected", async () => {
    const storage = new ControlledMutationStorage();
    const repository = new StorageBlueprintRepository(storage);
    const blueprint = await repository.createBlueprint(
      "owner",
      blueprintInput(),
    );
    storage.rejectSet = true;

    await expect(
      repository.updateBlueprint(blueprint.id, { name: "Uncommitted" }),
    ).rejects.toMatchObject({
      code: "DURABLE_STORAGE_MUTATION_FAILED",
      operation: "set",
    });
    expect(await repository.getBlueprint(blueprint.id)).toEqual(blueprint);
  });
});
