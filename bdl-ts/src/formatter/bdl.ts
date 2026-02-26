import type { BdlCst } from "../generated/cst.ts";
import type * as cst from "../generated/cst.ts";
import parseBdlCst from "../parser/bdl/cst-parser.ts";
import { Parser } from "../parser/parser.ts";
import { collectDelimitedNodes } from "./bdl/collect.ts";
import {
  indentGeneratedText,
  indentMultilinePreserve,
  indentUnit,
  lastLineLength,
  maxLineLength,
} from "./bdl/layout.ts";
import {
  canCollapseDelimitedBlock,
  canUseOnelineBlock,
  hasLineBreak,
  hasTightOpenToFirstContent,
} from "./bdl/oneline.ts";
import {
  collectComments,
  collectFollowingComment,
  collectNewlineAndComments,
  prependLeadingTrivia,
  setTriviaCacheEnabled,
  stringifyNewlineOrComment,
  stringifyNewlineOrComments,
} from "./bdl/trivia.ts";
import type {
  Comment,
  FormatConfig,
  FormatConfigInput,
  FormatContext,
  NewlineOrComment,
  NodeWithComment,
  NodesWithAfters,
  SpanFormatterArg,
} from "./bdl/types.ts";

export type { FormatConfig, FormatConfigInput } from "./bdl/types.ts";

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

interface SortableImportUnit {
  startIndex: number;
  endIndex: number;
  importNode: cst.Import;
  leadingGap: string;
}

