/**
 * FP-1C. LuaGeneratorAgent.outputSchema must describe the REAL raw response
 * contract, because it is handed to providers as a decoding constraint.
 *
 * The schema previously declared `lua_generator: { type: "object" }`. Under
 * constrained decoding that permitted any nesting, and a live run produced
 * syntactically valid but structurally degenerate output — one truncated code
 * string followed by junk keys. These tests pin the shape, and pin that
 * schema-valid output still flows through the existing normalizer into
 * PlayableLuaScript without a second representation.
 *
 * The schema is validated here by a small structural checker rather than a
 * JSON Schema library: none is installed, and the subset in use (type,
 * required, properties, items, additionalProperties, minItems, minLength) is
 * exactly what these tests need to assert.
 */

import { describe, expect, it } from "vitest";
import { LuaGeneratorAgent } from "../agents/implementations/LuaGeneratorAgent";
import { normalizeLuaScripts } from "../types/playableLua";

const schema = new LuaGeneratorAgent().outputSchema;

/** Minimal validator for the JSON Schema subset this contract uses. */
function validate(node: any, value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  if (node.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [`${path}: expected object`];
    }
    const record = value as Record<string, unknown>;
    for (const key of node.required ?? []) {
      if (!(key in record)) errors.push(`${path}.${key}: required`);
    }
    for (const [key, child] of Object.entries(record)) {
      const childSchema = node.properties?.[key];
      if (!childSchema) {
        if (node.additionalProperties === false) {
          errors.push(`${path}.${key}: additional property not allowed`);
        }
        continue;
      }
      errors.push(...validate(childSchema, child, `${path}.${key}`));
    }
    return errors;
  }
  if (node.type === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (node.minItems !== undefined && value.length < node.minItems) {
      errors.push(`${path}: fewer than ${node.minItems} items`);
    }
    value.forEach((item, i) =>
      errors.push(...validate(node.items, item, `${path}[${i}]`)),
    );
    return errors;
  }
  if (node.type === "string") {
    if (typeof value !== "string") return [`${path}: expected string`];
    if (node.minLength !== undefined && value.length < node.minLength) {
      errors.push(`${path}: shorter than ${node.minLength}`);
    }
    return errors;
  }
  return errors;
}

const valid = {
  lua_generator: {
    server: [{ name: "World.server.lua", code: "local a = 1" }],
    client: [{ name: "Hud.client.lua", code: "local b = 2" }],
    shared: [],
  },
};

describe("the schema is no longer an unconstrained object", () => {
  it("constrains lua_generator rather than declaring a bare object", () => {
    const lua = (schema as any).properties.lua_generator;
    expect(lua.type).toBe("object");
    expect(lua.additionalProperties).toBe(false);
    expect(lua.required).toEqual(expect.arrayContaining(["server", "client"]));
    expect(lua.properties.server.type).toBe("array");
    expect(lua.properties.client.type).toBe("array");
  });

  it("requires name and code on every script entry", () => {
    const entry = (schema as any).properties.lua_generator.properties.server
      .items;
    expect(entry.required).toEqual(["name", "code"]);
    expect(entry.additionalProperties).toBe(false);
    expect(entry.properties.name.type).toBe("string");
    expect(entry.properties.code.type).toBe("string");
  });
});

describe("valid canonical output is accepted", () => {
  it("accepts server and client entries", () => {
    expect(validate(schema, valid)).toEqual([]);
  });

  it("accepts output with shared omitted entirely (shared is optional)", () => {
    expect(
      validate(schema, {
        lua_generator: {
          server: valid.lua_generator.server,
          client: valid.lua_generator.client,
        },
      }),
    ).toEqual([]);
  });

  it("accepts populated shared entries", () => {
    expect(
      validate(schema, {
        lua_generator: {
          ...valid.lua_generator,
          shared: [{ name: "Util", code: "return {}" }],
        },
      }),
    ).toEqual([]);
  });
});

describe("degenerate shapes are schema-invalid", () => {
  it("rejects a missing code property", () => {
    const bad = {
      lua_generator: {
        server: [{ name: "World.server.lua" }],
        client: valid.lua_generator.client,
      },
    };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("code: required"),
    );
  });

  it("rejects a missing name property", () => {
    const bad = {
      lua_generator: {
        server: [{ code: "local a = 1" }],
        client: valid.lua_generator.client,
      },
    };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("name: required"),
    );
  });

  it("makes scalar junk keys inside lua_generator impossible", () => {
    // The exact degeneration observed live.
    const bad = {
      lua_generator: {
        server: valid.lua_generator.server,
        client: valid.lua_generator.client,
        "clearTerrain = function() terrain:Clear() end": "",
      },
    };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("additional property not allowed"),
    );
  });

  it("rejects a scalar where a script array belongs", () => {
    const bad = {
      lua_generator: {
        server: "local a = 1",
        client: valid.lua_generator.client,
      },
    };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("expected array"),
    );
  });

  it("rejects a scalar entry inside a script array", () => {
    const bad = {
      lua_generator: {
        server: ["local a = 1"],
        client: valid.lua_generator.client,
      },
    };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("expected object"),
    );
  });

  it("rejects an empty server array", () => {
    const bad = {
      lua_generator: { server: [], client: valid.lua_generator.client },
    };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("fewer than 1 items"),
    );
  });

  it("rejects a missing client collection", () => {
    const bad = { lua_generator: { server: valid.lua_generator.server } };
    expect(validate(schema, bad)).toContainEqual(
      expect.stringContaining("client: required"),
    );
  });

  it("rejects junk at the top level", () => {
    expect(validate(schema, { ...valid, generatedCode: {} })).toContainEqual(
      expect.stringContaining("additional property not allowed"),
    );
  });
});

describe("schema-valid output still normalizes into PlayableLuaScript", () => {
  it("produces the existing representation with no second shape", () => {
    const scripts = normalizeLuaScripts(valid);
    expect(scripts).toEqual([
      { path: "ServerScriptService/World.server.lua", content: "local a = 1" },
      { path: "StarterPlayerScripts/Hud.client.lua", content: "local b = 2" },
    ]);
  });

  it("routes shared entries to ReplicatedStorage/Shared", () => {
    const scripts = normalizeLuaScripts({
      lua_generator: {
        ...valid.lua_generator,
        shared: [{ name: "Util", code: "return {}" }],
      },
    });
    expect(scripts.map((s) => s.path)).toContain(
      "ReplicatedStorage/Shared/Util.lua",
    );
  });

  it("every schema-valid entry satisfies the normalizer's name/code branch", () => {
    // The normalizer accepts {path,content} OR {name,code}; the schema pins the
    // latter, so a schema-valid document can never hit the throwing branch.
    expect(() => normalizeLuaScripts(valid)).not.toThrow();
  });
});
