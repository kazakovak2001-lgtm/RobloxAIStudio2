import { AgentBase } from "../base/AgentBase";
import type { AgentExecutionResult, SchemaDefinition } from "../types";

interface DatabaseInput {
  prompt: string;
}

interface DatabaseOutput {
  collections: string[];
  indexes: string[];
  relationships: string[];
}

export class DatabaseAgent extends AgentBase<DatabaseInput, DatabaseOutput> {
  readonly name = "DatabaseAgent";
  readonly description =
    "Defines the persistence model and data relationships for future backend integration.";
  readonly inputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      prompt: { type: "string" },
    },
    required: ["prompt"],
  };

  readonly outputSchema: SchemaDefinition = {
    type: "object",
    properties: {
      collections: { type: "array", items: { type: "string" } },
      indexes: { type: "array", items: { type: "string" } },
      relationships: { type: "array", items: { type: "string" } },
    },
    required: ["collections", "indexes", "relationships"],
  };

  async execute(
    input: DatabaseInput
  ): Promise<AgentExecutionResult<DatabaseOutput>> {
    const output: DatabaseOutput = {
      collections: ["Players", "Inventories", "Progressions"],
      indexes: ["playerId", "progressionId"],
      relationships: ["Player -> Inventory", "Player -> Progression"],
    };

    const validation = this.validate(input, output);
    return {
      agentName: this.name,
      success: validation.valid,
      output,
      validation,
      attempts: 1,
      durationMs: 0,
    };
  }
}
