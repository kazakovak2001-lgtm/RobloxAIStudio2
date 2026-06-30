/**
 * LLMOutputParser
 *
 * Extracts and validates JSON from raw LLM text responses.
 * LLMs often wrap JSON in markdown fences or add prose before/after —
 * this parser handles all common patterns and returns a typed result.
 *
 * All methods are static and pure — no state, deterministic output.
 */
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

    // 3. Bracket scan: find the first { or [ and attempt parse from there
    const objStart = raw.indexOf("{");
    const arrStart = raw.indexOf("[");

    if (objStart === -1 && arrStart === -1) return null;

    const start =
      objStart === -1
        ? arrStart
        : arrStart === -1
          ? objStart
          : Math.min(objStart, arrStart);

    const slice = raw.slice(start);
    return LLMOutputParser.tryParse(slice);
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
   * If any keys are missing the fallback is returned and the issue is logged.
   */
  static parseAndValidate(
    raw: string,
    required: string[],
    fallback: Record<string, unknown>,
    agentName: string,
  ): Record<string, unknown> {
    const parsed = LLMOutputParser.parseToRecord(raw, fallback);
    const missing = LLMOutputParser.validateKeys(parsed, required);

    if (missing.length > 0) {
      console.warn(
        `[${agentName}] LLM output missing required keys: ${missing.join(", ")} — using partial output`,
      );
      // Merge fallback values for missing keys only
      const merged: Record<string, unknown> = { ...parsed };
      for (const key of missing) {
        merged[key] = fallback[key];
      }
      return merged;
    }

    return parsed;
  }

  private static tryParse(s: string): unknown | null {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
}
