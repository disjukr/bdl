import { collectWsAndComments } from "../../parser/bdl/cst-parser.ts";
import type { Parser } from "../../parser/parser.ts";
import type { Comment, NewlineOrComment } from "./types.ts";

interface TriviaCacheState {
  byLoc: Map<number, NewlineOrComment[]>;
}

const maxTriviaCacheEntries = 32;
const triviaCacheByParser = new WeakMap<Parser, TriviaCacheState>();
const triviaCacheEnabledByParser = new WeakMap<Parser, boolean>();

export function setTriviaCacheEnabled(parser: Parser, enabled: boolean): void {
  triviaCacheEnabledByParser.set(parser, enabled);
}

function isTriviaCacheEnabled(parser: Parser): boolean {
  return triviaCacheEnabledByParser.get(parser) ?? true;
}

function getOrCreateTriviaCache(parser: Parser): TriviaCacheState {
  const cached = triviaCacheByParser.get(parser);
  if (cached) return cached;
  const next: TriviaCacheState = { byLoc: new Map() };
  triviaCacheByParser.set(parser, next);
  return next;
}

function scanTriviaAt(parser: Parser, loc: number): NewlineOrComment[] {
  return parser.look((scopedParser) => {
    scopedParser.loc = loc;
    const wsOrComments = collectWsAndComments(scopedParser);
    const result: NewlineOrComment[] = [];
    for (const { type, span } of wsOrComments) {
      if (type === "ws") {
        const count = scopedParser.getText(span).split("\n").length - 1;
        if (count > 0) result.push({ type: "newline", count, span });
      }
      if (type === "comment") {
        result.push({ type: "comment", span });
      }
    }
    return result;
  }) ?? [];
}

export function collectNewlineAndComments(
  parser: Parser,
  loc: number,
): NewlineOrComment[] {
  if (!isTriviaCacheEnabled(parser)) return scanTriviaAt(parser, loc);
  const cache = getOrCreateTriviaCache(parser);
  const cached = cache.byLoc.get(loc);
  if (cached) {
    cache.byLoc.delete(loc);
    cache.byLoc.set(loc, cached);
    return cached;
  }
  const result = scanTriviaAt(parser, loc);
  cache.byLoc.set(loc, result);
  if (cache.byLoc.size > maxTriviaCacheEntries) {
    const first = cache.byLoc.keys().next().value;
    if (first != null) cache.byLoc.delete(first);
  }
  return result;
}

export function collectFollowingComment(
  parser: Parser,
  loc: number,
): Comment | undefined {
  const wsOrComment = collectNewlineAndComments(parser, loc)[0];
  if (wsOrComment?.type === "comment") return wsOrComment;
}

export function collectComments(parser: Parser, loc: number): Comment[] {
  return collectNewlineAndComments(parser, loc).filter((v) => v.type === "comment");
}

export function stringifyNewlineOrComment(
  parser: Parser,
  newlineOrComment: NewlineOrComment,
): string {
  switch (newlineOrComment.type) {
    case "comment":
      return parser.getText(newlineOrComment.span);
    case "newline":
      return "\n".repeat(Math.min(2, newlineOrComment.count));
  }
}

export function stringifyNewlineOrComments(
  parser: Parser,
  newlineOrComments: NewlineOrComment[],
  config?: { leadingNewline: boolean },
): string {
  let result = "";
  let prevComment = false;
  for (const newlineOfComment of newlineOrComments) {
    if (newlineOfComment.type === "comment" && prevComment) result += "\n";
    result += stringifyNewlineOrComment(parser, newlineOfComment);
    prevComment = newlineOfComment.type === "comment";
  }
  if (prevComment) result += "\n";
  if (config?.leadingNewline && result[0] !== "\n") return "\n" + result;
  return result;
}

export function prependLeadingTrivia(
  parser: Parser,
  above: NewlineOrComment[],
  text: string,
): string {
  const leading = stringifyNewlineOrComments(parser, above);
  return leading ? `${leading}${text}` : text;
}
