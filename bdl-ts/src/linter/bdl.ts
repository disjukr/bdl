import type * as ast from "../generated/ast.ts";
import {
  collectAttributes,
  getAttributeContent,
  getTypeExpressions,
  groupAttributesBySlot,
  isImport,
  slice,
} from "../ast/misc.ts";
import { getImportPathSpan } from "../ast/span-picker.ts";
import globalStandard from "../global/standard.ts";
import {
  buildImports,
  getDefStatements,
  getLocalDefNames,
  getTypeNameToPathFn,
} from "../ir-builder.ts";
import type { BdlConfig } from "../io/config.ts";
import type { AttributeSlot, BdlStandard } from "../io/standard.ts";
import parseBdl from "../parser/bdl/ast-parser.ts";
import { patternToString, SyntaxError } from "../parser/parser.ts";

export interface LintDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  span: ast.Span;
}

export type LoadBdlConfigFn = () => Promise<BdlConfig | undefined>;

export type LoadBdlStandardFn = (
  standardId: string,
  bdlConfig?: BdlConfig,
) => Promise<BdlStandard | undefined>;

export type ResolveModulePathFn = (
  bdlConfig?: BdlConfig,
) => Promise<string | undefined>;

export type ReadModuleFn = (
  modulePath: string,
) => Promise<ReadModuleResult | undefined>;

export interface ReadModuleResult {
  text: string;
  ast?: ast.BdlAst;
}

export interface LintBdlConfig {
  text: string;
  ast?: ast.BdlAst;
  bdlConfig?: BdlConfig;
  standard?: BdlStandard;
  modulePath?: string;
  loadBdlConfig?: LoadBdlConfigFn;
  loadBdlStandard?: LoadBdlStandardFn;
  resolveModulePath?: ResolveModulePathFn;
  readModule?: ReadModuleFn;
  abortSignal?: AbortSignal;
}

export interface LintBdlResult {
  ast?: ast.BdlAst;
  diagnostics: LintDiagnostic[];
}

export async function* lintBdl(
  config: LintBdlConfig,
): AsyncGenerator<LintBdlResult, void> {
  const diagnostics: LintDiagnostic[] = [];
  const result: LintBdlResult = { diagnostics };
  const { text } = config;

  const bdlAst = checkParseError(result, text, config.ast);
  if (!bdlAst) {
    yield result;
    return;
  }

  result.ast = bdlAst;
  const ctx: CheckContext = {
    text,
    bdlAst,
    result,
    bdlConfig: config.bdlConfig,
    standard: config.standard,
    get aborted() {
      return Boolean(config.abortSignal?.aborted);
    },
  };
  if (ctx.aborted) return;

  const standardId = await checkStandardId(ctx, config.loadBdlConfig);
  if (ctx.aborted) return;
  yield result;

  await checkStandard(ctx, standardId, config.loadBdlStandard);
  if (ctx.aborted) return;
  yield result;

  await checkModulePath(ctx, config.modulePath, config.resolveModulePath);
  if (ctx.aborted) return;
  yield result;

  checkWrongTypeNames(ctx, ctx.modulePath || "");
  checkWrongAttributeNames(ctx);
  checkDuplicatedTypeNames(ctx);
  checkDuplicatedAttributeNames(ctx);
  checkDuplicatedItemNames(ctx);
  yield result;

  await checkWrongImportNames(ctx, config.readModule);
  if (ctx.aborted) return;
  yield result;
}

function checkParseError(
  result: LintBdlResult,
  text: string,
  ast?: ast.BdlAst,
): ast.BdlAst | undefined {
  if (ast) return ast;
  try {
    return parseBdl(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      const got = err.got;
      const gotText = typeof got === "symbol" ? "" : got;
      const expected = err.expectedPatterns.map(patternToString).join(" or ");
      const start = err.parser.loc;
      const end = err.parser.loc + gotText.length;
      result.diagnostics.push({
        code: "bdl/syntax",
        message: `Expected ${expected}, got ${patternToString(got)}.`,
        severity: "error",
        span: { start, end },
      });
      return;
    }
    throw err;
  }
}

interface CheckContext {
  text: string;
  bdlAst: ast.BdlAst;
  result: LintBdlResult;
  modulePath?: string;
  bdlConfig?: BdlConfig;
  standard?: BdlStandard;
  readonly aborted: boolean;
}

