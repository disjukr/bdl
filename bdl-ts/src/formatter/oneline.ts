import type * as cst from "../generated/cst.ts";
import type { Parser } from "../parser/parser.ts";
import type { NodeWithComment, NewlineOrComment } from "./types.ts";

export function hasLineBreak(text: string): boolean {
  return /[\r\n]/.test(text);
}

export function hasTightOpenToFirstContent(
  parser: Parser,
  blockOpen: cst.Span,
  firstContentStart: number | undefined,
): boolean {
  if (firstContentStart == null) return true;
  return !hasLineBreak(
    parser.getText({ start: blockOpen.end, end: firstContentStart }),
  );
}

export function canCollapseDelimitedBlock(
  parser: Parser,
  blockStart: number,
  blockOpen: cst.Span,
  blockClose: cst.Span,
  firstContentStart: number | undefined,
  contentEnd: number,
): boolean {
  const whole = parser.getText({ start: blockStart, end: blockClose.end });
  if (!/[\r\n]/.test(whole)) return true;
  if (firstContentStart != null) {
    const inlineLead = parser.getText({ start: blockOpen.end, end: firstContentStart });
    if (!/[\r\n]/.test(inlineLead)) return true;
  }
  const prefix = parser.getText({ start: blockStart, end: contentEnd });
  const trailing = parser.getText({ start: contentEnd, end: blockClose.start });
  return !/[\r\n]/.test(prefix) && /^[\s\r\n]*$/.test(trailing);
}

interface OnelineBlockCandidateOptions<TNode> {
  sourceCanBeCollapsed: boolean;
  nodes: NodeWithComment<TNode>[];
  after: NewlineOrComment[];
  maxItems?: number;
  sourceHasNewline?: boolean;
  sourceOnelineIntent?: boolean;
  canInlineNode: (node: TNode) => boolean;
  hasNodeOnelineIntent?: (node: TNode) => boolean;
}

export function canUseOnelineBlock<TNode>(
  options: OnelineBlockCandidateOptions<TNode>,
): boolean {
  const {
    sourceCanBeCollapsed,
    nodes,
    after,
    maxItems = 5,
    sourceHasNewline = false,
    sourceOnelineIntent = true,
    canInlineNode,
    hasNodeOnelineIntent,
  } = options;
  if (!sourceCanBeCollapsed) return false;
  if (sourceHasNewline && !sourceOnelineIntent) return false;
  if (nodes.length >= maxItems) return false;
  if (after.some((trivia) => trivia.type === "comment")) return false;
  for (const wrapped of nodes) {
    if (!canInlineNode(wrapped.node)) return false;
    if (wrapped.above.some((trivia) => trivia.type === "comment")) return false;
    if (wrapped.after?.type === "comment") return false;
    if (sourceHasNewline && hasNodeOnelineIntent && !hasNodeOnelineIntent(wrapped.node)) {
      return false;
    }
  }
  return true;
}
