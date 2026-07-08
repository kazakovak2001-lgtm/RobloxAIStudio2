/**
 * Prompt Engine — public API
 */
export {
  PromptEngine,
  type ManagedPrompt,
  type PromptMetadata,
  type RenderResult,
  type ValidationResult,
} from "./PromptEngine";
export { DEFAULT_PROMPTS } from "./defaultPrompts";

import { PromptEngine } from "./PromptEngine";
import { DEFAULT_PROMPTS } from "./defaultPrompts";

/**
 * Create a PromptEngine pre-loaded with all default pipeline prompts.
 */
export function createDefaultPromptEngine(): PromptEngine {
  const engine = new PromptEngine();
  for (const prompt of DEFAULT_PROMPTS) {
    engine.register(prompt);
  }
  return engine;
}
