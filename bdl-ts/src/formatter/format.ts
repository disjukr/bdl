import type { Span } from "@disjukr/bdl/ast";
import type { BdlCst } from "../generated/cst.ts";
import type * as cst from "../generated/cst.ts";
import parseBdlCst, { collectWsAndComments } from "../parser/bdl/cst-parser.ts";
import { Parser } from "../parser/parser.ts";

interface Newline {
  type: "newline";
  count: number;
  span: cst.Span;
}
interface Comment {
  type: "comment";
  span: cst.Span;
}
type NewlineOrComment = Newline | Comment;
interface NodeWithComment<T> {
  node: T;
  above: NewlineOrComment[];
  after?: NewlineOrComment;
}
interface NodesWithAfters<T> {
  nodes: NodeWithComment<T>[];
  after: NewlineOrComment[];
}

interface FormatContext {
  parser: Parser;
  f: ReturnType<typeof f>;
}

export function format(text: string) {
  const parser = new Parser(text);
  const ctx: FormatContext = { parser, f: f(parser) };
  const cst = parseBdlCst(text);
  return formatBdlCst(cst);
  function formatBdlCst(cst: BdlCst) {
    return cst.statements.map((stmt) => formatModuleLevelStatement(stmt)).join(
      "",
    );
  }
  function formatModuleLevelStatement(stmt: cst.ModuleLevelStatement) {
    switch (stmt.type) {
      case "Import":
        return formatImport(ctx, stmt);
      case "Attribute":
        return formatAttribute(ctx, stmt);
      case "Struct":
        return formatStruct(ctx, stmt);
      case "Oneof":
        return formatOneof(ctx, stmt);
      case "Enum":
        return formatEnum(ctx, stmt);
    }
  }
}

// import
function formatImport(ctx: FormatContext, node: cst.Import) {
  const { parser, f } = ctx;
  const collectedImport = collectImport(ctx, node);
  const importItems = collectImportItems(ctx, node);
  const n = collectedImport.node;
  return f`
${stringifyNewlineOrComments(parser, collectedImport.above)}${n.keyword} ${
    d(0)(function* () {
      for (const path of n.path) yield f`${path}`;
    })
  } ${n.bracketOpen}
${
    d(2)(function* () {
      const { nodes, after } = importItems;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above);
        if (!first && above.length == 0) yield "\n";
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.alias) yield f`${n.name} ${n.alias.as} ${n.alias.name}${n.comma}`;
        else yield f`${n.name}${n.comma}`;
        if (node.after) {
          yield " " + stringifyNewlineOrComment(parser, node.after);
        }
      }
      yield stringifyNewlineOrComments(parser, after).trimEnd();
    })
  }
${n.bracketClose}`.trim();
}
function collectImport(
  ctx: FormatContext,
  node: cst.Import,
): NodeWithComment<cst.Import> {
  const { parser } = ctx;
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = node.path.flatMap((path) => collectComments(parser, path.end));
  const above = [...c1, ...c2];
  return { above, node };
}
function collectImportItems(
  ctx: FormatContext,
  node: cst.Import,
): NodesWithAfters<cst.ImportItem> {
  const { parser } = ctx;
  const nodes: NodeWithComment<cst.ImportItem>[] = [];
  let prevEnd = node.bracketOpen.end;
  /**
   * (above) Name (c1) as (c2) Alias (c3) , (after)
   */
  for (const item of node.items) {
    const above = collectNewlineAndComments(parser, prevEnd);
    const c1 = collectComments(parser, item.name.end);
    const c2 = item.alias &&
        collectComments(parser, item.alias.as.end) || [];
    const c3 = item.alias &&
        collectComments(parser, item.alias.name.end) || [];
    const after = collectFollowingComment(
      parser,
      getLastSpanEnd(item.comma, item.alias?.name, item.name),
    );
    const comments = [...c1, ...c2, ...c3];
    if (after) comments.push(after);
    const last = comments.pop();
    nodes.push({ above: [...above, ...comments], node: item, after: last });
    prevEnd = getLastSpanEnd(
      last?.span,
      item.comma,
      item.alias?.name,
      item.name,
    );
  }
  return { nodes, after: collectNewlineAndComments(parser, prevEnd) };
}

