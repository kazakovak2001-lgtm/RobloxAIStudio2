/**
 * LLMOutputParser
 *
 * Extracts and validates JSON from raw LLM text responses.
 * LLMs often wrap JSON in markdown fences or add prose before/after —
 * this parser handles all common patterns and returns a typed result.
 *
 * All methods are static and pure — no state, deterministic output.
 */

/**
 * How much of an accepted parse came from deterministic fallback content.
 *
 * `none`    — every value came from the model.
 * `partial` — the model's output parsed, but required keys were repaired.
 * `full`    — the output was unusable and the whole fallback was substituted.
 */
export type FallbackUsage = "none" | "partial" | "full";

export interface ParsedLLMOutput {
  data: Record<string, unknown>;
  fallbackUsage: FallbackUsage;
  /** Keys whose values came from the fallback. Diagnostic, never content. */
  fallbackKeys: string[];
}

export class LLMOutputParser {
  /**
   * Extract the first valid JSON object or array from a raw LLM string.
   * Tries markdown fence extraction first, then bracket-scan fallback.
   * Returns null if no valid JSON is found.
   */
  static extractJSON(raw: string): unknown | null {
    if (!raw || raw.trim().length === 0) return null;

    // 1. Strip markdown code fences: ```json ... ``` or ``` ... ```
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      const candidate = fenceMatch[1].trim();
      const parsed = LLMOutputParser.tryParse(candidate);
      if (parsed !== null) return parsed;
    }

    // 2. Try the whole trimmed string directly
    const direct = LLMOutputParser.tryParse(raw.trim());
    if (direct !== null) return direct;

    // 3. Balanced scan from each opening bracket.
    //
    // LLM-PARSER-001. This used to slice from the first bracket to the end of
    // the string and parse that, so any trailing prose destroyed a response
    // whose JSON was perfectly good:
    //
    //   {"valid":"json"}
    //   Here is an explanation of what I did...
    //
    // Scanning to the matching close finds the object and leaves the prose
    // behind. It also refuses to invent one: a response truncated before its
    // closing bracket has no balanced candidate and returns null rather than
    // parsing a fragment.
    for (const start of LLMOutputParser.bracketStarts(raw)) {
      const candidate = LLMOutputParser.balancedSlice(raw, start);
      if (candidate === null) continue;
      const parsed = LLMOutputParser.tryParse(candidate);
      if (parsed !== null) return parsed;
    }

