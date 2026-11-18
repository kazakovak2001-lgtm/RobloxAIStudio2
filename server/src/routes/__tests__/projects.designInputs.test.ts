import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response } from "express";
import { describe, expect, it } from "vitest";
import { SaaSProjectRepository } from "../../platform/projects";
import { describeDesignInputs } from "../../types/projectDesignInputs";
import { InMemoryStorageProvider } from "../../platform/storage/StorageProvider";
import { ProjectDeletionCoordinator } from "../../platform/projects/ProjectDeletionCoordinator";
import { StorageBlueprintRepository } from "../../projects/repository/storageBlueprint.repository";
import {
  createProjectRuntime,
  createProjectsRouter,
  type ProjectRuntime,
} from "../projects";
import {
  buildProjectBlueprintInput,
  projectStatedIntent,
  syncBlueprintWithProjectIntent,
} from "../game-generation";

const emptyHistory = {
  async record() {},
  getByProject: () => [],
  getByPipeline: () => null,
  getAll: () => [],
  prepareProjectDeletion: () => [],
};

function makeRuntime(storage: InMemoryStorageProvider): ProjectRuntime {
  const blueprintRepository = new StorageBlueprintRepository(storage);
  const projectRepository = new SaaSProjectRepository(storage);
  const userOf = (req: Request) => String(req.headers["x-user"] ?? "owner");
  return {
    projectRepository,
    generationHistory: emptyHistory,
    blueprintRepository,
    deletion: new ProjectDeletionCoordinator(storage, [
      blueprintRepository,
      emptyHistory,
    ]),
    storage,
    access: {
      getRequestUserId: async (req: Request) => userOf(req),
      requireAuthenticatedUser: async (req: Request) => userOf(req),
      requireProjectAccess: async (req: Request, res: Response, id: string) => {
        if (projectRepository.verifyOwnership(id, userOf(req))) return true;
        res.status(404).json({ success: false, error: "Project not found" });
        return false;
      },
      hasProjectAccess: async (req: Request, id: string) =>
        projectRepository.verifyOwnership(id, userOf(req)),
    },
  };
}

async function withServer<T>(
  rt: ProjectRuntime,
  cb: (call: Call) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/projects", createProjectsRouter(rt));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const call: Call = async (method, path, body, user = "owner") => {
    const r = await fetch(`http://127.0.0.1:${port}/projects${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-user": user,
        authorization: `Bearer ${user}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      body: (await r.json()) as { data?: any; error?: string },
    };
  };
  try {
    return await cb(call);
  } finally {
    await new Promise<void>((res, rej) =>
      server.close((e) => (e ? rej(e) : res())),
    );
  }
}
type Call = (
  method: string,
  path: string,
  body?: Record<string, unknown>,
  user?: string,
) => Promise<{ status: number; body: { data?: any; error?: string } }>;

