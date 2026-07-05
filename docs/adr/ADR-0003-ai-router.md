# ADR-0003: AI Router & Provider Abstraction

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Engineering Team

---

## Context

Multiple LLM providers (OpenAI, Anthropic, Ollama) need to be supported without coupling agents to a specific provider. Future requirements include per-agent provider routing and failover.

## Decision

Implement `AIRouter` (server/src/ai/router.ts) with rule-based resolution:

1. Each provider is registered with a string ID
2. `AIRoutingRule` maps agentType → preferredProvider → fallbackProvider
3. Resolution chain: rule.preferred → rule.fallback → defaultProvider → null
4. `LLMProviderFactory` reads env vars (OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_URL) with strict priority order

All agents receive LLM via `BaseAgent.setLLM()` called by `AgentRegistry.setLLM(provider)` at startup.

## Consequences

**Positive:** Provider-agnostic agents; single env var change switches the whole pipeline
**Negative:** No per-agent routing active yet (all agents share one provider)

## Alternatives Considered

| Alternative                        | Reason Not Chosen                          |
| ---------------------------------- | ------------------------------------------ |
| Hardcoded provider per agent       | Inflexible; env-based selection is simpler |
| Runtime provider selection via API | Premature for v0.x                         |