// attribute
function formatAttribute(ctx: FormatContext, node: cst.Attribute) {
  const { parser, f } = ctx;
  let result = "";
  /**
   * #/@ (c1) Name Content
   */
  const c1 = collectComments(parser, node.symbol.end);
  const c2 = collectComments(parser, node.name.end);
  const comments = [...c1, ...c2];
  if (comments.length) result += stringifyNewlineOrComments(parser, comments);
  result += f`${node.symbol} ${node.name}`;
  // cst doesn't provide type of the attribute content
  if (node.content) {
    const content = slice(parser, node.content);
    if (content.startsWith("|")) {
      // multiline content has trailing newline
      result += "\n" + slice(parser, node.content);
    }
    if (content.startsWith("-")) {
      result += " " + slice(parser, node.content) + "\n";
    }
  }
  return result;
}
function collectAttribute(
  ctx: FormatContext,
  node: cst.Attribute,
): NodeWithComment<cst.Attribute> {
  const { parser } = ctx;
  /**
   * #/@ (c1) Name Content
   */
  const c1 = collectComments(parser, node.symbol.end);
  const c2 = collectComments(parser, node.name.end);
  const comments = [...c1, ...c2];
  return { above: comments, node };
}

// struct
function formatStruct(ctx: FormatContext, node: cst.Struct) {
  const { parser, f } = ctx;
  const struct = collectStruct(ctx, node);
  const fields = collectStructFields(ctx, node);
  const n = struct.node;
  return f`
${
    stringifyNewlineOrComments(parser, struct.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${
    d(2)(function* () {
      const { nodes, after } = fields;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above);
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.type == "StructField") {
          yield f`${n.name}${n.question}${n.colon} ${n.fieldType.valueType}${n.comma}`; // TODO: type
        }
        if (n.type == "Attribute") {
          if (n.content) {
            const content = slice(parser, n.content);
            if (content.startsWith("|")) {
              // multiline content has trailing newline
              yield f`${n.symbol} ${n.name}\n${n.content}`;
            }
            if (content.startsWith("-")) {
              yield f`${n.symbol} ${n.name} ${n.content}`;
            }
          } else yield f`${n.symbol} ${n.name}`;
        }
        if (node.after) {
          yield " " + stringifyNewlineOrComment(parser, node.after);
        }
      }
      yield stringifyNewlineOrComments(parser, after).trimEnd();
    })
  }
${n.bracketClose}`.trim();
}
function collectStruct(
  ctx: FormatContext,
  node: cst.Struct,
): NodeWithComment<cst.Struct> {
  const { parser } = ctx;
  /**
   * struct (c1) Name (c2) {
   */
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const above = [...c1, ...c2];
  return { above, node };
}
function collectStructFields(
  ctx: FormatContext,
  node: cst.Struct,
): NodesWithAfters<cst.StructBlockStatement> {
  const { parser } = ctx;
  let prevEnd = node.bracketOpen.end;
  const nodes: NodeWithComment<cst.StructBlockStatement>[] = [];
  for (const stmt of node.statements) {
    const c1 = collectNewlineAndComments(parser, prevEnd);
    switch (stmt.type) {
      case "Attribute": {
        const { above, node } = collectAttribute(ctx, stmt);
        nodes.push({ above: [...c1, ...above], node });
        prevEnd = getLastSpanEnd(stmt.content, stmt.name);
        break;
      }
      case "StructField": {
        /**
         * Name (c2) ? (c3) : (c4) FieldType (c5) , (after)
         */
        const c2 = collectComments(parser, stmt.name.end);
        const c3 =
          stmt.question && collectComments(parser, stmt.question.end) ||
          [];
        const c4 = collectComments(parser, stmt.colon.end);
        const c5 = collectComments(parser, stmt.fieldType.valueType.end); // TODO: type
        const after = collectFollowingComment(
          parser,
          getLastSpanEnd(stmt.fieldType.valueType, stmt.comma),
        );
        nodes.push({
          above: [...c1, ...c2, ...c3, ...c4, ...c5],
          node: stmt,
          after,
        });
        prevEnd = getLastSpanEnd(
          stmt.comma,
          stmt.fieldType.valueType,
          after?.span,
        );
        break;
      }
    }
  }
  return { nodes, after: collectNewlineAndComments(parser, prevEnd) };
}
// oneof
function formatOneof(ctx: FormatContext, node: cst.Oneof) {
  const { parser, f } = ctx;
  const oneof = collectOneof(ctx, node);
  const items = collectOneofItems(ctx, node);
  const n = oneof.node;
  // oneliner condition
  const oneline = items.nodes.length < 5 &&
    items.after.every((n) => n.type != "comment") &&
    items.nodes.every((n) =>
      n.node.type != "Attribute" && n.after?.type != "comment" &&
      n.above.every((n) => n.type != "comment")
    );
  if (oneline) {
    return f`
${
      stringifyNewlineOrComments(parser, oneof.above)
    }${n.keyword} ${n.name} ${n.bracketOpen} ${
      d(0)(function* () {
        const { nodes } = items;
        for (const node of nodes) {
          const last = node == nodes.at(-1);
          const n = node.node;
          if (n.type == "OneofItem") {
            const item = f`${n.itemType.valueType}${n.comma}`;
            yield last ? item : item + " "; // TODO: type
          }
        }
      })
    } ${n.bracketClose}    
    `.trim();
  }
  return f`
${
    stringifyNewlineOrComments(parser, oneof.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${
    d(2)(function* () {
      const { nodes, after } = items;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above);
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.type == "OneofItem") {
          yield f`${n.itemType.valueType}${n.comma}`; // TODO: type
        }
        if (n.type == "Attribute") {
          if (n.content) {
            const content = slice(parser, n.content);
            if (content.startsWith("|")) {
              // multiline content has trailing newline
              yield f`${n.symbol} ${n.name}\n${n.content}`;
            }
            if (content.startsWith("-")) {
              yield f`${n.symbol} ${n.name} ${n.content}`;
            }
          } else yield f`${n.symbol} ${n.name}`;
        }
        if (node.after) {
          yield " " + stringifyNewlineOrComment(parser, node.after);
        }
      }
      yield stringifyNewlineOrComments(parser, after).trimEnd();
    })
  }
${n.bracketClose}
  `.trim();
}
function collectOneof(
  ctx: FormatContext,
  node: cst.Oneof,
): NodeWithComment<cst.Oneof> {
  const { parser } = ctx;
  /**
   * oneof (c1) Name (c2) {
   */
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const above = [...c1, ...c2];
  return { above, node };
}
function collectOneofItems(
  ctx: FormatContext,
  node: cst.Oneof,
): NodesWithAfters<cst.OneofBlockStatement> {
  const { parser } = ctx;
  let prevEnd = node.bracketOpen.end;
  const nodes: NodeWithComment<cst.OneofBlockStatement>[] = [];
  for (const stmt of node.statements) {
    const c1 = collectNewlineAndComments(parser, prevEnd);
    switch (stmt.type) {
      case "Attribute": {
        const { above, node } = collectAttribute(ctx, stmt);
        nodes.push({ above: [...c1, ...above], node });
        prevEnd = getLastSpanEnd(stmt.content, stmt.name);
        break;
      }
      case "OneofItem": {
        /**
         * Type (c2) , (after)
         */
        const c2 = collectComments(parser, stmt.itemType.valueType.end); // TODO - types
        const after = collectFollowingComment(
          parser,
          getLastSpanEnd(stmt.itemType.valueType, stmt.comma),
        );
        nodes.push({
          above: [...c1, ...c2],
          node: stmt,
          after,
        });
        prevEnd = getLastSpanEnd(
          stmt.comma,
          stmt.itemType.valueType,
          after?.span,
        );
        break;
      }
    }
  }
  return { nodes, after: collectNewlineAndComments(parser, prevEnd) };
}

