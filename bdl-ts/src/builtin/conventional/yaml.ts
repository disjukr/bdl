import {
  type Document,
  isMap,
  isScalar,
  isSeq,
  parseDocument as parseYamlDocument,
} from "yaml";
import type { RoughJson } from "@disjukr/bdl-runtime/misc/rough-json";
import type { Path } from "@disjukr/bdl-runtime/data-schema";
import type { Span } from "../../generated/ast.ts";

export function pathToSpan(document: Document.Parsed, path: Path): Span {
  const root = document.contents;
  let current: unknown = root;
  let currentSpan = getYamlNodeSpan(current) ??
    getYamlDocumentSpan(document) ?? { start: 0, end: 0 };

  for (const item of path) {
    const next = getChildNode(current, item);
    if (next === undefined) break;
    current = next;
    currentSpan = getYamlNodeSpan(current) ?? currentSpan;
  }

  return currentSpan;
}

export function yamlTextToRoughJson(yamlText: string): RoughJson {
  const document = parseYamlDocument(yamlText, { keepSourceTokens: true });
  return nodeToRoughJson(document.contents);
}

export function yamlDocumentToRoughJson(document: Document.Parsed): RoughJson {
  return nodeToRoughJson(document.contents);
}

function nodeToRoughJson(node: unknown): RoughJson {
  if (node == null) return { type: "null" };

  if (isScalar(node)) return scalarToRoughJson(node);
  if (isSeq(node)) {
    return {
      type: "array",
      items: node.items.map((item) => nodeToRoughJson(item)),
    };
  }
  if (isMap(node)) {
    return {
      type: "object",
      items: node.items.map((pair) => ({
        key: { type: "string", value: keyToString(pair.key) },
        value: nodeToRoughJson(pair.value),
      })),
    };
  }

  const value = (node as { toJSON?: () => unknown }).toJSON?.();
  return valueToRoughJson(value);
}

function scalarToRoughJson(
  node: { value: unknown; source?: unknown },
): RoughJson {
  const value = node.value;
  if (value == null) return { type: "null" };

  switch (typeof value) {
    case "boolean":
      return { type: "boolean", value };
    case "number":
      return { type: "number", text: getNumberText(node.source, value) };
    case "string":
      return { type: "string", value };
    case "bigint":
      return { type: "number", text: value.toString() };
    default:
      return { type: "string", value: String(value) };
  }
}

function keyToString(node: unknown): string {
  if (isScalar(node)) {
    const value = node.value;
    if (value == null) return "null";
    if (typeof value === "number") {
      return getNumberText((node as { source?: unknown }).source, value);
    }
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  if (node == null) return "null";
  const text = (node as { toString?: () => string }).toString?.();
  if (typeof text === "string" && text.length > 0) return text;
  return String((node as { toJSON?: () => unknown }).toJSON?.() ?? "");
}

function valueToRoughJson(value: unknown): RoughJson {
  if (value == null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.map((item) => valueToRoughJson(item)),
    };
  }
  if (value instanceof Date) {
    return { type: "string", value: value.toISOString() };
  }
  if (value instanceof Map) {
    return {
      type: "object",
      items: Array.from(value.entries()).map(([key, item]) => ({
        key: { type: "string", value: String(key) },
        value: valueToRoughJson(item),
      })),
    };
  }
  if (value instanceof Set) {
    return {
      type: "array",
      items: Array.from(value.values()).map((item) => valueToRoughJson(item)),
    };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      items: Object.entries(value).map(([key, item]) => ({
        key: { type: "string", value: key },
        value: valueToRoughJson(item),
      })),
    };
  }
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "number") return { type: "number", text: String(value) };
  if (typeof value === "bigint") {
    return { type: "number", text: value.toString() };
  }
  return { type: "string", value: String(value) };
}

function getNumberText(source: unknown, fallback: number): string {
  if (typeof source !== "string") return String(fallback);
  const trimmed = source.trim();
  if (trimmed.length === 0) return String(fallback);

  const normalized = trimmed.replaceAll("_", "").replaceAll("+", "");
  if (/^[+-]?\.inf$/i.test(normalized)) {
    return normalized.startsWith("-") ? "-Infinity" : "Infinity";
  }
  if (/^[+-]?\.nan$/i.test(normalized)) return "NaN";
  if (isJsNumberText(normalized)) return normalized;
  return String(fallback);
}

function isJsNumberText(text: string): boolean {
  return /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?0[xX][\da-fA-F]+|[+-]?0[oO][0-7]+|[+-]?0[bB][01]+|[+-]?Infinity|NaN)$/
    .test(text);
}

function getChildNode(node: unknown, pathItem: string | number): unknown {
  if (isMap(node)) {
    const pair = node.items.find((item) =>
      keyToString(item.key) === String(pathItem)
    );
    if (!pair) return undefined;
    return pair.value;
  }

  if (isSeq(node)) {
    if (typeof pathItem !== "number") return undefined;
    if (!Number.isInteger(pathItem) || pathItem < 0) return undefined;
    return node.items[pathItem];
  }

  return undefined;
}

function getYamlNodeSpan(node: unknown): Span | undefined {
  const sourceToken = getYamlSourceToken(node);
  if (sourceToken) {
    const { offset, source } = sourceToken;
    return { start: offset, end: offset + source.length };
  }

  const range = getYamlNodeRange(node);
  if (!range) return;
  const [start, end] = range;
  return { start, end };
}

function getYamlDocumentSpan(document: Document.Parsed): Span | undefined {
  const range = getYamlNodeRange(document);
  if (!range) return;
  const [start, end] = range;
  return { start, end };
}

function getYamlSourceToken(
  node: unknown,
): { offset: number; source: string } | undefined {
  if (!node || typeof node !== "object") return;
  if (!("srcToken" in node)) return;
  const srcToken = (node as { srcToken?: unknown }).srcToken;
  if (!srcToken || typeof srcToken !== "object") return;
  if (!("offset" in srcToken) || !("source" in srcToken)) return;
  const offset = (srcToken as { offset?: unknown }).offset;
  const source = (srcToken as { source?: unknown }).source;
  if (typeof offset !== "number" || typeof source !== "string") return;
  return { offset, source };
}

function getYamlNodeRange(node: unknown): [number, number] | undefined {
  if (!node || typeof node !== "object") return;
  if (!("range" in node)) return;
  const nodeRange = (node as { range?: unknown }).range;
  if (!Array.isArray(nodeRange) || nodeRange.length < 2) return;
  const [start, end] = nodeRange;
  if (typeof start !== "number" || typeof end !== "number") return;
  if (end < start) return;
  return [start, end];
}