async function checkStandardId(
  ctx: CheckContext,
  loadBdlConfig?: LoadBdlConfigFn,
): Promise<string | undefined> {
  const { text, bdlAst, result } = ctx;
  const diagnostics = result.diagnostics;
  const standardAttr = bdlAst.attributes.find(
    (attr) => slice(text, attr.name) === "standard",
  );

  if (!standardAttr) {
    diagnostics.push({
      code: "bdl/missing-standard",
      span: { start: 0, end: 0 },
      message: "No BDL standard specified.",
      severity: "error",
    });
    return;
  }

  const standardId = standardAttr.content
    ? getAttributeContent(text, standardAttr)
    : undefined;
  const bdlConfig = ctx.bdlConfig ?? await loadBdlConfig?.();
  ctx.bdlConfig = bdlConfig;
  if (ctx.aborted) return standardId;
  const knownStandardIds = ctx.bdlConfig?.standards
    ? new Set(Object.keys(ctx.bdlConfig.standards))
    : undefined;

  if (!standardId) return;
  if (!knownStandardIds?.size || knownStandardIds.has(standardId)) {
    return standardId;
  }

  diagnostics.push({
    code: "bdl/unknown-standard",
    span: standardAttr.name,
    message: "Unknown BDL standard.",
    severity: "error",
  });
  return standardId;
}

async function checkStandard(
  ctx: CheckContext,
  standardId: string | undefined,
  loadBdlStandard?: LoadBdlStandardFn,
): Promise<void> {
  if (ctx.standard) return;
  if (!standardId || !loadBdlStandard) return;

  const standard = await loadBdlStandard(standardId, ctx.bdlConfig);
  ctx.standard = standard;
  if (!standard) {
    // TODO: diagnose why standard could not be loaded
  }
}

async function checkModulePath(
  ctx: CheckContext,
  modulePath: string | undefined,
  resolveModulePath?: ResolveModulePathFn,
): Promise<void> {
  if (modulePath || !resolveModulePath) return;

  const resolvedModulePath = await resolveModulePath(ctx.bdlConfig);
  ctx.modulePath = resolvedModulePath;
  if (!resolvedModulePath) {
    // TODO: diagnose why modulePath could not be found
  }
}

function checkWrongTypeNames(
  ctx: CheckContext,
  modulePath: string,
): void {
  const { text, bdlAst, result, standard } = ctx;
  const diagnostics = result.diagnostics;
  const primitives = {
    ...globalStandard.primitives,
    ...(standard?.primitives || {}),
  };
  const typeNameToPath = getTypeNameToPathFn(
    modulePath,
    buildImports(text, bdlAst),
    getLocalDefNames(text, getDefStatements(bdlAst)),
  );
  const typeExpressions = getTypeExpressions(bdlAst);

  for (const typeExpression of typeExpressions) {
    const valueType = typeExpression.valueType;
    const keyType = typeExpression.container?.keyType;
    checkTypeName(slice(text, valueType), valueType);
    if (keyType) checkTypeName(slice(text, keyType), keyType);
  }

  function checkTypeName(typeName: string, span: ast.Span) {
    const typePath = typeNameToPath(typeName);
    if (typePath.includes(".")) return;
    if (typeName in primitives) return;
    diagnostics.push({
      code: "bdl/unknown-type",
      span,
      message: `Cannot find name '${typeName}'.`,
      severity: "error",
    });
  }
}

function checkWrongAttributeNames(ctx: CheckContext): void {
  const { text, bdlAst, result, standard } = ctx;
  const diagnostics = result.diagnostics;
  const attributesBySlot = groupAttributesBySlot(bdlAst);
  const validAttributeKeys = {} as Record<AttributeSlot, Set<string>>;

  const attributeEntries = [
    ...Object.entries(globalStandard.attributes || {}),
    ...Object.entries(standard?.attributes || {}),
  ] as Array<[AttributeSlot, { key: string }[]]>;
  for (const [slot, attrs] of attributeEntries) {
    const keys = (validAttributeKeys[slot] ??= new Set());
    for (const attr of attrs) keys.add(attr.key);
  }

  for (const [slot, attrs] of Object.entries(attributesBySlot)) {
    const validAttributeKeySet = validAttributeKeys[slot as AttributeSlot];
    for (const attr of attrs as ast.Attribute[]) {
      const key = slice(text, attr.name);
      if (validAttributeKeySet?.has(key)) continue;
      diagnostics.push({
        code: "bdl/unknown-attribute",
        span: attr.name,
        message: `Unknown attribute '${key}'.`,
        severity: "error",
      });
    }
  }
}

function checkDuplicatedTypeNames(config: CheckContext): void {
  const { text, bdlAst, result } = config;
  const diagnostics = result.diagnostics;
  const localDefNameSpans = getDefStatements(bdlAst).map((stmt) => stmt.name);
  const importedNameSpans = bdlAst.statements
    .filter(isImport)
    .flatMap((stmt) => stmt.items)
    .map((stmt) => stmt.alias ?? stmt.name);

  const spansByName = Object.groupBy(
    [...localDefNameSpans, ...importedNameSpans],
    (name) => slice(text, name),
  );
  const duplicatedDefs = Object.entries(spansByName).filter(
    ([, spans]) => spans && spans.length > 1,
  );

  for (const [name, spans] of duplicatedDefs) {
    if (!spans) continue;
    for (const span of spans) {
      diagnostics.push({
        code: "bdl/duplicate-name",
        span,
        message: `Duplicated name '${name}'.`,
        severity: "error",
      });
    }
  }
}

