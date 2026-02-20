import type { Parser } from "../parser/parser.ts";
import { collectNewlineAndComments } from "./trivia.ts";
import type { NodeWithComment, NodesWithAfters, NewlineOrComment } from "./types.ts";

interface CollectItemResult<TNode> {
  wrapped: NodeWithComment<TNode>;
  nextEnd: number;
}

export function collectDelimitedNodes<TNode>(
  parser: Parser,
  startEnd: number,
  nodes: TNode[],
  collectItem: (
    node: TNode,
    meta: { leading: NewlineOrComment[]; prevEnd: number },
  ) => CollectItemResult<TNode>,
): NodesWithAfters<TNode> {
  let prevEnd = startEnd;
  const collected: NodeWithComment<TNode>[] = [];
  for (const node of nodes) {
    const leading = collectNewlineAndComments(parser, prevEnd);
    const result = collectItem(node, { leading, prevEnd });
    collected.push(result.wrapped);
    prevEnd = result.nextEnd;
  }
  return { nodes: collected, after: collectNewlineAndComments(parser, prevEnd) };
}
