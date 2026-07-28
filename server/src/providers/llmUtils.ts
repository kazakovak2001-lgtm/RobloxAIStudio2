/**
 * LLM utility functions — timeout, retry, centralized error handling.
 */

import { LLMError } from "../types/llm";

/**
 * Wrap a fetch call with timeout.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new LLMError(
        `Request timed out after ${timeoutMs}ms`,
        "unknown",
        undefined,
        true,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry logic with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  provider: string,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        err instanceof LLMError ? err.retryable : isTransientError(lastError);
      if (!isRetryable || attempt >= maxRetries) break;
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (lastError instanceof LLMError) throw lastError;
  throw new LLMError(
    lastError?.message ?? "Unknown error",
    provider,
    undefined,
    false,
  );
}

function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("502")
  );
}

/**
 * Parse an error response from a provider API.
 */
export function parseProviderError(
  provider: string,
  status: number,
  body: unknown,
): LLMError {
  const message =
    typeof body === "object" && body !== null
      ? ((body as Record<string, unknown>).error?.toString() ??
        (body as Record<string, unknown>).message?.toString() ??
        `HTTP ${status}`)
      : `HTTP ${status}`;
  const retryable = status === 429 || status === 502 || status === 503;
  return new LLMError(
    `${provider} API error: ${message}`,
    provider,
    status,
    retryable,
  );
}