export function formatBdl(
  text: string,
  config: FormatConfigInput = {},
): string {
  if (hasFmtIgnoreFileDirective(text)) return text;
  const parser = new Parser(text);
  const resolvedConfig = resolveFormatConfig(config);
  setTriviaCacheEnabled(parser, resolvedConfig.triviaCache);
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
    for (let index = 0; index < cst.statements.length; index++) {
      const stmt = cst.statements[index];
      const start = getFirstSpanStartOfModuleLevelStatement(stmt);
      const interStatementText = slice(parser, { start: prevEnd, end: start });
      const ignoreNextStatement = hasFmtIgnoreDirectiveInRange(parser.input, prevEnd, start);
      const normalizedGap = ignoreNextStatement
        ? interStatementText
        : normalizeInterStatementGap(interStatementText);

      if (!ignoreNextStatement) {
        const sortableRun = collectSortableImportRun(cst.statements, index, prevEnd, parser);
        if (sortableRun.length > 1) {
          const firstUnit = sortableRun[0];
          const firstUnitStart = getFirstSpanStartOfModuleLevelStatement(
            cst.statements[firstUnit.startIndex],
          );
          const firstSplit = splitDetachedRunLeadingGap(
            firstUnit.leadingGap,
            hasInlineTrailingCommentInRange(parser.input, prevEnd, firstUnitStart),
          );
          const adjustedLeadingGap = new Map<SortableImportUnit, string>(
            sortableRun.map((unit) => [
              unit,
              unit === firstUnit ? firstSplit.movable : unit.leadingGap,
            ]),
          );
          const sortedRun = stableSortBy(sortableRun, (entry) =>
            getImportSortKey(parser, entry.importNode)
          );
          const anchoredGap = normalizeInterStatementGap(firstSplit.anchored);
          const hasAnchoredGap = anchoredGap.length > 0;
          if (anchoredGap.length > 0) {
            result += anchoredGap;
          }
          for (let runIndex = 0; runIndex < sortedRun.length; runIndex++) {
            let gap = normalizeInterStatementGap(adjustedLeadingGap.get(sortedRun[runIndex]) ?? "");
            if (runIndex === 0) {
              gap = stripLeadingLineBreaks(gap);
            }
            if (result.length > 0) {
              if (runIndex === 0 && hasAnchoredGap && gap.length === 0) {
                // anchored gap already established separation before first sorted unit
              } else 
              if (gap.length === 0) result += "\n";
              else if (!gap.startsWith("\n") && !gap.startsWith("\r\n")) result += "\n" + gap;
              else result += gap;
            } else {
              result += gap;
            }
            result += formatModuleLevelUnit(cst, sortedRun[runIndex]).trimEnd();
          }
          index = sortableRun.at(-1)!.endIndex;
          prevEnd = getLastSpanEndOfModuleLevelStatement(
            parser,
            cst.statements[sortableRun.at(-1)!.endIndex],
          );
          continue;
        }
      }

      if (result.length > 0 && normalizedGap.length === 0) {
        result += "\n";
      } else {
        result += normalizedGap;
      }
      if (ignoreNextStatement) {
        let endIndex = index;
        if (stmt.type === "Attribute") {
          while (
            endIndex + 1 < cst.statements.length &&
            cst.statements[endIndex + 1].type === "Attribute"
          ) {
            endIndex++;
          }
          if (endIndex + 1 < cst.statements.length) {
            endIndex++;
          }
        }
        const end = getLastSpanEndOfModuleLevelStatement(parser, cst.statements[endIndex]);
        result += slice(parser, { start, end });
        index = endIndex;
        prevEnd = end;
      } else {
        result += formatModuleLevelStatement(stmt).trimEnd();
        prevEnd = getLastSpanEndOfModuleLevelStatement(parser, stmt);
      }
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

  function formatModuleLevelUnit(cst: BdlCst, unit: SortableImportUnit): string {
    let out = "";
    let prevUnitEnd = getFirstSpanStartOfModuleLevelStatement(
      cst.statements[unit.startIndex],
    );
    for (let index = unit.startIndex; index <= unit.endIndex; index++) {
      const current = cst.statements[index];
      const currentStart = getFirstSpanStartOfModuleLevelStatement(current);
      if (index > unit.startIndex) {
        const gap = slice(parser, { start: prevUnitEnd, end: currentStart });
        const normalizedGap = normalizeInterStatementGap(gap);
        if (out.length > 0 && normalizedGap.length === 0) out += "\n";
        else out += normalizedGap;
      }
      out += formatModuleLevelStatement(current).trimEnd();
      prevUnitEnd = getLastSpanEndOfModuleLevelStatement(parser, current);
    }
    return out;
  }
}

function hasFmtIgnoreFileDirective(source: string): boolean {
  return /^\s*\/\/\s*bdlc-fmt-ignore-file\s*$/m.test(source);
}

function hasFmtIgnoreDirectiveInRange(
  source: string,
  start: number,
  end: number,
): boolean {
  const text = source.slice(start, end);
  const pattern = /[ \t]*\/\/\s*bdlc-fmt-ignore\s*$/gm;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(text)) != null) {
    const absoluteStart = start + match.index;
    if (isOnlyWhitespaceBeforeInSameLine(source, absoluteStart)) return true;
  }
  return false;
}

function hasFmtIgnoreDirectiveBeforeNode(
  parser: Parser,
  trivia: NewlineOrComment[],
  nodeStart: number,
): boolean {
  return findFmtIgnoreDirectiveStartBeforeNode(parser, trivia, nodeStart) != null;
}

function findFmtIgnoreDirectiveStartBeforeNode(
  parser: Parser,
  trivia: NewlineOrComment[],
  nodeStart: number,
): number | undefined {
  const match = trivia.find((item) =>
    item.type === "comment" &&
    item.span.start < nodeStart &&
    isFmtIgnoreDirectiveComment(parser, item.span) &&
    isCommentAtLineStart(parser, item.span.start)
  );
  return match?.type === "comment" ? match.span.start : undefined;
}

function isFmtIgnoreDirectiveComment(parser: Parser, span: cst.Span): boolean {
  return /^\s*\/\/\s*bdlc-fmt-ignore\s*$/.test(parser.getText(span));
}

function isCommentAtLineStart(parser: Parser, start: number): boolean {
  if (start <= 0) return true;
  return isOnlyWhitespaceBeforeInSameLine(parser.input, start);
}