function formatEnum(ctx: FormatContext, node: cst.Enum) {
  const { parser, f } = ctx;
  let result = "";
  /**
   * enum (c1) Name (c2) {
   */
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const comments = [...c1, ...c2];
  if (comments.length) {
    result += stringifyComments(parser, comments);
  }
  result += f`${node.keyword} ${node.name} ${node.bracketOpen}`;
  result += depth(formatEnumItems(ctx, node));
  result += f`${node.bracketClose}`;
  return result;
}
function formatEnumItems(ctx: FormatContext, node: cst.Enum) {
  const { parser, f } = ctx;
  let result = "";
  let prevEnd = node.bracketOpen.end;
  for (const stmt of node.statements) {
    const c1 = collectNewlineAndComments(parser, prevEnd);
    result += stringifyNewlineOrComments(parser, c1);
    switch (stmt.type) {
      case "Attribute": {
        result += formatAttribute(ctx, stmt);
        prevEnd = getLastSpanEnd(stmt.content, stmt.name);
        break;
      }
      case "EnumItem": {
        /**
         * Name (c2) , (after)
         */
        const c2 = collectComments(parser, stmt.name.end);
        const after = collectFollowingComment(
          parser,
          getLastSpanEnd(stmt.name, stmt.comma),
        );
        result += stringifyNewlineOrComments(parser, c2);
        result += f`${stmt.name}${stmt.comma}`;
        if (after) {
          result += " " + stringifyNewlineOrComment(parser, after) + "\n";
        }
        prevEnd = getLastSpanEnd(
          stmt.comma,
          stmt.name,
          after?.span,
        );
        break;
      }
    }
  }
  const c1 = collectNewlineAndComments(parser, prevEnd);
  result += stringifyNewlineOrComments(parser, c1);
  return result;
}

