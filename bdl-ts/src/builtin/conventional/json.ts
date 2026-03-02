import { type Node, parseTree } from "jsonc-parser";
import type { RoughJson } from "@disjukr/bdl-runtime/misc/rough-json";
import type { Path } from "@disjukr/bdl-runtime/data-schema";
import type { Span } from "../../generated/ast.ts";

export function pathToSpan(node: Node, path: Path): Span {
  let current: Node | undefined = node;
  let currentSpan = getNodeSpan(node);

  for (const item of path) {
    const next = getChildNode(current, item);
    if (!next) break;
    current = next;
    currentSpan = getNodeSpan(current);
  }

  return currentSpan;
}

export function jsonTextToRoughJson(jsonText: string): RoughJson {
  const node = parseTree(jsonText);
  if (!node) return { type: "null" };
  return nodeToRoughJson(node, jsonText);
}

export function jsonNodeToRoughJson(node: Node): RoughJson {
  return nodeToRoughJson(node);
}

function nodeToRoughJson(node: Node, jsonText?: string): RoughJson {
  switch (node.type) {
    case "null":
      return { type: "null" };
    case "boolean":
      return { type: "boolean", value: Boolean(node.value) };
    case "string":
      return { type: "string", value: String(node.value ?? "") };
    case "number":
      return {
        type: "number",
        text: getNumberText(node, jsonText),
      };
    case "array":
      return {
        type: "array",
        items: (node.children ?? []).map(
          (item) => nodeToRoughJson(item, jsonText),
        ),
      };
    case "object":
      return {
        type: "object",
        items: (node.children ?? [])
          .map((property) => propertyToKeyValue(property, jsonText))
          .filter((item) => item != null),
      };
    case "property": {
      const valueNode = node.children?.[1];
      if (!valueNode) return { type: "null" };
      return nodeToRoughJson(valueNode, jsonText);
    }
  }
}

function propertyToKeyValue(
  property: Node,
  jsonText?: string,
): { key: { type: "string"; value: string }; value: RoughJson } | undefined {
  if (property.type !== "property") return;
  const keyNode = property.children?.[0];
  const valueNode = property.children?.[1];
  if (!keyNode || !valueNode) return;
  return {
    key: { type: "string", value: String(keyNode.value ?? "") },
    value: nodeToRoughJson(valueNode, jsonText),
  };
}

function getChildNode(
  node: Node | undefined,
  pathItem: string | number,
): Node | undefined {
  if (!node) return;

  if (node.type === "object") {
    const key = String(pathItem);
    const property = (node.children ?? []).find((item) => {
      if (item.type !== "property") return false;
      return String(item.children?.[0]?.value ?? "") === key;
    });
    return property?.children?.[1];
  }

  if (node.type === "array") {
    if (typeof pathItem !== "number") return;
    if (!Number.isInteger(pathItem) || pathItem < 0) return;
    return node.children?.[pathItem];
  }
}

function getNodeSpan(node: Node): Span {
  return { start: node.offset, end: node.offset + node.length };
}

function getNumberText(node: Node, jsonText?: string): string {
  if (jsonText) {
    const raw = jsonText.slice(node.offset, node.offset + node.length).trim();
    if (raw.length > 0) return raw;
  }
  return String(node.value);
}