function isOnlyWhitespaceBeforeInSameLine(source: string, start: number): boolean {
  for (let index = start - 1; index >= 0; index--) {
    const ch = source[index];
    if (ch === " " || ch === "\t") continue;
    return ch === "\n" || ch === "\r";
  }
  return true;
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
  const sortedImportNodes = sortImportItemNodes(parser, importItems.nodes);
  const n = collectedImport.node;
  const sourceCanBeCollapsed = canCollapseDelimitedBlock(
    parser,
    n.keyword.start,
    n.bracketOpen,
    n.bracketClose,
    n.items.at(0)?.name.start,
    n.items.at(-1) ? getLastSpanEndOfImportItem(n.items.at(-1)!) : n.bracketOpen.end,
  );
  const onelineCandidate = !hasCommentTrivia(collectedImport.above) &&
    canUseOnelineBlock({
      sourceCanBeCollapsed,
      nodes: sortedImportNodes,
      after: importItems.after,
      canInlineNode: () => true,
    });
  if (onelineCandidate) {
    const pathText = n.path.map((path) => f`${path}`).join("");
    const inlineItems = sortedImportNodes.map((wrapped, index, all) => {
      const isLast = index === all.length - 1;
      const item = wrapped.node;
      const comma = importItemComma("oneline", isLast);
      return item.alias
        ? f`${item.name} ${item.alias.as} ${item.alias.name}${comma}`
        : f`${item.name}${comma}`;
    }).join(" ");
    const onelineText = inlineItems.length === 0
      ? f`${n.keyword} ${pathText} ${n.bracketOpen}${n.bracketClose}`
      : f`${n.keyword} ${pathText} ${n.bracketOpen} ${inlineItems} ${n.bracketClose}`;
    const withAfter = collectedImport.after
      ? onelineText + " " + stringifyNewlineOrComment(parser, collectedImport.after)
      : onelineText;
    if (lastLineLength(withAfter) <= ctx.config.lineWidth) {
      return withAfter;
    }
  }
  const importItemPrefix = indentUnit(ctx.config);
  const importMarkerSalt = createRawMarkerSalt();
  const importRawReplacements: Array<{ marker: string; replacement: string }> = [];
  const importItemsText = indentBlock(ctx, 1)(function* () {
    const { after } = importItems;
    const nodes = sortedImportNodes;
    for (const node of nodes) {
      const isLast = node == nodes.at(-1);
      const first = node == nodes.at(0);
      const above = stringifyNewlineOrComments(parser, node.above);
      if (!first && above.length == 0) yield "\n";
      yield first ? above.trimStart() : above;
      const n = node.node;
      if (hasFmtIgnoreDirectiveBeforeNode(parser, node.above, n.name.start)) {
        const rawEnd = node.after?.type === "comment"
          ? node.after.span.end
          : getLastSpanEndOfImportItem(n);
        const markerToken = createRawMarkerToken(importMarkerSalt, importRawReplacements.length);
        importRawReplacements.push({
          marker: importItemPrefix + markerToken,
          replacement: indentFirstLine(slice(parser, { start: n.name.start, end: rawEnd }), importItemPrefix),
        });
        yield markerToken;
        continue;
      }
      const comma = importItemComma("multiline", isLast);
      if (n.alias) yield f`${n.name} ${n.alias.as} ${n.alias.name}${comma}`;
      else yield f`${n.name}${comma}`;
      if (node.after) {
        yield " " + stringifyNewlineOrComment(parser, node.after);
      }
    }
    yield stringifyNewlineOrComments(parser, after).trimEnd();
  });
  const rendered = f`
${stringifyNewlineOrComments(parser, collectedImport.above)}${n.keyword} ${
    indentBlock(ctx, 0)(function* () {
      for (const path of n.path) yield f`${path}`;
    })
  } ${n.bracketOpen}
${applyRawLineReplacements(importItemsText, importRawReplacements)}
${n.bracketClose}`.trim();
  if (collectedImport.after) {
    return rendered + " " + stringifyNewlineOrComment(parser, collectedImport.after);
  }
  return rendered;
}

