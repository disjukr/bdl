import type { Parser } from "../../parser/parser.ts";
import { collectNewlineAndComments } from "./trivia.ts";
import type {
  NewlineOrComment,
  NodesWithAfters,
  NodeWithComment,
} from "./types.ts";

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
    meta: {
      leading: NewlineOrComment[];
      prevEnd: number;
      previousNode?: TNode;
    },
  ) => CollectItemResult<TNode>,
): NodesWithAfters<TNode> {
  let prevEnd = startEnd;
  let previousNode: TNode | undefined;
  const collected: NodeWithComment<TNode>[] = [];
  for (const node of nodes) {
    const leading = collectNewlineAndComments(parser, prevEnd);
    const result = collectItem(node, { leading, prevEnd, previousNode });
    collected.push(result.wrapped);
    prevEnd = result.nextEnd;
    previousNode = node;
  }
  return {
    nodes: collected,
    after: collectNewlineAndComments(parser, prevEnd),
  };
}
