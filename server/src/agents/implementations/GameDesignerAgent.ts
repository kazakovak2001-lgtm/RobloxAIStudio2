import { BaseAgent, type AgentConfig } from "../core/BaseAgent";
import type { AgentInput, GameDesignSeed } from "../../types";

export class GameDesignerAgent extends BaseAgent {
   public readonly name = "GameDesigner";
   public readonly description = "Designs game mechanics and gameplay";
   public readonly inputSchema: Record<string, unknown> = {
     type: "object",
     properties: {
       requirements: { type: "object" },
       plan: { type: "object" },
       gameDesignSeed: { type: "object" },
     },
     required: ["requirements", "plan"],
   };
   public readonly outputSchema: Record<string, unknown> = {
     type: "object",
     properties: {
       gameplay: { type: "object" },
       loop: { type: "string" },
       winCondition: { type: "string" },
       loseCondition: { type: "string" },
       progressionModel: { type: "string" },
       interactionSystems: { type: "array" },
       economyOrScoring: { type: "string" },
     },
     required: ["gameplay"],
   };
   constructor(config?: Partial<AgentConfig>) { super(config); }

   protected async process(input: AgentInput): Promise<Record<string, unknown>> {
     const seed = input.gameDesignSeed as GameDesignSeed | undefined;

     const seedDerived = seed
       ? {
           loop: seed.coreLoop,
           winCondition: "Complete the core loop objective",
           loseCondition: "Fail to maintain the progression constraints",
           progressionModel: "Milestone-based unlocking with escalating difficulty",
           interactionSystems: seed.mechanics.slice(0, 5),
           economyOrScoring: "Points/credits earned from successful interactions",
         }
       : {
           loop: undefined,
           winCondition: "Reach the core objective",
           loseCondition: "Fail the objective within the constraints",
           progressionModel: "Milestone-based unlocking with escalating difficulty",
           interactionSystems: [],
           economyOrScoring: "Points/credits earned",
         };

     return {
       gameplay: {
         mechanics: seed?.mechanics?.map((m: string) => ({
           name: m,
           description: `Core mechanic: ${m}`,
           parameters: {},
         })) ?? [],
         progression: { loop: seedDerived.loop, player_progression_model: seedDerived.progressionModel },
         balance: {
           winCondition: seedDerived.winCondition,
           loseCondition: seedDerived.loseCondition,
           interactionSystems: seedDerived.interactionSystems,
           economyOrScoring: seedDerived.economyOrScoring,
           theme: seed?.theme,
         },
       },
       ...seedDerived,
     };
   }
}