describe("project Game Concept / Map & Environment inputs", () => {
  it("persists both sections on create and restores them on reload", async () => {
    const rt = makeRuntime(new InMemoryStorageProvider());
    await withServer(rt, async (call) => {
      const created = await call("POST", "", {
        name: "Sky",
        gameConcept: { vision: " Float ", coreMechanics: ["glide", " "] },
        mapEnvironment: { worldTheme: "Sky islands", mainLocations: ["Hub"] },
      });
      expect(created.status).toBe(200);
      const id = created.body.data.id;
      const got = await call("GET", `/${id}`);
      expect(got.body.data.gameConcept).toEqual({
        vision: "Float",
        coreMechanics: ["glide"],
      });
      expect(got.body.data.mapEnvironment).toEqual({
        worldTheme: "Sky islands",
        mainLocations: ["Hub"],
      });
    });
  });

  it("updates each section independently and merges partial updates", async () => {
    const rt = makeRuntime(new InMemoryStorageProvider());
    await withServer(rt, async (call) => {
      const id = (
        await call("POST", "", {
          name: "G",
          gameConcept: { vision: "v", gameplayLoop: "loop" },
          mapEnvironment: { worldTheme: "t", atmosphere: "misty" },
        })
      ).body.data.id;
      await call("PUT", `/${id}`, { gameConcept: { vision: "v2" } });
      let p = (await call("GET", `/${id}`)).body.data;
      expect(p.gameConcept).toEqual({ vision: "v2", gameplayLoop: "loop" });
      expect(p.mapEnvironment).toEqual({
        worldTheme: "t",
        atmosphere: "misty",
      });
      // Clearing one field, then updating an unrelated project field.
      await call("PUT", `/${id}`, { mapEnvironment: { atmosphere: "" } });
      await call("PUT", `/${id}`, { name: "Renamed" });
      p = (await call("GET", `/${id}`)).body.data;
      expect(p.name).toBe("Renamed");
      expect(p.mapEnvironment).toEqual({ worldTheme: "t" });
      expect(p.gameConcept).toEqual({ vision: "v2", gameplayLoop: "loop" });
    });
  });

  it("preserves concurrent partial edits to the same design section", async () => {
    const rt = makeRuntime(new InMemoryStorageProvider());
    await withServer(rt, async (call) => {
      const id = (
        await call("POST", "", {
          name: "Concurrent",
          gameConcept: { vision: "Initial", gameplayLoop: "Loop" },
        })
      ).body.data.id;
      const [vision, loop] = await Promise.all([
        call("PUT", `/${id}`, {
          gameConcept: { vision: "Updated vision" },
        }),
        call("PUT", `/${id}`, {
          gameConcept: { gameplayLoop: "Updated loop" },
        }),
      ]);
      expect([vision.status, loop.status]).toEqual([200, 200]);
      expect((await call("GET", `/${id}`)).body.data.gameConcept).toEqual({
        vision: "Updated vision",
        gameplayLoop: "Updated loop",
      });
    });
  });

  it("rejects invalid input with 400 and leaves stored state unchanged", async () => {
    const rt = makeRuntime(new InMemoryStorageProvider());
    await withServer(rt, async (call) => {
      const id = (
        await call("POST", "", { name: "G", gameConcept: { vision: "ok" } })
      ).body.data.id;
      for (const bad of [
        { gameConcept: { vision: 5 } },
        { gameConcept: { vision: "x".repeat(2001) } },
        { gameConcept: { coreMechanics: "jump" } },
        { gameConcept: { unknown: "x" } },
        { mapEnvironment: [] },
        { mapEnvironment: { mainLocations: new Array(21).fill("a") } },
      ]) {
        const r = await call("PUT", `/${id}`, bad);
        expect(r.status).toBe(400);
      }
      const p = (await call("GET", `/${id}`)).body.data;
      expect(p.gameConcept).toEqual({ vision: "ok" });
    });
  });

  it("keeps legacy projects readable and refuses cross-owner writes", async () => {
    const storage = new InMemoryStorageProvider();
    const rt = makeRuntime(storage);
    const legacy = await rt.projectRepository.createDurable(
      "owner",
      "Old",
      "rpg",
    );
    await withServer(rt, async (call) => {
      const got = await call("GET", `/${legacy.id}`);
      expect(got.body.data.gameConcept).toBeNull();
      expect(got.body.data.mapEnvironment).toBeNull();
      const foreign = await call(
        "PUT",
        `/${legacy.id}`,
        { gameConcept: { vision: "hijack" } },
        "intruder",
      );
      expect(foreign.status).toBe(404);
      expect(rt.projectRepository.get(legacy.id)?.gameConcept).toBeUndefined();
    });
  });

  // The token is the user id, so the real runtime resolves the same caller the
  // fixture reads from `x-user`.
  const tokenAsUser = {
    validateToken: async (token: string) => ({ userId: token }),
  };
  it.each([
    ["test fixture access", () => makeRuntime(new InMemoryStorageProvider())],
    [
      "createProjectRuntime access",
      () =>
        createProjectRuntime(
          new InMemoryStorageProvider(),
          tokenAsUser as never,
        ),
    ],
  ])(
    "isolates design sections between two projects of different users (%s)",
    async (_name, build) => {
      const rt = build();
      await withServer(rt, async (call) => {
        const aliceSections = {
          gameConcept: { vision: "alice-vision", coreMechanics: ["glide"] },
          mapEnvironment: { worldTheme: "alice-sky", mainLocations: ["Hub"] },
        };
        const bobSections = {
          gameConcept: { vision: "bob-vision", coreMechanics: ["dig"] },
          mapEnvironment: { worldTheme: "bob-caves", mainLocations: ["Mine"] },
        };
        const aliceId = (
          await call("POST", "", { name: "A", ...aliceSections }, "alice")
        ).body.data.id;
        const bobId = (
          await call("POST", "", { name: "B", ...bobSections }, "bob")
        ).body.data.id;
        expect(aliceId).not.toBe(bobId);

        // Each owner reads and updates only their own project.
        const ownA = await call("GET", `/${aliceId}`, undefined, "alice");
        expect(ownA.status).toBe(200);
        expect(ownA.body.data.gameConcept).toEqual(aliceSections.gameConcept);
        expect(ownA.body.data.mapEnvironment).toEqual(
          aliceSections.mapEnvironment,
        );
        const ownB = await call("GET", `/${bobId}`, undefined, "bob");
        expect(ownB.status).toBe(200);
        expect(ownB.body.data.gameConcept).toEqual(bobSections.gameConcept);
        expect(ownB.body.data.mapEnvironment).toEqual(
          bobSections.mapEnvironment,
        );
        const okUpdate = await call(
          "PUT",
          `/${aliceId}`,
          { gameConcept: { vision: "alice-v2" } },
          "alice",
        );
        expect(okUpdate.status).toBe(200);

        // Cross-project reads are refused in both directions and reveal nothing.
        for (const [id, user] of [
          [bobId, "alice"],
          [aliceId, "bob"],
        ] as const) {
          const read = await call("GET", `/${id}`, undefined, user);
          expect(read.status).toBe(404);
          expect(JSON.stringify(read.body)).not.toMatch(
            /alice-|bob-|glide|dig|Hub|Mine/,
          );
        }

        // Cross-project writes are refused in both directions.
        const aliceIntoBob = await call(
          "PUT",
          `/${bobId}`,
          {
            gameConcept: { vision: "alice-hijack" },
            mapEnvironment: { worldTheme: "alice-hijack" },
          },
          "alice",
        );
        const bobIntoAlice = await call(
          "PUT",
          `/${aliceId}`,
          {
            gameConcept: { vision: "bob-hijack" },
            mapEnvironment: { worldTheme: "bob-hijack" },
          },
          "bob",
        );
        expect(aliceIntoBob.status).toBe(404);
        expect(bobIntoAlice.status).toBe(404);

        // Both projects still hold exactly their own data.
        const finalA = (await call("GET", `/${aliceId}`, undefined, "alice"))
          .body.data;
        const finalB = (await call("GET", `/${bobId}`, undefined, "bob")).body
          .data;
        expect(finalA.gameConcept).toEqual({
          vision: "alice-v2",
          coreMechanics: ["glide"],
        });
        expect(finalA.mapEnvironment).toEqual(aliceSections.mapEnvironment);
        expect(finalB.gameConcept).toEqual(bobSections.gameConcept);
        expect(finalB.mapEnvironment).toEqual(bobSections.mapEnvironment);
        // The stored records agree with what the API reports.
        expect(rt.projectRepository.get(bobId)?.gameConcept).toEqual(
          bobSections.gameConcept,
        );
        expect(rt.projectRepository.get(aliceId)?.mapEnvironment).toEqual(
          aliceSections.mapEnvironment,
        );
      });
    },
  );

  it("maps saved sections into the generation blueprint input and prompts", async () => {
    const rt = makeRuntime(new InMemoryStorageProvider());
    const project = await rt.projectRepository.createDurable(
      "owner",
      "G",
      "rpg",
      "desc",
      {
        gameConcept: { vision: "v" },
        mapEnvironment: { worldTheme: "Desert" },
      },
    );
    const input = buildProjectBlueprintInput(project);
    expect(input.game_concept).toEqual({ vision: "v" });
    expect(input.map_environment).toEqual({ worldTheme: "Desert" });
    expect(projectStatedIntent(project).stated.map_environment).toEqual({
      worldTheme: "Desert",
    });
    expect(describeDesignInputs(input as any)).toContain("World theme: Desert");
    const bare = await rt.projectRepository.createDurable("owner", "B", "rpg");
    expect(buildProjectBlueprintInput(bare)).not.toHaveProperty("game_concept");
    expect(describeDesignInputs({})).toBe("");
  });
});

