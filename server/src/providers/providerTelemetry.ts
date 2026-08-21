/**
 * LLM-LOG-DATA-001 — what a provider call may say about itself.
 *
 * The Ollama provider logged the full request body and the full raw response on
 * every call. That put the user's brief, the internal prompts, the AI context
 * and the generated Luau into backend logs, where they are subject to whatever
 * retention and access the log sink has rather than the project's. It is a
 * privacy and intellectual-property exposure, and it happened on the happy path
 * rather than on error.
 *
 * Telemetry here is shaped so it cannot carry content: the function takes
 * measurements, not payloads. Anything wanting to log a prompt or a completion
 * has to go around this deliberately rather than by reaching for the obvious
 * helper.
 */

export interface ProviderCallTelemetry {
  provider: string;
  model: string;
  /** HTTP status, when the call reached a response. */
  status?: number;
  durationMs: number;
  /** Size of the completion in characters — a measurement, not the text. */
  responseChars?: number;
  tokensUsed?: number;
  finishReason?: string;
}

/** Record that a provider call happened, and how it went. */
export function logProviderCall(telemetry: ProviderCallTelemetry): void {
  const parts = [
    `provider=${telemetry.provider}`,
    `model=${telemetry.model}`,
    telemetry.status !== undefined ? `status=${telemetry.status}` : undefined,
    `durationMs=${telemetry.durationMs}`,
    telemetry.responseChars !== undefined
      ? `responseChars=${telemetry.responseChars}`
      : undefined,
    telemetry.tokensUsed !== undefined
      ? `tokens=${telemetry.tokensUsed}`
      : undefined,
    telemetry.finishReason ? `finish=${telemetry.finishReason}` : undefined,
  ].filter(Boolean);

  console.log(`[llm] ${parts.join(" ")}`);
}

/**
 * Whether this process may log prompt or completion text.
 *
 * Deliberately gated on the environment as well as the flag. An operator who
 * sets the flag on a production host still gets no payloads, because the point
 * is that production logs cannot carry this content at all — not that they are
 * configured not to.
 */
export function payloadLoggingEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.LLM_DEBUG_PAYLOADS === "true"
  );
}

/**
 * A bounded preview for local debugging, or a redaction marker.
 *
 * Never returns the full text even when enabled: a debugging aid does not need
 * the whole completion, and an unbounded preview is the same exposure with a
 * longer name.
 *
 * Line and control characters are escaped before truncation. The source text
 * is a user brief or model output, so it can contain newlines that would
 * otherwise let it forge extra log lines or spoof the fields around it in
 * whatever sink reads this output.
 */
export function previewForDebug(text: string, limit = 400): string {
  if (!payloadLoggingEnabled()) {
    return `[redacted ${text.length} chars]`;
  }
  // eslint-disable-next-line no-control-regex -- escaping control chars is the point
  const escaped = text.replace(/[\x00-\x1f\x7f]/g, (char) => {
    switch (char) {
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      default:
        return `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
    }
  });
  return escaped.length <= limit
    ? escaped
    : `${escaped.slice(0, limit)}…[truncated]`;
}
