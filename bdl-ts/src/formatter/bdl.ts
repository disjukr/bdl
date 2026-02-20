import type { BdlCst } from "../generated/cst.ts";
import type * as cst from "../generated/cst.ts";
import parseBdlCst, { collectWsAndComments } from "../parser/bdl/cst-parser.ts";
import { Parser } from "../parser/parser.ts";

interface Newline {
  type: "newline";
  count: number;
  span?: cst.Span;
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
  f: ReturnType<typeof createSpanFormatter>;
  config: FormatConfig;
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

type SpanFormatterArg =
  | cst.Span
  | cst.TypeExpression
  | string
  | undefined
  | false;

const defaultFormatConfig: FormatConfig = {
  lineWidth: 80,
  indent: { type: "space", count: 2 },
  finalNewline: true,
  triviaCache: true,
};

interface ProcCollected {
  node: cst.Proc;
  above: NewlineOrComment[];
  betweenKeywordAndName: NewlineOrComment[];
  betweenNameAndEq: NewlineOrComment[];
  betweenEqAndInput: NewlineOrComment[];
  betweenInputAndArrow: NewlineOrComment[];
  betweenArrowAndOutput: NewlineOrComment[];
  betweenOutputAndThrows: NewlineOrComment[];
  betweenThrowsAndError: NewlineOrComment[];
  after?: Comment;
}

interface CustomCollected {
  node: cst.Custom;
  above: NewlineOrComment[];
  betweenKeywordAndName: NewlineOrComment[];
  betweenNameAndEq: NewlineOrComment[];
  betweenEqAndOriginalType: NewlineOrComment[];
  after?: Comment;
}

export function formatBdl(
  text: string,
  config: FormatConfigInput = {},
): string {
  const parser = new Parser(text);
  const resolvedConfig = resolveFormatConfig(config);
  triviaCacheEnabledByParser.set(parser, resolvedConfig.triviaCache);
  const ctx: FormatContext = {
    parser,
    f: createSpanFormatter(parser),
    config: resolvedConfig,
  };
  let cst: BdlCst;
  try {
    cst = parseBdlCst(text);
  } catch (error) {
    throw createFormatterError("Formatter parse failed", error);
  }
  try {
    return formatBdlCst(cst);
  } catch (error) {
    throw createFormatterError("Formatter failed", error);
  }
  function formatBdlCst(cst: BdlCst) {
    let result = "";
    let prevEnd = 0;
    for (const stmt of cst.statements) {
      const start = getFirstSpanStartOfModuleLevelStatement(stmt);
      const interStatementText = slice(parser, { start: prevEnd, end: start });
      const normalizedGap = normalizeInterStatementGap(interStatementText);
      if (result.length > 0 && normalizedGap.length === 0) {
        result += "\n";
      } else {
        result += normalizedGap;
      }
      result += formatModuleLevelStatement(stmt).trimEnd();
      prevEnd = getLastSpanEndOfModuleLevelStatement(parser, stmt);
    }
    result += slice(parser, { start: prevEnd, end: parser.input.length });
    return applyFinalNewline(result.trimEnd(), ctx.config.finalNewline);
  }
  function formatModuleLevelStatement(stmt: cst.ModuleLevelStatement) {
    switch (stmt.type) {
      case "Attribute":
        return formatAttribute(ctx, stmt);
      case "Enum":
        return formatEnum(ctx, stmt);
      case "Import":
        return formatImport(ctx, stmt);
      case "Oneof":
        return formatOneof(ctx, stmt);
      case "Proc":
        return formatProc(ctx, stmt);
      case "Custom":
        return formatCustom(ctx, stmt);
      case "Struct":
        return formatStruct(ctx, stmt);
      case "Union":
        return formatUnion(ctx, stmt);
    }
  }
}

function resolveFormatConfig(config: FormatConfigInput): FormatConfig {
  return {
    lineWidth: normalizeLineWidth(config.lineWidth),
    indent: {
      type: normalizeIndentType(config.indent?.type),
      count: normalizeIndentCount(config.indent?.count),
    },
    finalNewline: normalizeBoolean(
      config.finalNewline,
      defaultFormatConfig.finalNewline,
    ),
    triviaCache: normalizeBoolean(config.triviaCache, defaultFormatConfig.triviaCache),
  };
}

function normalizeLineWidth(lineWidth: unknown): number {
  if (
    typeof lineWidth === "number" && Number.isInteger(lineWidth) &&
    lineWidth > 0
  ) {
    return lineWidth;
  }
  return defaultFormatConfig.lineWidth;
}

function normalizeIndentType(indentType: unknown): FormatConfig["indent"]["type"] {
  if (indentType === "space" || indentType === "tab") return indentType;
  return defaultFormatConfig.indent.type;
}

function normalizeIndentCount(indentCount: unknown): number {
  if (
    typeof indentCount === "number" && Number.isInteger(indentCount) &&
    indentCount >= 0
  ) {
    return indentCount;
  }
  return defaultFormatConfig.indent.count;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function applyFinalNewline(text: string, enabled: boolean): string {
  if (!enabled) return text;
  return text.length === 0 ? text : text + "\n";
}

function normalizeInterStatementGap(text: string): string {
  return text.replace(/(?:\r?\n[ \t]*){3,}/g, "\n\n");
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createFormatterError(message: string, error: unknown): Error {
  return new Error(`${message}: ${stringifyUnknownError(error)}`, {
    cause: error,
  });
}

// import
function formatImport(ctx: FormatContext, node: cst.Import) {
  const { parser, f } = ctx;
  const collectedImport = collectImport(ctx, node);
  const importItems = collectImportItems(ctx, node);
  const n = collectedImport.node;
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    n.keyword.start,
    n.bracketOpen,
    n.bracketClose,
    n.items.at(0)?.name.start,
    n.items.at(-1) ? getLastSpanEndOfImportItem(n.items.at(-1)!) : n.bracketOpen.end,
  );
  const onelineCandidate = sourceCanBeCollapsed &&
    !hasCommentTrivia(collectedImport.above) &&
    importItems.after.every((v) => v.type !== "comment") &&
    importItems.nodes.every((v) =>
      !hasCommentTrivia(v.above) && v.after?.type !== "comment"
    );
  if (onelineCandidate) {
    const pathText = n.path.map((path) => f`${path}`).join("");
    const inlineItems = importItems.nodes.map((wrapped, index, all) => {
      const isLast = index === all.length - 1;
      const item = wrapped.node;
      const comma = listComma(ctx, item.comma, {
        isLast,
        mode: "oneline",
      });
      return item.alias
        ? f`${item.name} ${item.alias.as} ${item.alias.name}${comma}`
        : f`${item.name}${comma}`;
    }).join(" ");
    const onelineText = inlineItems.length === 0
      ? f`${n.keyword} ${pathText} ${n.bracketOpen}${n.bracketClose}`
      : f`${n.keyword} ${pathText} ${n.bracketOpen} ${inlineItems} ${n.bracketClose}`;
    if (lastLineLength(onelineText) <= ctx.config.lineWidth) {
      return onelineText;
    }
  }
  return f`
${stringifyNewlineOrComments(parser, collectedImport.above)}${n.keyword} ${
    indentBlock(ctx, 0)(function* () {
      for (const path of n.path) yield f`${path}`;
    })
  } ${n.bracketOpen}
${
    indentBlock(ctx, 1)(function* () {
      const { nodes, after } = importItems;
      for (const node of nodes) {
        const isLast = node == nodes.at(-1);
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above);
        if (!first && above.length == 0) yield "\n";
        yield first ? above.trimStart() : above;
        const n = node.node;
        const comma = listComma(ctx, n.comma, { isLast, mode: "multiline" });
        if (n.alias) yield f`${n.name} ${n.alias.as} ${n.alias.name}${comma}`;
        else yield f`${n.name}${comma}`;
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
  result += formatAttributeNode(ctx, node);
  if (node.content && slice(parser, node.content).startsWith("-")) {
    result += "\n";
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

function formatAttributeNode(ctx: FormatContext, node: cst.Attribute): string {
  const { f, parser } = ctx;
  if (!node.content) return f`${node.symbol} ${node.name}`;
  const content = slice(parser, node.content);
  if (content.startsWith("|")) {
    return f`${node.symbol} ${node.name}\n${content.trimEnd()}`;
  }
  if (content.startsWith("-")) return f`${node.symbol} ${node.name} ${node.content}`;
  return f`${node.symbol} ${node.name}`;
}

// struct
function formatStruct(ctx: FormatContext, node: cst.Struct) {
  const { parser, f } = ctx;
  const struct = collectStruct(ctx, node);
  const fields = collectStructFields(ctx, node);
  const n = struct.node;
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    n.keyword.start,
    n.bracketOpen,
    n.bracketClose,
    n.statements.at(0)
      ? getFirstSpanStartOfStructBlockStatement(n.statements.at(0)!)
      : undefined,
    n.statements.at(-1)
      ? getLastSpanEndOfStructBlockStatement(n.statements.at(-1)!)
      : n.bracketOpen.end,
  );
  const onelineCandidate = sourceCanBeCollapsed && fields.nodes.length < 5 &&
    fields.after.every((v) => v.type !== "comment") &&
    fields.nodes.every((v) =>
      v.node.type === "StructField" &&
      !hasCommentTrivia(v.above) &&
      v.after?.type !== "comment"
    );
  if (onelineCandidate) {
    const inlineFields = fields.nodes.map((wrapped, index, all) => {
      const isLast = index === all.length - 1;
      const field = wrapped.node;
      if (field.type !== "StructField") {
        return unsupportedFormatterType("Struct", field.type);
      }
      const comma = listComma(ctx, field.comma, { isLast, mode: "oneline" });
      return f`${field.name}${field.question}${field.colon} ${field.fieldType}${comma}`;
    }).join(" ");
    const onelineText = inlineFields.length === 0
      ? f`${n.keyword} ${n.name} ${n.bracketOpen}${n.bracketClose}`
      : f`${n.keyword} ${n.name} ${n.bracketOpen} ${inlineFields} ${n.bracketClose}`;
    if (lastLineLength(onelineText) <= ctx.config.lineWidth) {
      return prependLeadingTrivia(parser, struct.above, onelineText);
    }
  }
  const body = renderCollectedBlock(ctx, 1, fields, (stmt, meta) => {
    switch (stmt.type) {
      case "StructField":
        return f`${stmt.name}${stmt.question}${stmt.colon} ${stmt.fieldType}${listComma(ctx, stmt.comma, { isLast: meta.isLast, mode: "multiline" })}`;
      case "Attribute":
        return formatAttributeNode(ctx, stmt);
      default:
        return unsupportedFormatterNode("Struct", stmt);
    }
  });
  return f`
${
    stringifyNewlineOrComments(parser, struct.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${body}
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
  return collectStructLikeStatements(ctx, node.bracketOpen, node.statements);
}

function collectStructLikeStatements(
  ctx: FormatContext,
  bracketOpen: cst.Span,
  statements: cst.StructBlockStatement[],
): NodesWithAfters<cst.StructBlockStatement> {
  const { parser } = ctx;
  let prevEnd = bracketOpen.end;
  const nodes: NodeWithComment<cst.StructBlockStatement>[] = [];
  for (const stmt of statements) {
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
        const ty = collectTypeExpr(ctx, stmt.fieldType);
        const c5 = collectComments(
          parser,
          getLastSpanEndOfTypeExpr(stmt.fieldType),
        );
        const after = collectFollowingComment(
          parser,
          getLastSpanEnd(
            stmt.fieldType.valueType,
            stmt.fieldType.container?.bracketClose,
            stmt.comma,
          ),
        );
        nodes.push({
          above: [...c1, ...c2, ...c3, ...c4, ...ty.above, ...c5],
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
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    n.keyword.start,
    n.bracketOpen,
    n.bracketClose,
    n.statements.at(0)
      ? getFirstSpanStartOfOneofBlockStatement(n.statements.at(0)!)
      : undefined,
    n.statements.at(-1)
      ? getLastSpanEndOfOneofBlockStatement(n.statements.at(-1)!)
      : n.bracketOpen.end,
  );
  const onelineCandidate = sourceCanBeCollapsed && items.nodes.length < 5 &&
    items.after.every((n) => n.type != "comment") &&
    items.nodes.every((n) =>
      n.node.type != "Attribute" && n.after?.type != "comment" &&
      n.above.every((n) => n.type != "comment")
    );
  if (onelineCandidate) {
    const inlineItems = indentBlock(ctx, 0)(function* () {
      const { nodes } = items;
      for (const node of nodes) {
        const last = node == nodes.at(-1);
        const n = node.node;
        if (n.type == "OneofItem") {
          const comma = listComma(ctx, n.comma, { isLast: last, mode: "oneline" });
          const item = f`${n.itemType}${comma}`;
          yield last ? item : item + " ";
        }
      }
    });
    const onelineText = f`
${
      stringifyNewlineOrComments(parser, oneof.above)
    }${n.keyword} ${n.name} ${n.bracketOpen} ${inlineItems} ${n.bracketClose}
    `.trim();
    if (lastLineLength(onelineText) <= ctx.config.lineWidth) {
      return onelineText;
    }
  }
  const body = renderCollectedBlock(ctx, 1, items, (stmt, meta) => {
    switch (stmt.type) {
      case "OneofItem":
        return f`${stmt.itemType}${listComma(ctx, stmt.comma, { isLast: meta.isLast, mode: "multiline" })}`;
      case "Attribute":
        return formatAttributeNode(ctx, stmt);
      default:
        return unsupportedFormatterNode("Oneof", stmt);
    }
  });
  return f`
${
    stringifyNewlineOrComments(parser, oneof.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${body}
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
        const ty = collectTypeExpr(ctx, stmt.itemType);
        const c2 = collectComments(
          parser,
          getLastSpanEndOfTypeExpr(stmt.itemType),
        );
        const after = collectFollowingComment(
          parser,
          getLastSpanEnd(stmt.itemType.valueType, stmt.comma),
        );
        nodes.push({
          above: [...ty.above, ...c1, ...c2],
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

function getLastSpanEndOfOneofBlockStatement(
  stmt: cst.OneofBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return getLastSpanEnd(stmt.content, stmt.name);
    case "OneofItem":
      return getLastSpanEnd(stmt.comma, stmt.itemType.container?.bracketClose, stmt.itemType.valueType);
  }
}

function getFirstSpanStartOfOneofBlockStatement(
  stmt: cst.OneofBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return stmt.symbol.start;
    case "OneofItem":
      return stmt.itemType.valueType.start;
  }
}

// enum
function formatEnum(ctx: FormatContext, node: cst.Enum) {
  const { parser, f } = ctx;
  const e = collectEnum(ctx, node);
  const items = collectEnumItems(ctx, node);
  const n = e.node;
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    n.keyword.start,
    n.bracketOpen,
    n.bracketClose,
    n.statements.at(0)
      ? getFirstSpanStartOfEnumBlockStatement(n.statements.at(0)!)
      : undefined,
    n.statements.at(-1)
      ? getLastSpanEndOfEnumBlockStatement(n.statements.at(-1)!)
      : n.bracketOpen.end,
  );
  const onelineCandidate = sourceCanBeCollapsed && items.nodes.length < 5 &&
    items.after.every((v) => v.type !== "comment") &&
    items.nodes.every((v) =>
      v.node.type === "EnumItem" && !hasCommentTrivia(v.above) &&
      v.after?.type !== "comment"
    );
  if (onelineCandidate) {
    const inlineItems = items.nodes.map((wrapped, index, all) => {
      const isLast = index === all.length - 1;
      const item = wrapped.node;
      if (item.type !== "EnumItem") {
        return unsupportedFormatterType("Enum", item.type);
      }
      const comma = listComma(ctx, item.comma, { isLast, mode: "oneline" });
      return f`${item.name}${comma}`;
    }).join(" ");
    const onelineText = inlineItems.length === 0
      ? f`${n.keyword} ${n.name} ${n.bracketOpen}${n.bracketClose}`
      : f`${n.keyword} ${n.name} ${n.bracketOpen} ${inlineItems} ${n.bracketClose}`;
    if (lastLineLength(onelineText) <= ctx.config.lineWidth) {
      return prependLeadingTrivia(parser, e.above, onelineText);
    }
  }
  const body = renderCollectedBlock(ctx, 1, items, (stmt, meta) => {
    switch (stmt.type) {
      case "EnumItem":
        return f`${stmt.name}${listComma(ctx, stmt.comma, { isLast: meta.isLast, mode: "multiline" })}`;
      case "Attribute":
        return formatAttributeNode(ctx, stmt);
      default:
        return unsupportedFormatterNode("Enum", stmt);
    }
  });
  return f`
${
    stringifyNewlineOrComments(parser, e.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${body}
${n.bracketClose}`.trim();
}
function collectEnum(
  ctx: FormatContext,
  node: cst.Enum,
): NodeWithComment<cst.Enum> {
  const { parser } = ctx;
  /**
   * enum (c1) Name (c2) {
   */
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const above = [...c1, ...c2];
  return { above, node };
}
function collectEnumItems(
  ctx: FormatContext,
  node: cst.Enum,
): NodesWithAfters<cst.EnumBlockStatement> {
  const { parser } = ctx;
  let prevEnd = node.bracketOpen.end;
  const nodes: NodeWithComment<cst.EnumBlockStatement>[] = [];
  for (const stmt of node.statements) {
    const c1 = collectNewlineAndComments(parser, prevEnd);
    switch (stmt.type) {
      case "Attribute": {
        const { above, node } = collectAttribute(ctx, stmt);
        nodes.push({ above: [...c1, ...above], node });
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
        nodes.push({
          above: [...c1, ...c2],
          node: stmt,
          after,
        });
        prevEnd = getLastSpanEnd(
          stmt.name,
          stmt.comma,
          after?.span,
        );
        break;
      }
    }
  }
  return { nodes, after: collectNewlineAndComments(parser, prevEnd) };
}

function getLastSpanEndOfEnumBlockStatement(
  stmt: cst.EnumBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return getLastSpanEnd(stmt.content, stmt.name);
    case "EnumItem":
      return getLastSpanEnd(stmt.comma, stmt.name);
  }
}

function getFirstSpanStartOfEnumBlockStatement(
  stmt: cst.EnumBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return stmt.symbol.start;
    case "EnumItem":
      return stmt.name.start;
  }
}

function formatProc(ctx: FormatContext, node: cst.Proc) {
  const { parser, f } = ctx;
  const proc = collectProc(ctx, node);
  const prefix = stringifyNewlineOrComments(parser, proc.above);
  const sourceEnd = node.error
    ? getLastSpanEndOfTypeExpr(node.error.errorType)
    : getLastSpanEndOfTypeExpr(node.outputType);
  const sourceIsOneline = !hasLineBreak(
    slice(parser, { start: node.keyword.start, end: sourceEnd }),
  );
  const modes: ProcWrapMode[] = [
    {
      breakAfterEq: false,
      breakBeforeThrows: false,
      breakAfterArrow: false,
    },
    {
      breakAfterEq: true,
      breakBeforeThrows: false,
      breakAfterArrow: false,
    },
    {
      breakAfterEq: true,
      breakBeforeThrows: true,
      breakAfterArrow: false,
    },
    {
      breakAfterEq: true,
      breakBeforeThrows: true,
      breakAfterArrow: true,
    },
  ];

  const pickedMode = modes.find((mode) =>
    maxLineLength(renderProcCore(ctx, proc, mode, false)) <= ctx.config.lineWidth
  ) ?? modes.at(-1)!;
  const picked = renderProcCore(ctx, proc, pickedMode, true);
  if (proc.after) {
    const trailingComment = stringifyNewlineOrComment(parser, proc.after);
    if (sourceIsOneline && hasLineBreak(picked)) {
      return `${prefix}${trailingComment}\n${picked}`;
    }
    return `${prefix}${picked} ${trailingComment}`;
  }

  return prefix + picked;
}

interface ProcWrapMode {
  breakAfterEq: boolean;
  breakBeforeThrows: boolean;
  breakAfterArrow: boolean;
}

function renderProcCore(
  ctx: FormatContext,
  proc: ProcCollected,
  mode: ProcWrapMode,
  includeComments: boolean,
): string {
  const { parser, f } = ctx;
  const indent = indentUnit(ctx.config);
  const n = proc.node;
  const lines: string[] = [];
  let current = "";
  current += f`${n.keyword}`;
  current = appendProcGap(current, proc.betweenKeywordAndName, " ", false);
  current += f`${n.name}`;
  current = appendProcGap(current, proc.betweenNameAndEq, " ", false);
  current += f`${n.eq}`;
  current = appendProcGap(current, proc.betweenEqAndInput, " ", mode.breakAfterEq);
  current += f`${n.inputType}`;
  current = appendProcGap(current, proc.betweenInputAndArrow, " ", false);
  current += f`${n.arrow}`;
  current = appendProcGap(current, proc.betweenArrowAndOutput, " ", mode.breakAfterArrow);
  current += f`${n.outputType}`;

  if (n.error) {
    current = appendProcGap(current, proc.betweenOutputAndThrows, " ", mode.breakBeforeThrows);
    current += f`${n.error.keywordThrows}`;
    current = appendProcGap(current, proc.betweenThrowsAndError, " ", false);
    current += f`${n.error.errorType}`;
  }

  lines.push(current);
  return lines.join("\n");

  function appendProcGap(
    currentLine: string,
    trivia: NewlineOrComment[],
    fallback: string,
    forceBreak: boolean,
  ): string {
    const comments = trivia.filter((v): v is Comment => v.type === "comment");
    if (forceBreak || comments.length > 0) {
      lines.push(currentLine);
      if (includeComments) {
        for (const comment of comments) {
          lines.push(indent + parser.getText(comment.span));
        }
      }
      return indent;
    }
    if (trivia.length === 0) {
      return currentLine + fallback;
    }
    if (trivia.every((v) => v.type === "newline")) {
      return currentLine + fallback;
    }
    return currentLine + stringifyNewlineOrComments(parser, trivia);
  }
}

function collectProc(ctx: FormatContext, node: cst.Proc): ProcCollected {
  const { parser } = ctx;
  const betweenKeywordAndName = collectNewlineAndComments(parser, node.keyword.end);
  const betweenNameAndEq = collectNewlineAndComments(parser, node.name.end);
  const betweenEqAndInput = collectNewlineAndComments(parser, node.eq.end);
  const inputTy = collectTypeExpr(ctx, node.inputType);
  const betweenInputAndArrow = [
    ...inputTy.above,
    ...collectNewlineAndComments(parser, getLastSpanEndOfTypeExpr(node.inputType)),
  ];
  const betweenArrowAndOutput = collectNewlineAndComments(parser, node.arrow.end);
  const outputTy = collectTypeExpr(ctx, node.outputType);
  const outputEnd = getLastSpanEndOfTypeExpr(node.outputType);
  const betweenOutputAndThrows = [
    ...outputTy.above,
    ...collectNewlineAndComments(parser, outputEnd),
  ];
  const betweenThrowsAndError = node.error
    ? collectNewlineAndComments(parser, node.error.keywordThrows.end)
    : [];
  const errorTy = node.error ? collectTypeExpr(ctx, node.error.errorType) : undefined;
  const finalEnd = node.error
    ? getLastSpanEndOfTypeExpr(node.error.errorType)
    : outputEnd;
  const after = collectFollowingComment(parser, finalEnd);
  return {
    node,
    above: [],
    betweenKeywordAndName,
    betweenNameAndEq,
    betweenEqAndInput,
    betweenInputAndArrow,
    betweenArrowAndOutput,
    betweenOutputAndThrows,
    betweenThrowsAndError: [...(errorTy?.above ?? []), ...betweenThrowsAndError],
    after,
  };
}

function formatCustom(ctx: FormatContext, node: cst.Custom) {
  const { parser, f } = ctx;
  const custom = collectCustom(ctx, node);
  const n = custom.node;
  const prefix = stringifyNewlineOrComments(parser, custom.above);
  const core = [
    f`${n.keyword}`,
    formatGap(parser, custom.betweenKeywordAndName, " "),
    f`${n.name}`,
    formatGap(parser, custom.betweenNameAndEq, " "),
    f`${n.eq}`,
    formatGap(parser, custom.betweenEqAndOriginalType, " "),
    f`${n.originalType}`,
  ].join("");
  const measuredCore = f`${n.keyword} ${n.name} ${n.eq} ${n.originalType}`;
  const wrapCore = maxLineLength(measuredCore) > ctx.config.lineWidth;
  const wrappedCore = (() => {
    const indent = indentUnit(ctx.config);
    const header = [
      f`${n.keyword}`,
      formatGap(parser, custom.betweenKeywordAndName, " "),
      f`${n.name}`,
      formatGap(parser, custom.betweenNameAndEq, " "),
      f`${n.eq}`,
    ].join("");
    const comments = custom.betweenEqAndOriginalType.filter((v): v is Comment =>
      v.type === "comment"
    );
    const lines = [header];
    for (const comment of comments) {
      lines.push(indent + stringifyNewlineOrComment(parser, comment));
    }
    lines.push(indent + f`${n.originalType}`);
    return lines.join("\n");
  })();
  if (custom.after) {
    const trailingComment = stringifyNewlineOrComment(parser, custom.after);
    if (wrapCore) {
      return `${prefix}${trailingComment}\n${wrappedCore}`;
    }
    return `${prefix}${core} ${trailingComment}`;
  }
  if (wrapCore) return prefix + wrappedCore;
  return prefix + core;
}

function collectCustom(ctx: FormatContext, node: cst.Custom): CustomCollected {
  const { parser } = ctx;
  const betweenKeywordAndName = collectNewlineAndComments(parser, node.keyword.end);
  const betweenNameAndEq = collectNewlineAndComments(parser, node.name.end);
  const betweenEqAndOriginalType = collectNewlineAndComments(parser, node.eq.end);
  const originalTy = collectTypeExpr(ctx, node.originalType);
  const finalEnd = getLastSpanEndOfTypeExpr(node.originalType);
  const after = collectFollowingComment(parser, finalEnd);
  return {
    node,
    above: [],
    betweenKeywordAndName,
    betweenNameAndEq,
    betweenEqAndOriginalType: [
      ...betweenEqAndOriginalType,
      ...originalTy.above,
    ],
    after,
  };
}

function formatUnion(ctx: FormatContext, node: cst.Union) {
  const { parser, f } = ctx;
  const union = collectUnion(ctx, node);
  const items = collectUnionItems(ctx, node);
  const n = union.node;
  const unionSourceHasNewline = hasLineBreak(
    slice(parser, { start: n.keyword.start, end: n.bracketClose.end }),
  );
  const unionOnelineIntent = hasTightOpenToFirstContent(
    parser,
    n.bracketOpen,
    n.statements.at(0)
      ? getFirstSpanStartOfUnionBlockStatement(n.statements.at(0)!)
      : undefined,
  );
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    n.keyword.start,
    n.bracketOpen,
    n.bracketClose,
    n.statements.at(0)
      ? getFirstSpanStartOfUnionBlockStatement(n.statements.at(0)!)
      : undefined,
    n.statements.at(-1)
      ? getLastSpanEndOfUnionBlockStatement(n.statements.at(-1)!)
      : n.bracketOpen.end,
  );
  const inlineItems = tryFormatUnionItemsOneline(ctx, items.nodes);
  const onelineCandidate = sourceCanBeCollapsed &&
    (!unionSourceHasNewline || unionOnelineIntent) &&
    (!unionSourceHasNewline || items.nodes.every((v) =>
      v.node.type === "UnionItem" && hasUnionItemOnelineIntent(parser, v.node)
    )) &&
    inlineItems != undefined && items.nodes.length < 5 &&
    items.after.every((v) => v.type !== "comment") &&
    items.nodes.every((v) =>
      v.node.type === "UnionItem" &&
      !hasCommentTrivia(v.above) && v.after?.type !== "comment"
    );
  if (onelineCandidate) {
    const onelineText = inlineItems.length === 0
      ? f`${n.keyword} ${n.name} ${n.bracketOpen}${n.bracketClose}`
      : f`${n.keyword} ${n.name} ${n.bracketOpen} ${inlineItems.join(" ")} ${n.bracketClose}`;
    if (lastLineLength(onelineText) <= ctx.config.lineWidth) {
      return prependLeadingTrivia(parser, union.above, onelineText);
    }
  }
  const body = renderUnionBlock(ctx, items);
  return f`
${
    stringifyNewlineOrComments(parser, union.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${body}
${n.bracketClose}`.trim();
}

function collectUnion(
  ctx: FormatContext,
  node: cst.Union,
): NodeWithComment<cst.Union> {
  const { parser } = ctx;
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const above = [...c1, ...c2];
  return { above, node };
}

function collectUnionItems(
  ctx: FormatContext,
  node: cst.Union,
): NodesWithAfters<cst.UnionBlockStatement> {
  const { parser } = ctx;
  let prevEnd = node.bracketOpen.end;
  const nodes: NodeWithComment<cst.UnionBlockStatement>[] = [];
  for (const stmt of node.statements) {
    const c1 = collectNewlineAndComments(parser, prevEnd);
    switch (stmt.type) {
      case "Attribute": {
        const { above, node } = collectAttribute(ctx, stmt);
        nodes.push({ above: [...c1, ...above], node });
        prevEnd = getLastSpanEnd(stmt.content, stmt.name);
        break;
      }
      case "UnionItem": {
        const c2 = collectComments(parser, stmt.name.end);
        const afterBetweenStructAndComma = stmt.struct
          ? collectFollowingComment(parser, stmt.struct.bracketClose.end)
          : undefined;
        const after = afterBetweenStructAndComma ?? collectFollowingComment(
          parser,
          getLastSpanEnd(stmt.struct?.bracketClose, stmt.comma, stmt.name),
        );
        nodes.push({
          above: [...c1, ...c2],
          node: stmt,
          after,
        });
        prevEnd = getLastSpanEnd(
          stmt.struct?.bracketClose,
          stmt.comma,
          stmt.name,
          after?.span,
        );
        break;
      }
    }
  }
  return { nodes, after: collectNewlineAndComments(parser, prevEnd) };
}

function getLastSpanEndOfUnionBlockStatement(
  stmt: cst.UnionBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return getLastSpanEnd(stmt.content, stmt.name);
    case "UnionItem":
      return getLastSpanEnd(stmt.struct?.bracketClose, stmt.comma, stmt.name);
  }
}

function getFirstSpanStartOfUnionBlockStatement(
  stmt: cst.UnionBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return stmt.symbol.start;
    case "UnionItem":
      return stmt.name.start;
  }
}

function getLastSpanEndOfImportItem(item: cst.ImportItem): number {
  return getLastSpanEnd(item.comma, item.alias?.name, item.name);
}

function getLastSpanEndOfStructBlockStatement(
  stmt: cst.StructBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return getLastSpanEnd(stmt.content, stmt.name);
    case "StructField":
      return getLastSpanEnd(stmt.comma, stmt.fieldType.container?.bracketClose, stmt.fieldType.valueType);
  }
}

function getFirstSpanStartOfStructBlockStatement(
  stmt: cst.StructBlockStatement,
): number {
  switch (stmt.type) {
    case "Attribute":
      return stmt.symbol.start;
    case "StructField":
      return stmt.name.start;
  }
}

function hasCommentTrivia(trivia: NewlineOrComment[]): boolean {
  return trivia.some((v) => v.type === "comment");
}

function hasLineBreak(text: string): boolean {
  return /[\r\n]/.test(text);
}

function hasTightOpenToFirstContent(
  parser: Parser,
  blockOpen: cst.Span,
  firstContentStart: number | undefined,
): boolean {
  if (firstContentStart == null) return true;
  return !hasLineBreak(
    slice(parser, { start: blockOpen.end, end: firstContentStart }),
  );
}

function canCollapseDelimitedBlock(
  parser: Parser,
  blockStart: number,
  blockOpen: cst.Span,
  blockClose: cst.Span,
  firstContentStart: number | undefined,
  contentEnd: number,
): boolean {
  const whole = slice(parser, { start: blockStart, end: blockClose.end });
  if (!/[\r\n]/.test(whole)) return true;
  if (firstContentStart != null) {
    const inlineLead = slice(parser, { start: blockOpen.end, end: firstContentStart });
    if (!/[\r\n]/.test(inlineLead)) return true;
  }
  const prefix = slice(parser, { start: blockStart, end: contentEnd });
  const trailing = slice(parser, { start: contentEnd, end: blockClose.start });
  return !/[\r\n]/.test(prefix) && /^[\s\r\n]*$/.test(trailing);
}

function formatUnionItemStruct(
  ctx: FormatContext,
  node: cst.UnionItem,
  config: {
    leadingColumns?: number;
    isLastInParent?: boolean;
    parentMode?: "oneline" | "multiline";
  } = {},
): string {
  const { f, parser } = ctx;
  if (!node.struct) return f`${node.name}${node.comma}`;
  const leadingColumns = config.leadingColumns ?? 0;
  const isLastInParent = config.isLastInParent ?? false;
  const parentMode = config.parentMode ?? "multiline";
  const fields = collectStructLikeStatements(ctx, node.struct.bracketOpen, node.struct.statements);
  const structSourceHasNewline = hasLineBreak(
    slice(parser, { start: node.name.start, end: node.struct.bracketClose.end }),
  );
  const structOnelineIntent = hasTightOpenToFirstContent(
    parser,
    node.struct.bracketOpen,
    node.struct.statements.at(0)
      ? getFirstSpanStartOfStructBlockStatement(node.struct.statements.at(0)!)
      : undefined,
  );
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    node.name.start,
    node.struct.bracketOpen,
    node.struct.bracketClose,
    node.struct.statements.at(0)
      ? getFirstSpanStartOfStructBlockStatement(node.struct.statements.at(0)!)
      : undefined,
    node.struct.statements.at(-1)
      ? getLastSpanEndOfStructBlockStatement(node.struct.statements.at(-1)!)
      : node.struct.bracketOpen.end,
  );
  const onelineCandidate = sourceCanBeCollapsed &&
    (!structSourceHasNewline || structOnelineIntent) &&
    fields.nodes.length < 5 &&
    fields.after.every((v) => v.type !== "comment") &&
    fields.nodes.every((v) =>
      v.node.type === "StructField" && !hasCommentTrivia(v.above) &&
      v.after?.type !== "comment"
    );
  if (onelineCandidate) {
    const inlineFields = fields.nodes.map((wrapped, index, all) => {
      const isLast = index === all.length - 1;
      const field = wrapped.node;
      if (field.type !== "StructField") {
        return unsupportedFormatterType("UnionItemStruct", field.type);
      }
      const comma = listComma(ctx, field.comma, { isLast, mode: "oneline" });
      return f`${field.name}${field.question}${field.colon} ${field.fieldType}${comma}`;
    }).join(" ");
    const itemComma = listComma(ctx, node.comma, {
      isLast: isLastInParent,
      mode: parentMode,
    });
    const onelineText = inlineFields.length === 0
      ? f`${node.name}${node.struct.bracketOpen}${node.struct.bracketClose}${itemComma}`
      : f`${node.name}${node.struct.bracketOpen}${inlineFields}${node.struct.bracketClose}${itemComma}`;
    if (lastLineLength(onelineText) + leadingColumns <= ctx.config.lineWidth) {
      return onelineText;
    }
  }
  const body = renderCollectedBlock(ctx, 1, fields, (stmt, meta) => {
    switch (stmt.type) {
      case "StructField":
        return f`${stmt.name}${stmt.question}${stmt.colon} ${stmt.fieldType}${listComma(ctx, stmt.comma, { isLast: meta.isLast, mode: "multiline" })}`;
      case "Attribute":
        return formatAttributeNode(ctx, stmt);
      default:
        return unsupportedFormatterNode("UnionItemStruct", stmt);
    }
  });
  const itemComma = listComma(ctx, node.comma, {
    isLast: isLastInParent,
    mode: parentMode,
  });
  return f`${node.name}${node.struct.bracketOpen}
${body}
${node.struct.bracketClose}${itemComma}`;
}

function renderUnionBlock(
  ctx: FormatContext,
  items: NodesWithAfters<cst.UnionBlockStatement>,
): string {
  const { parser, f } = ctx;
  const prefix = indentUnit(ctx.config);
  let out = "";
  const { nodes, after } = items;
  for (const wrapped of nodes) {
    const isLast = wrapped == nodes.at(-1);
    const first = wrapped == nodes.at(0);
    const above = stringifyNewlineOrComments(parser, wrapped.above, {
      leadingNewline: true,
    });
    const normalizedAbove = first ? above.trimStart() : above;
    out += indentMultilinePreserve(normalizedAbove, prefix);
    const line = (() => {
      const stmt = wrapped.node;
      switch (stmt.type) {
        case "Attribute":
          return formatAttributeNode(ctx, stmt);
        case "UnionItem":
          return stmt.struct
            ? formatUnionItemStruct(ctx, stmt, {
              leadingColumns: prefix.length,
              isLastInParent: isLast,
              parentMode: "multiline",
            })
            : f`${stmt.name}${listComma(ctx, stmt.comma, { isLast, mode: "multiline" })}`;
        default:
          return unsupportedFormatterNode("Union", stmt);
      }
    })();
    const trailingComment = wrapped.after;
    const moveTrailingCommentAbove =
      trailingComment?.type === "comment" && hasLineBreak(line);
    if (trailingComment && moveTrailingCommentAbove) {
      out += prefix + stringifyNewlineOrComment(parser, trailingComment) + "\n";
    }
    out += indentMultilinePreserve(line, prefix);
    if (trailingComment && !moveTrailingCommentAbove) {
      out += " " + stringifyNewlineOrComment(parser, trailingComment);
    }
  }
  out += stringifyNewlineOrComments(parser, after).trimEnd();
  return out;
}

function tryFormatUnionItemsOneline(
  ctx: FormatContext,
  nodes: NodeWithComment<cst.UnionBlockStatement>[],
): string[] | undefined {
  const { f } = ctx;
  const result: string[] = [];
  for (const [index, wrapped] of nodes.entries()) {
    const isLast = index === nodes.length - 1;
    const item = wrapped.node;
    if (item.type !== "UnionItem") return undefined;
    if (!item.struct) {
      result.push(f`${item.name}${listComma(ctx, item.comma, { isLast, mode: "oneline" })}`);
      continue;
    }
    const rendered = formatUnionItemStruct(ctx, item, {
      isLastInParent: isLast,
      parentMode: "oneline",
    });
    if (hasLineBreak(rendered)) return undefined;
    result.push(rendered);
  }
  return result;
}

function hasUnionItemOnelineIntent(parser: Parser, item: cst.UnionItem): boolean {
  if (!item.struct) return true;
  return hasTightOpenToFirstContent(
    parser,
    item.struct.bracketOpen,
    item.struct.statements.at(0)
      ? getFirstSpanStartOfStructBlockStatement(item.struct.statements.at(0)!)
      : undefined,
  );
}

// type
function collectTypeExpr(
  ctx: FormatContext,
  node: cst.TypeExpression,
): NodeWithComment<cst.TypeExpression> {
  const { parser } = ctx;
  if (!node.container) return { above: [], node };
  /**
   * valueType (c1) [ (c2) keyType (c3) ]
   */
  const c1 = collectNewlineAndComments(parser, node.valueType.end);
  const c2 = collectNewlineAndComments(parser, node.container.bracketOpen.end);
  const c3 = node.container.keyType
    ? collectNewlineAndComments(parser, node.container.keyType.end)
    : [];
  return { above: [...c1, ...c2, ...c3], node };
}
function getLastSpanEndOfTypeExpr(node: cst.TypeExpression) {
  return getLastSpanEnd(node.container?.bracketClose, node.valueType);
}

function getFirstSpanStartOfModuleLevelStatement(
  node: cst.ModuleLevelStatement,
): number {
  switch (node.type) {
    case "Attribute":
      return node.symbol.start;
    case "Custom":
    case "Enum":
    case "Import":
    case "Oneof":
    case "Proc":
    case "Struct":
    case "Union":
      return node.keyword.start;
  }
}

function getLastSpanEndOfModuleLevelStatement(
  parser: Parser,
  node: cst.ModuleLevelStatement,
): number {
  switch (node.type) {
    case "Attribute":
      return getLastSpanEnd(node.content, node.name);
    case "Custom":
      return collectFollowingComment(parser, getLastSpanEndOfTypeExpr(node.originalType))
        ?.span.end ?? getLastSpanEndOfTypeExpr(node.originalType);
    case "Enum":
      return node.bracketClose.end;
    case "Import":
      return node.bracketClose.end;
    case "Oneof":
      return node.bracketClose.end;
    case "Proc":
      return collectFollowingComment(
        parser,
        node.error
          ? getLastSpanEndOfTypeExpr(node.error.errorType)
          : getLastSpanEndOfTypeExpr(node.outputType),
      )?.span.end ??
        (node.error
          ? getLastSpanEndOfTypeExpr(node.error.errorType)
          : getLastSpanEndOfTypeExpr(node.outputType));
    case "Struct":
      return node.bracketClose.end;
    case "Union":
      return node.bracketClose.end;
  }
}

// misc
interface TriviaCacheEntry {
  loc: number;
  trivia: NewlineOrComment[];
}

const triviaCacheByParser = new WeakMap<Parser, TriviaCacheEntry>();
const triviaCacheEnabledByParser = new WeakMap<Parser, boolean>();

function isTriviaCacheEnabled(parser: Parser): boolean {
  return triviaCacheEnabledByParser.get(parser) ?? true;
}

function scanTriviaAt(parser: Parser, loc: number): NewlineOrComment[] {
  return parser.look((scopedParser) => {
    scopedParser.loc = loc;
    const wsOrComments = collectWsAndComments(scopedParser);
    const result: NewlineOrComment[] = [];
    for (const { type, span } of wsOrComments) {
      if (type == "ws") {
        const count = scopedParser.getText(span).split("\n").length - 1;
        if (count > 0) result.push({ type: "newline", count, span });
      }
      if (type == "comment") {
        result.push({ type: "comment", span });
      }
    }
    return result;
  }) ?? [];
}

function collectNewlineAndComments(
  parser: Parser,
  loc: number,
): NewlineOrComment[] {
  if (!isTriviaCacheEnabled(parser)) return scanTriviaAt(parser, loc);
  const cached = triviaCacheByParser.get(parser);
  if (cached && cached.loc === loc) return cached.trivia;
  const result = scanTriviaAt(parser, loc);
  triviaCacheByParser.set(parser, { loc, trivia: result });
  return result;
}
function collectFollowingComment(
  parser: Parser,
  loc: number,
): Comment | undefined {
  const wsOrComment = collectNewlineAndComments(parser, loc)[0];
  if (wsOrComment?.type === "comment") return wsOrComment;
}
function collectComments(parser: Parser, loc: number): Comment[] {
  return collectNewlineAndComments(parser, loc).filter((v) =>
    v.type === "comment"
  );
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
  config?: { leadingNewline: boolean },
) {
  let result = "";
  let prevComment = false;
  for (const newlineOfComment of newlineOrComments) {
    if (newlineOfComment.type === "comment" && prevComment) result += "\n";
    result += stringifyNewlineOrComment(parser, newlineOfComment);
    prevComment = newlineOfComment.type === "comment";
  }
  if (prevComment) result += "\n";
  if (config?.leadingNewline && result[0] != "\n") return "\n" + result;
  return result;
}

function prependLeadingTrivia(
  parser: Parser,
  above: NewlineOrComment[],
  text: string,
): string {
  const leading = stringifyNewlineOrComments(parser, above);
  return leading ? `${leading}${text}` : text;
}

function listComma(
  ctx: FormatContext,
  comma: cst.Span | undefined,
  options: { isLast: boolean; mode: "oneline" | "multiline" },
): string {
  if (options.mode === "oneline" && options.isLast) return "";
  if (options.mode === "multiline" && options.isLast) return ",";
  return comma ? ctx.f`${comma}` : "";
}

function getLastSpanEnd(...nullableSpans: (cst.Span | undefined)[]) {
  const spans = nullableSpans.filter((span) => span != null);
  if (spans.length == 0) {
    throw new Error("At least one span should be non-nullable");
  }
  return Math.max(...spans.map((span) => span.end));
}

function renderCollectedBlock<T>(
  ctx: FormatContext,
  level: number,
  collected: NodesWithAfters<T>,
  renderNode: (node: T, meta: { isLast: boolean }) => string,
): string {
  const { parser } = ctx;
  return indentBlock(ctx, level)(function* () {
    const { nodes, after } = collected;
    for (const wrapped of nodes) {
      const isLast = wrapped == nodes.at(-1);
      const first = wrapped == nodes.at(0);
      const above = stringifyNewlineOrComments(parser, wrapped.above, {
        leadingNewline: true,
      });
      yield first ? above.trimStart() : above;
      const rendered = renderNode(wrapped.node, { isLast });
      const trailingComment = wrapped.after;
      const moveTrailingCommentAbove =
        trailingComment?.type === "comment" && hasLineBreak(rendered);
      if (trailingComment && moveTrailingCommentAbove) {
        yield stringifyNewlineOrComment(parser, trailingComment);
        yield "\n";
      }
      yield rendered;
      if (trailingComment && !moveTrailingCommentAbove) {
        yield " " + stringifyNewlineOrComment(parser, trailingComment);
      }
    }
    yield stringifyNewlineOrComments(parser, after).trimEnd();
  });
}

function unsupportedFormatterNode(scope: string, node: never): never {
  throw new Error(`Formatter: unsupported ${scope} statement ${String(node)}`);
}

function unsupportedFormatterType(scope: string, type: string): never {
  throw new Error(`Formatter: unsupported ${scope} statement ${type}`);
}

function slice(parser: Parser, span: cst.Span): string {
  return parser.getText(span);
}

function formatGap(
  parser: Parser,
  trivia: NewlineOrComment[],
  fallback: string,
): string {
  if (trivia.length === 0) return fallback;
  if (trivia.every((v) => v.type === "newline")) return fallback;
  return stringifyNewlineOrComments(parser, trivia);
}

function lastLineLength(text: string): number {
  const lines = text.split("\n");
  return lines.at(-1)?.length ?? 0;
}

function maxLineLength(text: string): number {
  return Math.max(...text.split("\n").map((line) => line.length));
}

function indentUnit(config: FormatConfig): string {
  if (config.indent.type === "tab") return "\t".repeat(config.indent.count);
  return " ".repeat(config.indent.count);
}

function indentBlock(
  ctx: FormatContext,
  level: number,
) {
  const prefix = indentUnit(ctx.config).repeat(level);
  return (cb: () => Generator<string>) => indentGeneratedText(cb(), prefix);
}

function indentGeneratedText(chunks: Generator<string>, prefix: string): string {
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

function indentMultilinePreserve(text: string, prefix: string): string {
  return text.split("\n").map((line) => {
    if (line.trim().length === 0) return line;
    return prefix + line;
  }).join("\n");
}

const createSpanFormatter = (parser: Parser) =>
(
  strings: TemplateStringsArray,
  ...args: SpanFormatterArg[]
) => {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    const arg = args[i];
    if (arg == undefined || arg === false) continue;
    if (typeof arg === "string") {
      result += arg;
      continue;
    }
    if ("valueType" in arg) {
      result += slice(parser, arg.valueType);
      if (arg.container) {
        result += slice(parser, arg.container.bracketOpen);
        if (arg.container.keyType) {
          result += slice(parser, arg.container.keyType);
        }
        result += slice(parser, arg.container.bracketClose);
      }
      continue;
    }
    result += slice(parser, arg);
  }
  return result;
};
