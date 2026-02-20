import type { FormatConfig } from "./types.ts";

export function lastLineLength(text: string): number {
  const lines = text.split("\n");
  return lines.at(-1)?.length ?? 0;
}

export function maxLineLength(text: string): number {
  return Math.max(...text.split("\n").map((line) => line.length));
}

export function indentUnit(config: FormatConfig): string {
  if (config.indent.type === "tab") return "\t".repeat(config.indent.count);
  return " ".repeat(config.indent.count);
}

export function indentGeneratedText(chunks: Generator<string>, prefix: string): string {
  let result = "";
  let pending = "";
  for (const chunk of chunks) {
    pending += chunk;
    while (true) {
      const newlineIndex = pending.indexOf("\n");
      if (newlineIndex < 0) break;
      result += indentLine(pending.slice(0, newlineIndex), prefix) + "\n";
      pending = pending.slice(newlineIndex + 1);
    }
  }
  return result + indentLine(pending, prefix);
}

function indentLine(line: string, prefix: string): string {
  const trimmed = line.trim();
  return trimmed.length > 0 ? prefix + trimmed : line;
}

export function indentMultilinePreserve(text: string, prefix: string): string {
  return text.split("\n").map((line) => {
    if (line.trim().length === 0) return line;
    return prefix + line;
  }).join("\n");
}