function importItemComma(mode: "oneline" | "multiline", isLast: boolean): string {
  if (mode === "oneline") return isLast ? "" : ",";
  return ",";
}
function collectImport(
  ctx: FormatContext,
  node: cst.Import,
): NodeWithComment<cst.Import> {
  const { parser } = ctx;
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = node.path.flatMap((path) => collectComments(parser, path.end));
  const after = collectFollowingComment(parser, node.bracketClose.end);
  const above = [...c1, ...c2];
  return { above, node, after };
}
function collectImportItems(
  ctx: FormatContext,
  node: cst.Import,
): NodesWithAfters<cst.ImportItem> {
  const { parser } = ctx;
  return collectDelimitedNodes(
    parser,
    node.bracketOpen.end,
    node.items,
    (item, { leading }) => {
      const c1 = collectComments(parser, item.name.end);
      const c2 = item.alias
        ? collectComments(parser, item.alias.as.end)
        : [];
      const c3 = item.alias
        ? collectComments(parser, item.alias.name.end)
        : [];
      const after = collectFollowingComment(
        parser,
        getLastSpanEnd(item.comma, item.alias?.name, item.name),
      );
      const comments = [...c1, ...c2, ...c3];
      if (after) comments.push(after);
      const last = comments.pop();
      return {
        wrapped: {
          above: [...leading, ...comments],
          node: item,
          after: last,
        },
        nextEnd: getLastSpanEnd(
          last?.span,
          item.comma,
          item.alias?.name,
          item.name,
        ),
      };
    },
  );
}

function sortImportItemNodes(
  parser: Parser,
  nodes: NodeWithComment<cst.ImportItem>[],
): NodeWithComment<cst.ImportItem>[] {
  if (nodes.some((wrapped) => hasFmtIgnoreDirectiveBeforeNode(parser, wrapped.above, wrapped.node.name.start))) {
    return nodes;
  }
  if (nodes.some((wrapped) => hasCommentTrivia(wrapped.above) || wrapped.after?.type === "comment")) {
    return nodes;
  }
  return stableSortBy(nodes, (wrapped) => getImportItemSortKey(parser, wrapped.node));
}

function getImportSortKey(parser: Parser, node: cst.Import): string {
  return node.path.map((path) => parser.getText(path)).join("");
}

function getImportItemSortKey(parser: Parser, item: cst.ImportItem): string {
  const name = parser.getText(item.name);
  const alias = item.alias ? parser.getText(item.alias.name) : "";
  return `${name}\u0000${alias}`;
}

function collectSortableImportRun(
  statements: cst.ModuleLevelStatement[],
  startIndex: number,
  runStartBoundary: number,
  parser: Parser,
): SortableImportUnit[] {
  const first = getSortableImportUnitAt(statements, startIndex, runStartBoundary, parser);
  if (!first) return [];
  const run: SortableImportUnit[] = [first];
  let prev = first;
  for (let index = first.endIndex + 1; index < statements.length;) {
    const current = getSortableImportUnitAt(
      statements,
      index,
      getLastSpanEndOfModuleLevelStatement(parser, statements[prev.endIndex]),
      parser,
    );
    if (!current) break;
    const betweenStart = getLastSpanEndOfModuleLevelStatement(
      parser,
      statements[prev.endIndex],
    );
    const betweenEnd = getFirstSpanStartOfModuleLevelStatement(statements[current.startIndex]);
    if (!isSortableImportGap(parser.input, betweenStart, betweenEnd)) break;
    if (hasFmtIgnoreDirectiveInRange(parser.input, betweenStart, betweenEnd)) break;
    run.push(current);
    prev = current;
    index = current.endIndex + 1;
  }
  return run;
}