describe("clearing a design section reaches an existing blueprint", () => {
  const CONCEPT = { vision: "V", coreMechanics: ["jump", "dash"] };
  const MAP = { worldTheme: "Desert", mainLocations: ["Oasis", "Ruins"] };

  async function setup(initial: Record<string, unknown> = {}) {
    const storage = new InMemoryStorageProvider();
    const rt = makeRuntime(storage);
    const project = await rt.projectRepository.createDurable(
      "owner",
      "G",
      "rpg",
      "desc",
      initial,
    );
    const blueprints = rt.blueprintRepository;
    const blueprint = await blueprints.createBlueprint(
      "owner",
      buildProjectBlueprintInput(project),
    );
    // What a generation start does for an existing blueprint.
    const regenerate = async () => {
      const current = rt.projectRepository.get(project.id)!;
      const existing = (await blueprints.getBlueprint(blueprint.id))!;
      await syncBlueprintWithProjectIntent(blueprints, existing, current);
      return (await blueprints.getBlueprint(blueprint.id))!;
    };
    return { rt, project, blueprint, regenerate };
  }

  it("removes a fully cleared Game Concept and keeps Map & Environment", async () => {
    const { rt, project, regenerate } = await setup({
      gameConcept: CONCEPT,
      mapEnvironment: MAP,
    });
    await withServer(rt, async (call) => {
      const r = await call("PUT", `/${project.id}`, {
        gameConcept: { vision: "", coreMechanics: [] },
      });
      expect(r.status).toBe(200);
      expect(r.body.data.gameConcept).toBeNull();
    });
    const bp = await regenerate();
    expect(bp.game_concept).toBeUndefined();
    expect(bp.map_environment).toEqual(MAP);
    expect(bp.name).toBe("G");
    expect(bp.description).toBe("desc");
  });

  it("removes a fully cleared Map & Environment and keeps Game Concept", async () => {
    const { rt, project, regenerate } = await setup({
      gameConcept: CONCEPT,
      mapEnvironment: MAP,
    });
    await withServer(rt, async (call) => {
      await call("PUT", `/${project.id}`, {
        mapEnvironment: { worldTheme: "", mainLocations: [] },
      });
    });
    const bp = await regenerate();
    expect(bp.map_environment).toBeUndefined();
    expect(bp.game_concept).toEqual(CONCEPT);
  });

  it("clearing survives a durable round trip of the blueprint", async () => {
    const { rt, project, regenerate, blueprint } = await setup({
      mapEnvironment: MAP,
    });
    await withServer(rt, async (call) => {
      await call("PUT", `/${project.id}`, {
        mapEnvironment: { worldTheme: "", mainLocations: [] },
      });
    });
    await regenerate();
    const reread = JSON.parse(
      JSON.stringify(await rt.blueprintRepository.getBlueprint(blueprint.id)),
    );
    expect(reread).not.toHaveProperty("map_environment");
  });

  it("leaves the blueprint unchanged when a section was never stated", async () => {
    const { project, blueprint, regenerate } = await setup();
    expect(project.gameConcept).toBeUndefined();
    const bp = await regenerate();
    expect(bp).not.toHaveProperty("game_concept");
    expect(bp).not.toHaveProperty("map_environment");
    expect(bp.updated_at).toEqual(blueprint.updated_at);
  });

  it("clearing a never-stated section does not mark it cleared", async () => {
    const { rt, project, regenerate } = await setup({ gameConcept: CONCEPT });
    await withServer(rt, async (call) => {
      await call("PUT", `/${project.id}`, {
        mapEnvironment: { worldTheme: "" },
      });
    });
    expect(
      rt.projectRepository.get(project.id)?.mapEnvironment,
    ).toBeUndefined();
    const bp = await regenerate();
    expect(bp.game_concept).toEqual(CONCEPT);
  });

  it("partial clearing in a non-empty section keeps the remaining fields", async () => {
    const { rt, project, regenerate } = await setup({
      gameConcept: CONCEPT,
      mapEnvironment: MAP,
    });
    await withServer(rt, async (call) => {
      await call("PUT", `/${project.id}`, {
        mapEnvironment: { mainLocations: [] },
        gameConcept: { vision: "" },
      });
    });
    const bp = await regenerate();
    expect(bp.map_environment).toEqual({ worldTheme: "Desert" });
    expect(bp.game_concept).toEqual({ coreMechanics: ["jump", "dash"] });
  });

  it("a cleared section can be filled in again", async () => {
    const { rt, project, regenerate } = await setup({ gameConcept: CONCEPT });
    await withServer(rt, async (call) => {
      await call("PUT", `/${project.id}`, {
        gameConcept: { vision: "", coreMechanics: [] },
      });
      await regenerate();
      const r = await call("PUT", `/${project.id}`, {
        gameConcept: { vision: "New" },
      });
      expect(r.body.data.gameConcept).toEqual({ vision: "New" });
    });
    const bp = await regenerate();
    expect(bp.game_concept).toEqual({ vision: "New" });
  });
});
