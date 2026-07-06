/**
 * LuaFormatter.ts — Deterministic Lua code formatting. No external dependencies.
 */

export class LuaFormatter {
  private indentStr: string;

  constructor(indentSize = 4) {
    this.indentStr = " ".repeat(indentSize);
  }

  format(source: string): string {
    const lines = source.split("\n");
    const result: string[] = [];
    let depth = 0;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) {
        result.push("");
        continue;
      }

      // Decrease indent before line if it's a closer
      if (this.isCloser(trimmed)) depth = Math.max(0, depth - 1);

      result.push(this.indentStr.repeat(depth) + trimmed);

      // Increase indent after line if it's an opener
      if (this.isOpener(trimmed) && !this.isSingleLineBlock(trimmed)) depth++;
    }

    // Normalize: remove trailing whitespace, ensure single newline at end
    return (
      result
        .map((l) => l.trimEnd())
        .join("\n")
        .trimEnd() + "\n"
    );
  }

  private isOpener(line: string): boolean {
    const stripped = line
      .replace(/--.*$/, "")
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''");
    return (
      /\b(function|if|for|while|repeat|do)\b/.test(stripped) &&
      !/\bend\b/.test(stripped) &&
      !/\buntil\b/.test(stripped)
    );
  }

  private isCloser(line: string): boolean {
    return /^\s*(end|until|else|elseif)/.test(line);
  }

  private isSingleLineBlock(line: string): boolean {
    const stripped = line.replace(/--.*$/, "");
    const opens = (
      stripped.match(/\b(function|if|for|while|repeat|do)\b/g) ?? []
    ).length;
    const closes = (stripped.match(/\b(end|until)\b/g) ?? []).length;
    return opens > 0 && closes >= opens;
  }
}