// misc
function collectNewlineAndComments(
  parser: Parser,
  loc: number,
): NewlineOrComment[] {
  parser.loc = loc;
  const wsOrComments = collectWsAndComments(parser);
  const result: NewlineOrComment[] = [];
  for (const { type, span } of wsOrComments) {
    if (type == "ws") {
      const count = parser.getText(span).split("\n").length - 1;
      if (count > 0) result.push({ type: "newline", count, span });
    }
    if (type == "comment") {
      result.push({ type: "comment", span });
    }
  }
  return result;
}
function collectFollowingComment(
  parser: Parser,
  loc: number,
): Comment | undefined {
  const wsOrComment = collectNewlineAndComments(parser, loc)[0]; // TODO: just collect once
  if (wsOrComment?.type === "comment") return wsOrComment;
}
function collectComments(parser: Parser, loc: number): Comment[] {
  return collectNewlineAndComments(parser, loc).filter((v) =>
    v.type === "comment"
  );
}
function stringifyComments(parser: Parser, comments: Comment[]) {
  return comments.map((c) => parser.getText(c.span) + "\n").join("");
}
function stringifyNewlineOrComment(
  parser: Parser,
  newlineOrComment: NewlineOrComment,
) {
  switch (newlineOrComment.type) {
    case "comment":
      return parser.getText(newlineOrComment.span);
    case "newline":
      return "\n".repeat(Math.min(2, newlineOrComment.count));
  }
}
function stringifyNewlineOrComments(
  parser: Parser,
  newlineOrComments: NewlineOrComment[],
) {
  let result = "";
  let prevComment = false;
  for (const newlineOfComment of newlineOrComments) {
    if (newlineOfComment.type === "comment" && prevComment) result += "\n";
    result += stringifyNewlineOrComment(parser, newlineOfComment);
    prevComment = newlineOfComment.type === "comment";
  }
  if (prevComment) result += "\n";
  return result;
}

function getLastSpanEnd(...nullableSpans: (cst.Span | undefined)[]) {
  const spans = nullableSpans.filter((span) => span != null);
  if (spans.length == 0) {
    throw new Error("At least one span should be non-nullable");
  }
  return Math.max(...spans.map((span) => span.end));
}

function slice(parser: Parser, span: cst.Span): string {
  return parser.getText(span);
}

// TODO
function depth(str: string) {
  return str.split("\n").map((line) => line.trim() ? "  " + line.trim() : line)
    .join(
      "\n",
    );
}
const d = (depth: number) => (cb: () => Generator<string>) => {
  return cb().toArray().join("").split("\n").map((line) =>
    line.trim() ? " ".repeat(depth) + line.trim() : line
  )
    .join(
      "\n",
    );
};
const f = (parser: Parser) =>
(
  strings: TemplateStringsArray,
  ...args: (Span | string | undefined | false)[]
) => {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    const arg = args[i - 1];
    if (arg) {
      if (typeof arg === "string") result += arg;
      if (typeof arg === "object") result += slice(parser, arg);
    }
    result += strings[i];
  }
  return result;
};
