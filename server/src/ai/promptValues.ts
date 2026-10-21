/**
 * SERIALIZATION-001 — describing a value for a prompt without losing it.
 *
 * Several agents summarised structures with `String(item?.name ?? item)`. When
 * an item had a name that worked; when it did not, the fallback stringified the
 * object itself and the prompt received the literal text `[object Object]`.
 *
 * That is not a cosmetic defect. The downstream model was told a mechanic, a
 * system or a module existed and given nothing about it, so the structure that
 * had been carefully built upstream was replaced by a placeholder at exactly
 * the point it was supposed to be used. Recovering the name is not enough
 * either: the fix has to carry the content when there is no name, which is why
 * this serialises rather than labels.
 */

/** Longest single value rendered into a prompt before it is trimmed. */
const MAX_VALUE_CHARS = 400;

/**
 * Render one value for inclusion in a prompt.
 *
 * Returns null when there is nothing meaningful to say, so callers can drop it
 * rather than emit an empty slot. Never returns `[object Object]`.
 */
export function describeForPrompt(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? truncate(trimmed) : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => describeForPrompt(entry))
      .filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? truncate(parts.join(", ")) : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A name is the most useful single label when one exists.
    if (typeof record.name === "string" && record.name.trim().length > 0) {
      return truncate(record.name.trim());
    }
    // Otherwise carry the content. This is the case that used to become
    // `[object Object]`, discarding everything the structure held.
    try {
      const json = JSON.stringify(value);
      return json && json !== "{}" ? truncate(json) : null;
    } catch {
      // Circular or otherwise unserialisable: say nothing rather than say
      // something meaningless.
      return null;
    }
  }
  return null;
}

/**
 * Render a list of values as a prompt fragment.
 *
 * Empty entries are dropped rather than rendered as blanks, and an entirely
 * empty list returns the caller's placeholder so a prompt never contains a
 * dangling separator.
 */
export function summariseForPrompt(
  values: unknown,
  emptyPlaceholder = "none",
): string {
  const list = Array.isArray(values) ? values : [values];
  const parts = list
    .map((entry) => describeForPrompt(entry))
    .filter((entry): entry is string => entry !== null);
  return parts.length > 0 ? parts.join(", ") : emptyPlaceholder;
}

function truncate(text: string): string {
  return text.length <= MAX_VALUE_CHARS
    ? text
    : `${text.slice(0, MAX_VALUE_CHARS)}…`;
}