function getSortableImportUnitAt(
  statements: cst.ModuleLevelStatement[],
  index: number,
  leadingGapStart: number,
  parser: Parser,
): SortableImportUnit | undefined {
  const current = statements[index];
  if (!current) return undefined;
  if (current.type === "Import") {
    return {
      startIndex: index,
      endIndex: index,
      importNode: current,
      leadingGap: parser.input.slice(
        leadingGapStart,
        getFirstSpanStartOfModuleLevelStatement(current),
      ),
    };
  }
  if (current.type !== "Attribute") return undefined;
  if (!isImportAssociatedAttribute(parser, current)) return undefined;
  let endIndex = index;
  while (endIndex + 1 < statements.length && statements[endIndex + 1].type === "Attribute") {
    const nextAttr = statements[endIndex + 1];
    if (nextAttr.type !== "Attribute") break;
    if (!isImportAssociatedAttribute(parser, nextAttr)) return undefined;
    const currentAttrEnd = getLastSpanEndOfModuleLevelStatement(parser, statements[endIndex]);
    const nextAttrStart = getFirstSpanStartOfModuleLevelStatement(statements[endIndex + 1]);
    if (hasFmtIgnoreDirectiveInRange(parser.input, currentAttrEnd, nextAttrStart)) {
      return undefined;
    }
    endIndex++;
  }
  const next = statements[endIndex + 1];
  if (next?.type !== "Import") return undefined;
  const betweenAttrAndImportStart = getLastSpanEndOfModuleLevelStatement(parser, statements[endIndex]);
  const betweenAttrAndImportEnd = getFirstSpanStartOfModuleLevelStatement(next);
  if (hasFmtIgnoreDirectiveInRange(parser.input, betweenAttrAndImportStart, betweenAttrAndImportEnd)) {
    return undefined;
  }
  return {
    startIndex: index,
    endIndex: endIndex + 1,
    importNode: next,
    leadingGap: parser.input.slice(
      leadingGapStart,
      getFirstSpanStartOfModuleLevelStatement(current),
    ),
  };
}

function isImportAssociatedAttribute(parser: Parser, attr: cst.Attribute): boolean {
  return parser.getText(attr.symbol) === "@";
}

function isSortableImportGap(source: string, start: number, end: number): boolean {
  let index = start;
  while (index < end) {
    const ch = source[index];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      index++;
      continue;
    }
    if (ch === "/" && source[index + 1] === "/") {
      if (!isOnlyWhitespaceBeforeInSameLine(source, index)) return false;
      index += 2;
      while (index < end && source[index] !== "\n" && source[index] !== "\r") {
        index++;
      }
      continue;
    }
    return false;
  }
  return true;
}

function stableSortBy<T>(items: T[], keySelector: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, key: keySelector(item) }))
    .sort((a, b) => {
      const compared = a.key.localeCompare(b.key);
      if (compared !== 0) return compared;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
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
  const onelineCandidate = canUseOnelineBlock({
    sourceCanBeCollapsed,
    nodes: fields.nodes,
    after: fields.after,
    canInlineNode: (stmt) => stmt.type === "StructField",
  });
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
  }, getRawSpanOfStructBlockStatement);
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
  const onelineCandidate = canUseOnelineBlock({
    sourceCanBeCollapsed,
    nodes: items.nodes,
    after: items.after,
    canInlineNode: (stmt) => stmt.type === "OneofItem",
  });
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
  }, getRawSpanOfOneofBlockStatement);
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
  return collectDelimitedNodes(
    parser,
    node.bracketOpen.end,
    node.statements,
    (stmt, { leading }) => {
      switch (stmt.type) {
        case "Attribute": {
          const { above, node } = collectAttribute(ctx, stmt);
          return {
            wrapped: { above: [...leading, ...above], node },
            nextEnd: getLastSpanEnd(stmt.content, stmt.name),
          };
        }
        case "OneofItem": {
          const ty = collectTypeExpr(ctx, stmt.itemType);
          const c2 = collectComments(
            parser,
            getLastSpanEndOfTypeExpr(stmt.itemType),
          );
          const after = collectFollowingComment(
            parser,
            getLastSpanEnd(stmt.itemType.valueType, stmt.comma),
          );
          return {
            wrapped: {
              above: [...ty.above, ...leading, ...c2],
              node: stmt,
              after,
            },
            nextEnd: getLastSpanEnd(
              stmt.comma,
              stmt.itemType.valueType,
              after?.span,
            ),
          };
        }
      }
    },
  );
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

