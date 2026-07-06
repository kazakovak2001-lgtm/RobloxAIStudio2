/**
 * ResponseNormalizer.ts — Normalizes provider responses + JSON extraction.
 */

import type { ProviderResponse, NormalizedResponse } from "./types";

export class ResponseNormalizer {
  normalize(response: ProviderResponse): NormalizedResponse {
    let json: unknown | undefined;
    try {
      json = JSON.parse(response.content);
    } catch {
      /* not JSON */
    }
    return {
      success: response.finishReason === "complete",
      content: response.content,
      json,
      provider: response.provider,
      model: response.model,
      tokensUsed: response.tokensUsed,
      durationMs: response.durationMs,
    };
  }

  extractJSON(content: string): {
    success: boolean;
    data?: unknown;
    error?: string;
  } {
    // Try direct parse
    try {
      return { success: true, data: JSON.parse(content) };
    } catch {
      /* try extraction */
    }
    // Try to find JSON block in content
    const jsonMatch =
      content.match(/```json\s*([\s\S]*?)\s*```/) ??
      content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const candidate = jsonMatch[1] ?? jsonMatch[0];
      try {
        return { success: true, data: JSON.parse(candidate) };
      } catch {
        /* failed */
      }
    }
    return { success: false, error: "No valid JSON found in response" };
  }

  validateSchema(
    data: unknown,
    requiredFields: string[],
  ): { valid: boolean; missing: string[] } {
    if (!data || typeof data !== "object")
      return { valid: false, missing: requiredFields };
    const obj = data as Record<string, unknown>;
    const missing = requiredFields.filter(
      (f) => !(f in obj) || obj[f] === undefined,
    );
    return { valid: missing.length === 0, missing };
  }
}
