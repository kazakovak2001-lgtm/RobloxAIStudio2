import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_CALL_DEADLINE_MARGIN_MS,
  AgentCallDeadlineError,
  BaseAgent,
  type AgentInput,
  type DeadlineAwareLLM,
} from "../BaseAgent";
import { requestBudgetFor } from "../../../providers/llmUtils";
import { OpenAIProvider } from "../../../providers/openai";
import { OllamaProvider } from "../../../providers/ollama";
import { GroqProvider } from "../../../providers/groq";

/** Minimal agent whose single step is one LLM call. */
class ProbeAgent extends BaseAgent {
  readonly name = "Probe";
  readonly description = "AGENT-TIMEOUT-1 probe";
  readonly inputSchema = {};
  readonly outputSchema = {};
  calls = 0;

  protected async process(_input: AgentInput) {
    this.calls++;
    const text = await this.llm!.generate("probe");
    return { text };
  }
}

describe("AGENT-TIMEOUT-1 provider request budget", () => {
  it("counts every attempt and every backoff between them", () => {
    expect(requestBudgetFor(30000, 0)).toBe(30000);
    // 3 attempts × 30s + 1s + 2s backoff.
    expect(requestBudgetFor(30000, 2)).toBe(93000);
    // 4 attempts × 15s + 1s + 2s + 4s backoff.
    expect(requestBudgetFor(15000, 3)).toBe(67000);
  });

  it("is reported by the real providers from their own defaults", () => {
    expect(new OpenAIProvider({ apiKey: "k" }).requestBudgetMs()).toBe(93000);
    // Ollama: 2 attempts × 120s + 1s backoff.
    expect(new OllamaProvider().requestBudgetMs()).toBe(241000);
    expect(new GroqProvider({ apiKey: "k" }).requestBudgetMs()).toBe(67000);
  });

  it("follows a longer configured timeout, so a slow model is not cut short", () => {
    const slow = new OllamaProvider({ timeout: 600000 });
    expect(slow.requestBudgetMs()).toBe(1201000);
  });
});

describe("AGENT-TIMEOUT-1 agent call deadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fails a step whose provider never answers, once, without retrying", async () => {
    const agent = new ProbeAgent();
    const hung: DeadlineAwareLLM = {
      generate: () => new Promise<string>(() => {}),
      requestBudgetMs: () => 1000,
    };
    agent.setLLM(hung);

    const pending = agent.execute({});
    await vi.advanceTimersByTimeAsync(1000 + AGENT_CALL_DEADLINE_MARGIN_MS);
    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(agent.calls).toBe(1);
    expect(result.error).toBe(
      "Probe LLM call exceeded its 6000ms deadline (provider budget 1000ms)",
    );
  });

  it("does not fire while the provider is still inside its budget", async () => {
    const agent = new ProbeAgent();
    const slow: DeadlineAwareLLM = {
      generate: () =>
        new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 5900)),
      requestBudgetMs: () => 1000,
    };
    agent.setLLM(slow);

    const pending = agent.execute({});
    await vi.advanceTimersByTimeAsync(5900);
    const result = await pending;

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ text: "ok" });
  });

  it("leaves a provider without a budget unwrapped", async () => {
    const agent = new ProbeAgent();
    const legacy: DeadlineAwareLLM = {
      generate: () =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve("late"), 10 * 60 * 1000),
        ),
    };
    agent.setLLM(legacy);

    const pending = agent.execute({});
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect((await pending).data).toEqual({ text: "late" });
  });

  it("refuses an invalid budget instead of running without a deadline", async () => {
    const agent = new ProbeAgent();
    agent.setLLM({
      generate: () => Promise.resolve("never used"),
      requestBudgetMs: () => Number.NaN,
    });

    const pending = agent.execute({});
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Probe provider reported an invalid request budget: NaN",
    );
  });

  it("is a distinguishable error type", () => {
    const error = new AgentCallDeadlineError("Probe", 6000, 1000);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AgentCallDeadlineError");
    expect(error.deadlineMs).toBe(6000);
  });
});