function getRawSpanOfOneofBlockStatement(
  stmt: cst.OneofBlockStatement,
): { start: number; end: number } {
  return {
    start: getFirstSpanStartOfOneofBlockStatement(stmt),
    end: getLastSpanEndOfOneofBlockStatement(stmt),
  };
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
  const onelineCandidate = canUseOnelineBlock({
    sourceCanBeCollapsed,
    nodes: items.nodes,
    after: items.after,
    canInlineNode: (stmt) => stmt.type === "EnumItem",
  });
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
  }, getRawSpanOfEnumBlockStatement);
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
  return collectDelimitedNodes(
    parser,
    node.bracketOpen.end,
    node.statements,
    (stmt, { leading }) => {
      switch (stmt.type) {
        case "Attribute": {
          const { above, node } = collectAttribute(ctx, stmt);
          return {
            wrapped: { above: [...leading, ...above], node },
            nextEnd: getLastSpanEnd(stmt.content, stmt.name),
          };
        }
        case "EnumItem": {
          const c2 = collectComments(parser, stmt.name.end);
          const after = collectFollowingComment(
            parser,
            getLastSpanEnd(stmt.name, stmt.comma),
          );
          return {
            wrapped: {
              above: [...leading, ...c2],
              node: stmt,
              after,
            },
            nextEnd: getLastSpanEnd(
              stmt.name,
              stmt.comma,
              after?.span,
            ),
          };
        }
      }
    },
  );
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