function checkDuplicatedAttributeNames(config: CheckContext): void {
  const { text, bdlAst, result } = config;
  const diagnostics = result.diagnostics;
  for (const attributes of collectAttributes(bdlAst)) {
    const attrsByName = Object.groupBy(
      attributes,
      (attr) => slice(text, attr.name),
    );
    const duplicatedAttrs = Object.entries(attrsByName).filter(
      ([, attrs]) => attrs && attrs.length > 1,
    );
    for (const [name, attrs] of duplicatedAttrs) {
      if (!attrs) continue;
      for (const attr of attrs) {
        diagnostics.push({
          code: "bdl/duplicate-attribute",
          span: attr.name,
          message: `Duplicated attribute '${name}'.`,
          severity: "error",
        });
      }
    }
  }
}

function checkDuplicatedItemNames(config: CheckContext): void {
  const { text, bdlAst, result } = config;
  const diagnostics = result.diagnostics;
  const enums = bdlAst.statements.filter((s) => s.type === "Enum");
  const unions = bdlAst.statements.filter((s) => s.type === "Union");
  const unionItems = unions.flatMap((u) => u.items);
  const structs = bdlAst.statements.filter((s) => s.type === "Struct");

  type Item = { name: ast.Span };
  type Container = { items: Item[] };

  const containers: Container[] = [
    ...enums,
    ...unions,
    ...unionItems.map((s) => ({ items: s.fields || [] })),
    ...structs.map((s) => ({ items: s.fields })),
  ];

  for (const container of containers) {
    const itemsByName = Object.groupBy(
      container.items,
      (item) => slice(text, item.name),
    );
    const duplicates = Object.entries(itemsByName).filter(
      ([, items]) => items && items.length > 1,
    );
    for (const [name, items] of duplicates) {
      if (!items) continue;
      for (const item of items) {
        diagnostics.push({
          code: "bdl/duplicate-item",
          span: item.name,
          message: `Duplicated item '${name}'.`,
          severity: "error",
        });
      }
    }
  }
}

async function checkWrongImportNames(
  ctx: CheckContext,
  resolveImportModule: ReadModuleFn | undefined,
): Promise<void> {
  const { text, bdlAst, result } = ctx;
  const diagnostics = result.diagnostics;
  if (!resolveImportModule || ctx.aborted) return;

  const importableNamesCache = new Map<
    string,
    Promise<ImportableNamesResult>
  >();
  const importStmts = bdlAst.statements.filter(isImport);

  await Promise.all(importStmts.map(async (stmt) => {
    if (ctx.aborted) return;
    const modulePath = stmt.path.map((item) => slice(text, item)).join(".");

    let importResultPromise = importableNamesCache.get(modulePath);
    if (!importResultPromise) {
      importResultPromise = getImportableNames(modulePath, resolveImportModule);
      importableNamesCache.set(modulePath, importResultPromise);
    }
    const importResult = await importResultPromise;
    if (ctx.aborted) return;

    if (importResult.kind === "not_found") {
      diagnostics.push({
        code: "bdl/import-not-found",
        span: getImportPathSpan(stmt),
        message: `Cannot find module '${modulePath}'.`,
        severity: "error",
      });
      return;
    }

    if (importResult.kind === "parse_error") {
      diagnostics.push({
        code: "bdl/import-parse-error",
        span: getImportPathSpan(stmt),
        message: `Module '${modulePath}' has syntax errors.`,
        severity: "error",
      });
      return;
    }

    for (const item of stmt.items) {
      const name = slice(text, item.name);
      if (importResult.names.has(name)) continue;
      diagnostics.push({
        code: "bdl/import-missing-export",
        span: item.name,
        message: `Module '${modulePath}' has no exported type '${name}'.`,
        severity: "error",
      });
    }
  }));
}

type ImportableNamesResult =
  | { kind: "ok"; names: Set<string> }
  | { kind: "not_found" }
  | { kind: "parse_error" };

async function getImportableNames(
  modulePath: string,
  resolveImportModule: ReadModuleFn,
): Promise<ImportableNamesResult> {
  const resolved = await resolveImportModule(modulePath);
  if (!resolved) return { kind: "not_found" };

  const targetText = resolved.text;
  let targetAst = resolved.ast;
  if (!targetAst) {
    try {
      targetAst = parseBdl(targetText);
    } catch (err) {
      if (err instanceof SyntaxError) return { kind: "parse_error" };
      throw err;
    }
  }

  const defs = getDefStatements(targetAst);
  return {
    kind: "ok",
    names: new Set(defs.map((def) => slice(targetText, def.name))),
  };
}
