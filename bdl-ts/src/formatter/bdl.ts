import type { Span } from "@disjukr/bdl/ast";
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
}
export interface FormatConfigInput {
  lineWidth?: number;
  indent?: Partial<FormatConfig["indent"]>;
  finalNewline?: boolean;
}

const defaultFormatConfig: FormatConfig = {
  lineWidth: 80,
  indent: { type: "space", count: 2 },
  finalNewline: true,
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
  const ctx: FormatContext = {
    parser,
    f: createSpanFormatter(parser),
    config: resolvedConfig,
  };
  let cst: BdlCst;
  try {
    cst = parseBdlCst(text);
  } catch (error) {
    throw new Error(`Formatter parse failed: ${stringifyUnknownError(error)}`);
  }
  try {
    return formatBdlCst(cst);
  } catch (error) {
    throw new Error(`Formatter failed: ${stringifyUnknownError(error)}`);
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
      prevEnd = getLastSpanEndOfModuleLevelStatement(stmt);
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
  const indentType = config.indent?.type ?? defaultFormatConfig.indent.type;
  const indentCount = config.indent?.count ?? defaultFormatConfig.indent.count;
  return {
    lineWidth: config.lineWidth ?? defaultFormatConfig.lineWidth,
    indent: {
      type: indentType,
      count: indentCount,
    },
    finalNewline: config.finalNewline ?? defaultFormatConfig.finalNewline,
  };
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

// import
function formatImport(ctx: FormatContext, node: cst.Import) {
  const { parser, f } = ctx;
  const collectedImport = collectImport(ctx, node);
  const importItems = collectImportItems(ctx, node);
  const n = collectedImport.node;
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
  if (content.startsWith("|")) return f`${node.symbol} ${node.name}\n${node.content}`;
  if (content.startsWith("-")) return f`${node.symbol} ${node.name} ${node.content}`;
  return f`${node.symbol} ${node.name}`;
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
    indentBlock(ctx, 1)(function* () {
      const { nodes, after } = fields;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above, {
          leadingNewline: true,
        });
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.type == "StructField") {
          yield f`${n.name}${n.question}${n.colon} ${n.fieldType}${n.comma}`;
        }
        if (n.type == "Attribute") {
          yield formatAttributeNode(ctx, n);
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
  const onelineCandidate = items.nodes.length < 5 &&
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
          const item = f`${n.itemType}${n.comma}`;
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
  return f`
${
    stringifyNewlineOrComments(parser, oneof.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${
    indentBlock(ctx, 1)(function* () {
      const { nodes, after } = items;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above, {
          leadingNewline: true,
        });
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.type == "OneofItem") yield f`${n.itemType}${n.comma}`;
        if (n.type == "Attribute") {
          yield formatAttributeNode(ctx, n);
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

// enum
function formatEnum(ctx: FormatContext, node: cst.Enum) {
  const { parser, f } = ctx;
  const e = collectEnum(ctx, node);
  const items = collectEnumItems(ctx, node);
  const n = e.node;
  return f`
${
    stringifyNewlineOrComments(parser, e.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${
    indentBlock(ctx, 1)(function* () {
      const { nodes, after } = items;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above, {
          leadingNewline: true,
        });
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.type == "EnumItem") {
          yield f`${n.name}${n.comma}`;
        }
        if (n.type == "Attribute") {
          yield formatAttributeNode(ctx, n);
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

function formatProc(ctx: FormatContext, node: cst.Proc) {
  const { parser, f } = ctx;
  const proc = collectProc(ctx, node);
  const prefix = stringifyNewlineOrComments(parser, proc.above);
  const suffix = proc.after ? ` ${stringifyNewlineOrComment(parser, proc.after)}` : "";
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

  return prefix + picked + suffix;
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
  let result = "";
  result += stringifyNewlineOrComments(parser, custom.above);
  result += f`${n.keyword}`;
  result += formatGap(parser, custom.betweenKeywordAndName, " ");
  result += f`${n.name}`;
  result += formatGap(parser, custom.betweenNameAndEq, " ");
  result += f`${n.eq}`;
  result += formatGap(parser, custom.betweenEqAndOriginalType, " ");
  result += f`${n.originalType}`;
  if (custom.after) {
    result += ` ${stringifyNewlineOrComment(parser, custom.after)}`;
  }
  return result;
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
  return f`
${
    stringifyNewlineOrComments(parser, union.above)
  }${n.keyword} ${n.name} ${n.bracketOpen}
${
    indentBlock(ctx, 1)(function* () {
      const { nodes, after } = items;
      for (const node of nodes) {
        const first = node == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, node.above, {
          leadingNewline: true,
        });
        yield first ? above.trimStart() : above;
        const n = node.node;
        if (n.type == "Attribute") {
          yield formatAttributeNode(ctx, n);
        }
        if (n.type == "UnionItem") {
          if (!n.struct) {
            yield f`${n.name}${n.comma}`;
          } else {
            yield formatUnionItemStruct(ctx, n);
          }
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
        const c3 = stmt.struct
          ? collectComments(parser, stmt.struct.bracketOpen.end)
          : [];
        const c4 = stmt.struct
          ? collectComments(parser, stmt.struct.bracketClose.end)
          : [];
        const after = collectFollowingComment(
          parser,
          getLastSpanEnd(stmt.struct?.bracketClose, stmt.comma, stmt.name),
        );
        nodes.push({
          above: [...c1, ...c2, ...c3, ...c4],
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

function formatUnionItemStruct(ctx: FormatContext, node: cst.UnionItem): string {
  const { f, parser } = ctx;
  if (!node.struct) return f`${node.name}${node.comma}`;
  const fields = collectStructLikeStatements(ctx, node.struct.bracketOpen, node.struct.statements);
  return f`${node.name} ${node.struct.bracketOpen}
${
    indentBlock(ctx, 2)(function* () {
      const { nodes, after } = fields;
      for (const fieldNode of nodes) {
        const first = fieldNode == nodes.at(0);
        const above = stringifyNewlineOrComments(parser, fieldNode.above, {
          leadingNewline: true,
        });
        yield first ? above.trimStart() : above;
        const n = fieldNode.node;
        if (n.type == "StructField") {
          yield f`${n.name}${n.question}${n.colon} ${n.fieldType}${n.comma}`;
        }
        if (n.type == "Attribute") {
          yield formatAttributeNode(ctx, n);
        }
        if (fieldNode.after) {
          yield " " + stringifyNewlineOrComment(parser, fieldNode.after);
        }
      }
      yield stringifyNewlineOrComments(parser, after).trimEnd();
    })
  }
${node.struct.bracketClose}${node.comma}`;
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
  node: cst.ModuleLevelStatement,
): number {
  switch (node.type) {
    case "Attribute":
      return getLastSpanEnd(node.content, node.name);
    case "Custom":
      return getLastSpanEndOfTypeExpr(node.originalType);
    case "Enum":
      return node.bracketClose.end;
    case "Import":
      return node.bracketClose.end;
    case "Oneof":
      return node.bracketClose.end;
    case "Proc":
      return node.error
        ? getLastSpanEndOfTypeExpr(node.error.errorType)
        : getLastSpanEndOfTypeExpr(node.outputType);
    case "Struct":
      return node.bracketClose.end;
    case "Union":
      return node.bracketClose.end;
  }
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
  return (cb: () => Generator<string>) => {
    return cb().toArray().join("").split("\n").map((line) =>
      line.trim() ? prefix + line.trim() : line
    )
      .join("\n");
  };
}

const createSpanFormatter = (parser: Parser) =>
(
  strings: TemplateStringsArray,
  ...args: (Span | cst.TypeExpression | string | undefined | false)[]
) => {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    const arg = args[i - 1];
    if (arg) {
      if (typeof arg === "string") result += arg;
      if (typeof arg === "object") {
        if ("valueType" in arg) {
          result += slice(parser, arg.valueType);
          if (arg.container) {
            result += slice(parser, arg.container.bracketOpen);
            if (arg.container.keyType) {
              result += slice(parser, arg.container.keyType);
            }
            result += slice(parser, arg.container.bracketClose);
          }
        } else {
          result += slice(parser, arg);
        }
      }
    }
    result += strings[i];
  }
  return result;
};