function getRawSpanOfEnumBlockStatement(
  stmt: cst.EnumBlockStatement,
): { start: number; end: number } {
  return {
    start: getFirstSpanStartOfEnumBlockStatement(stmt),
    end: getLastSpanEndOfEnumBlockStatement(stmt),
  };
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
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const betweenKeywordAndName = collectNewlinesOnly(parser, node.keyword.end);
  const betweenNameAndEq = collectNewlinesOnly(parser, node.name.end);
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
    above: [...c1, ...c2],
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
  const c1 = collectComments(parser, node.keyword.end);
  const c2 = collectComments(parser, node.name.end);
  const betweenKeywordAndName = collectNewlinesOnly(parser, node.keyword.end);
  const betweenNameAndEq = collectNewlinesOnly(parser, node.name.end);
  const betweenEqAndOriginalType = collectNewlineAndComments(parser, node.eq.end);
  const originalTy = collectTypeExpr(ctx, node.originalType);
  const finalEnd = getLastSpanEndOfTypeExpr(node.originalType);
  const after = collectFollowingComment(parser, finalEnd);
  return {
    node,
    above: [...c1, ...c2],
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
  const onelineCandidate = inlineItems != undefined &&
    canUseOnelineBlock({
      sourceCanBeCollapsed,
      sourceHasNewline: unionSourceHasNewline,
      sourceOnelineIntent: unionOnelineIntent,
      nodes: items.nodes,
      after: items.after,
      canInlineNode: (stmt) => stmt.type === "UnionItem",
      hasNodeOnelineIntent: (stmt) =>
        stmt.type === "UnionItem" ? hasUnionItemOnelineIntent(parser, stmt) : false,
    });
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
  return collectDelimitedNodes(
    parser,
    node.bracketOpen.end,
    node.statements,
    (stmt, { leading }) => {
      switch (stmt.type) {
        case "Attribute": {
          const { above, node } = collectAttribute(ctx, stmt);
          return {
            wrapped: { above: [...leading, ...above], node },
            nextEnd: getLastSpanEnd(stmt.content, stmt.name),
          };
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
          return {
            wrapped: {
              above: [...leading, ...c2],
              node: stmt,
              after,
            },
            nextEnd: getLastSpanEnd(
              stmt.struct?.bracketClose,
              stmt.comma,
              stmt.name,
              after?.span,
            ),
          };
        }
      }
    },
  );
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

function getRawSpanOfUnionBlockStatement(
  stmt: cst.UnionBlockStatement,
): { start: number; end: number } {
  return {
    start: getFirstSpanStartOfUnionBlockStatement(stmt),
    end: getLastSpanEndOfUnionBlockStatement(stmt),
  };
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

function getRawSpanOfStructBlockStatement(
  stmt: cst.StructBlockStatement,
): { start: number; end: number } {
  return {
    start: getFirstSpanStartOfStructBlockStatement(stmt),
    end: getLastSpanEndOfStructBlockStatement(stmt),
  };
}

function hasCommentTrivia(trivia: NewlineOrComment[]): boolean {
  return trivia.some((v) => v.type === "comment");
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
  const onelineCandidate = canUseOnelineBlock({
    sourceCanBeCollapsed,
    sourceHasNewline: structSourceHasNewline,
    sourceOnelineIntent: structOnelineIntent,
    nodes: fields.nodes,
    after: fields.after,
    canInlineNode: (stmt) => stmt.type === "StructField",
  });
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
  }, getRawSpanOfStructBlockStatement);
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
  for (let index = 0; index < nodes.length; index++) {
    const wrapped = nodes[index];
    const isLast = index === nodes.length - 1;
    const first = index === 0;
    const above = stringifyNewlineOrComments(parser, wrapped.above, {
      leadingNewline: true,
    });
    const normalizedAbove = first ? above.trimStart() : above;
    out += indentMultilinePreserve(normalizedAbove, prefix);
    const unionNodeStart = getRawSpanOfUnionBlockStatement(wrapped.node).start;
    if (hasFmtIgnoreDirectiveBeforeNode(parser, wrapped.above, unionNodeStart)) {
      let endIndex = index;
      if (wrapped.node.type === "Attribute") {
        while (endIndex + 1 < nodes.length && nodes[endIndex + 1].node.type === "Attribute") {
          endIndex++;
        }
        if (endIndex + 1 < nodes.length) {
          endIndex++;
        }
      }
      const startRaw = getRawSpanOfUnionBlockStatement(wrapped.node).start;
      const endWrapped = nodes[endIndex];
      const endRaw = getRawSpanOfUnionBlockStatement(endWrapped.node).end;
      const endComment = endWrapped.after?.type === "comment"
        ? endWrapped.after.span.end
        : endRaw;
      out += indentFirstLine(slice(parser, { start: startRaw, end: endComment }), prefix);
      index = endIndex;
      continue;
    }
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
      return collectFollowingComment(parser, node.bracketClose.end)
        ?.span.end ?? node.bracketClose.end;
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
  getRawSpan?: (node: T) => { start: number; end: number },
): string {
  const { parser } = ctx;
  const prefix = indentUnit(ctx.config).repeat(level);
  const blockMarkerSalt = createRawMarkerSalt();
  const rawReplacements: Array<{ marker: string; replacement: string }> = [];
  const renderedBlock = indentBlock(ctx, level)(function* () {
    const { nodes, after } = collected;
    for (let index = 0; index < nodes.length; index++) {
      const wrapped = nodes[index];
      const isLast = index === nodes.length - 1;
      const first = index === 0;
      const nodeStart = getRawSpan?.(wrapped.node).start;
      const directiveStart = nodeStart == null
        ? undefined
        : findFmtIgnoreDirectiveStartBeforeNode(parser, wrapped.above, nodeStart);
      if (getRawSpan && directiveStart != null) {
        let endIndex = index;
        const currentNode = wrapped.node as { type?: string };
        if (currentNode.type === "Attribute") {
          while (
            endIndex + 1 < nodes.length &&
            (nodes[endIndex + 1].node as { type?: string }).type === "Attribute"
          ) {
            endIndex++;
          }
          if (endIndex + 1 < nodes.length) {
            endIndex++;
          }
        }
        const leadingTriviaStart = nodeStart == null
          ? undefined
          : wrapped.above
            .filter((v) => v.span != null && v.span.start < nodeStart)
            .map((v) => v.span!.start)
            .at(0);
        const startRaw = leadingTriviaStart ?? directiveStart;
        const endWrapped = nodes[endIndex];
        const endRaw = getRawSpan(endWrapped.node).end;
        const endComment = endWrapped.after?.type === "comment"
          ? endWrapped.after.span.end
          : endRaw;
        const rawSegmentOriginal = slice(parser, { start: startRaw, end: endComment });
        const rawSegment = stripSingleLeadingLineBreak(rawSegmentOriginal);
        const markerToken = createRawMarkerToken(blockMarkerSalt, rawReplacements.length);
        rawReplacements.push({
          marker: prefix + markerToken,
          replacement: rawSegment,
        });
        if (!first) yield "\n";
        yield markerToken;
        index = endIndex;
        continue;
      }
      const above = stringifyNewlineOrComments(parser, wrapped.above, {
        leadingNewline: true,
      });
      yield first ? above.trimStart() : above;
      const trailingComment = wrapped.after;
      const rendered = renderNode(wrapped.node, { isLast });
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
  return applyRawLineReplacements(renderedBlock, rawReplacements);
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

function indentFirstLine(text: string, prefix: string): string {
  if (text.length === 0) return text;
  const newlineIndex = text.indexOf("\n");
  if (newlineIndex < 0) return prefix + text;
  return prefix + text.slice(0, newlineIndex) + text.slice(newlineIndex);
}

function stripSingleLeadingLineBreak(text: string): string {
  if (text.startsWith("\r\n")) return text.slice(2);
  if (text.startsWith("\n")) return text.slice(1);
  return text;
}

function stripLeadingLineBreaks(text: string): string {
  let result = text;
  while (result.startsWith("\r\n") || result.startsWith("\n")) {
    result = result.startsWith("\r\n") ? result.slice(2) : result.slice(1);
  }
  return result;
}

function splitDetachedRunLeadingGap(
  gap: string,
  hasInlineTrailingComment: boolean,
): { anchored: string; movable: string } {
  if (hasInlineTrailingComment) {
    return { anchored: gap, movable: "" };
  }
  const matches = [...gap.matchAll(/(?:\r?\n)[ \t]*(?:\r?\n)/g)];
  const last = matches.at(-1);
  if (!last || last.index == null) return { anchored: "", movable: gap };
  const splitIndex = last.index + last[0].length;
  return {
    anchored: gap.slice(0, splitIndex),
    movable: gap.slice(splitIndex),
  };
}

function hasInlineTrailingCommentInRange(
  source: string,
  start: number,
  end: number,
): boolean {
  for (let index = start; index < end; index++) {
    if (source[index] === "/" && source[index + 1] === "/") {
      if (!isOnlyWhitespaceBeforeInSameLine(source, index)) return true;
      index += 1;
    }
  }
  return false;
}

function applyRawLineReplacements(
  text: string,
  replacements: Array<{ marker: string; replacement: string }>,
): string {
  let result = text;
  for (const { marker, replacement } of replacements) {
    result = result.split(marker).join(replacement);
  }
  return result;
}

function createRawMarkerSalt(): string {
  return `\u0000BDL_RAW_${Math.random().toString(36).slice(2)}\u0000`;
}

function createRawMarkerToken(salt: string, index: number): string {
  return `${salt}${index}`;
}

function collectNewlinesOnly(parser: Parser, loc: number): NewlineOrComment[] {
  return collectNewlineAndComments(parser, loc).filter((v) => v.type === "newline");
}

function indentBlock(
  ctx: FormatContext,
  level: number,
) {
  const prefix = indentUnit(ctx.config).repeat(level);
  return (cb: () => Generator<string>) => indentGeneratedText(cb(), prefix);
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
