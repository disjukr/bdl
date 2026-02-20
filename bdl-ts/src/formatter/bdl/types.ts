import type * as cst from "../../generated/cst.ts";
import type { Parser } from "../../parser/parser.ts";

export interface Newline {
  type: "newline";
  count: number;
  span?: cst.Span;
}

export interface Comment {
  type: "comment";
  span: cst.Span;
}

export type NewlineOrComment = Newline | Comment;

export interface NodeWithComment<T> {
  node: T;
  above: NewlineOrComment[];
  after?: NewlineOrComment;
}

export interface NodesWithAfters<T> {
  nodes: NodeWithComment<T>[];
  after: NewlineOrComment[];
}

export interface FormatConfig {
  lineWidth: number;
  indent: { type: "space" | "tab"; count: number };
  finalNewline: boolean;
  triviaCache: boolean;
}

export interface FormatConfigInput {
  lineWidth?: number;
  indent?: Partial<FormatConfig["indent"]>;
  finalNewline?: boolean;
  triviaCache?: boolean;
}

export type SpanFormatterArg =
  | cst.Span
  | cst.TypeExpression
  | string
  | undefined
  | false;

export type SpanFormatter = (
  strings: TemplateStringsArray,
  ...args: SpanFormatterArg[]
) => string;

export interface FormatContext {
  parser: Parser;
  f: SpanFormatter;
  config: FormatConfig;
}