    return null;
  }

  /** Every position where a JSON value could begin, earliest first. */
  private static bracketStarts(raw: string): number[] {
    const starts: number[] = [];
    for (let index = 0; index < raw.length; index += 1) {
      const char = raw[index];
      if (char === "{" || char === "[") starts.push(index);
    }
    return starts;
  }

  /**
   * The substring from `start` to its matching bracket, or null when there is
   * none.
   *
   * String literals are tracked so a brace inside one does not change depth.
   * That is not hypothetical here: generated Luau is delivered inside JSON
   * strings and is full of braces.
   */
  private static balancedSlice(raw: string, start: number): string | null {
    const open = raw[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        // Only meaningful inside a string, but harmless outside one, where a
        // backslash cannot legally appear anyway.
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) return raw.slice(start, index + 1);
      }
    }

    // Ran out of input with brackets still open: the response was cut off.
    return null;
  }

  /**
   * Parse and coerce the LLM response to a plain Record.
   * If the response is a JSON array at the top level it is wrapped in
   * `{ items: [...] }` to keep the agent contract consistent.
   * Returns the fallback object if parsing fails.
   */
  static parseToRecord(
    raw: string,
    fallback: Record<string, unknown>,
  ): Record<string, unknown> {
    const value = LLMOutputParser.extractJSON(raw);
    if (value === null) return fallback;

    if (Array.isArray(value)) {
      return { items: value };
    }

    if (typeof value === "object" && value !== null) {
      return value as Record<string, unknown>;
    }

    return fallback;
  }

  /**
   * Validate that all required keys are present in the parsed object.
   * Returns a list of missing key names (empty = valid).
   */
  static validateKeys(
    obj: Record<string, unknown>,
    required: string[],
  ): string[] {
    return required.filter((k) => !(k in obj));
  }

  /**
   * Parse the response and apply a required-key check.
   * If any keys are missing, fallback values fill the gaps and a warning is logged.
   */
  /**
   * Parse an LLM response and report, structurally, how much of the accepted
   * result the model actually authored.
   *
   * PROVIDER-1B. "The LLM was called" is not "the LLM authored the artifact".
   * Deterministic fallback content enters here in two distinct ways and
   * neither was previously visible to the caller:
   *
   *   full    — the response could not be parsed to an object at all, so the
   *             entire canned fallback is returned. Every required key is then
   *             present, so nothing downstream notices.
   *   partial — the response parsed, but a required key was missing and was
   *             repaired from the fallback.
   *
   * Reported as structured metadata rather than inferred from the content,
   * because canned and generated values are not distinguishable by inspection.
   */
  static parseWithProvenance(
    raw: string,
    required: string[],
    fallback: Record<string, unknown>,
    agentName: string,
  ): ParsedLLMOutput {
    const value = LLMOutputParser.extractJSON(raw);

    // Identity, not equality: parseToRecord hands back the fallback object
    // itself when the response is unusable, which is the only reliable signal
    // that nothing in the result came from the model.
    const unusable =
      value === null || (typeof value !== "object" && !Array.isArray(value));

    if (unusable) {
      console.warn(
        `[${agentName}] LLM output could not be parsed — using deterministic fallback`,
      );
      return {
        data: LLMOutputParser.normalizeKeys(fallback),
        fallbackUsage: "full",
        fallbackKeys: Object.keys(fallback),
      };
    }

    const parsed = Array.isArray(value)
      ? { items: value }
      : (value as Record<string, unknown>);
    const normalized = LLMOutputParser.normalizeKeys(parsed);
    const missing = LLMOutputParser.validateKeys(normalized, required);

    if (missing.length > 0) {
      console.warn(
        `[${agentName}] LLM output missing required keys: ${missing.join(", ")} — using partial output`,
      );
      const merged: Record<string, unknown> = { ...normalized };
      for (const key of missing) {
        merged[key] = fallback[key];
      }
      return { data: merged, fallbackUsage: "partial", fallbackKeys: missing };
    }

    return { data: normalized, fallbackUsage: "none", fallbackKeys: [] };
  }

  /**
   * Behaviour-preserving wrapper over `parseWithProvenance`. Callers that do
   * not need provenance keep the original contract.
   */
  static parseAndValidate(
    raw: string,
    required: string[],
    fallback: Record<string, unknown>,
    agentName: string,
  ): Record<string, unknown> {
    return LLMOutputParser.parseWithProvenance(
      raw,
      required,
      fallback,
      agentName,
    ).data;
  }

  /**
   * Normalize known key aliases to canonical names.
   * Handles models that return slightly different key naming.
   */
  static normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const aliases: Record<string, string> = {
      gameplaySystems: "gameplay",
      gameplaysystems: "gameplay",
      game_play: "gameplay",
      gameDesign: "gameplay",
      game_design: "gameplay",
      coreLoop: "loop",
      core_loop: "loop",
      win_condition: "winCondition",
      lose_condition: "loseCondition",
      progression_model: "progressionModel",
      interaction_systems: "interactionSystems",
      economy_or_scoring: "economyOrScoring",
    };

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const canonical = aliases[key] ?? key;
      if (!(canonical in result)) {
        result[canonical] = value;
      }
    }
    return result;
  }

  /**
   * Build a stricter retry prompt that instructs the LLM to return only JSON.
   * Appends the original prompt with explicit repair instructions.
   */
  static buildRetryPrompt(
    originalPrompt: string,
    previousRaw: string,
    requiredKeys: string[],
  ): string {
    const truncated = previousRaw.slice(0, 300);
    return (
      `${originalPrompt}\n\n` +
      `IMPORTANT: Your previous response was not valid JSON or was missing required fields.\n` +
      `Required top-level keys: ${requiredKeys.join(", ")}\n` +
      `Previous response (truncated): ${truncated}\n\n` +
      `Respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.`
    );
  }

  private static tryParse(s: string): unknown | null {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
}
