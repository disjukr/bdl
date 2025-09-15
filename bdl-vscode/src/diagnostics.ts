import * as vscode from "vscode";
import type * as bdlAst from "@disjukr/bdl/ast";
import {
  getTypeExpressions,
  groupAttributesBySlot,
  span,
} from "@disjukr/bdl/ast/misc";
import { patternToString, SyntaxError } from "@disjukr/bdl/parser";
import {
  buildImports,
  getDefStatements,
  getLocalDefNames,
  getTypeNameToPathFn,
} from "@disjukr/bdl/ir-builder";
import type { AttributeSlot, BdlStandard } from "@disjukr/bdl/io/standard";
import { BdlShortTermContext, BdlShortTermDocumentContext } from "./context.ts";
import { spanToRange } from "./misc.ts";

export function initDiagnostics(extensionContext: vscode.ExtensionContext) {
  const collection = vscode.languages.createDiagnosticCollection("bdl");
  extensionContext.subscriptions.push(collection);

  const tasks: Record<string, AbortController> = {};
  function runTask(document: vscode.TextDocument) {
    const context = new BdlShortTermContext(extensionContext, document);
    const documentKey = document.uri.toString();
    tasks[documentKey]?.abort();
    tasks[documentKey] = run(context.entryDocContext, collection);
  }

  vscode.workspace.textDocuments.forEach((document) => {
    if (document.languageId === "bdl") runTask(document);
  });
  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId === "bdl") runTask(document);
  });
  vscode.workspace.onDidChangeTextDocument((event) => {
    const document = event.document;
    if (document.languageId === "bdl") runTask(document);
  });
  vscode.workspace.onDidCloseTextDocument((document) => {
    if (document.languageId !== "bdl") return;
    const documentKey = document.uri.toString();
    tasks[documentKey]?.abort();
    delete tasks[documentKey];
  });
}

function run(
  docContext: BdlShortTermDocumentContext,
  collection: vscode.DiagnosticCollection,
): AbortController {
  const abortController = new AbortController();
  const abortSignal = abortController.signal;
  const diagnostics: vscode.Diagnostic[] = [];
  (async () => {
    try {
      if (checkParseError(docContext, diagnostics)) return;
      updateDiagnostics();
      await checkStandardId(docContext, diagnostics, abortSignal);
      updateDiagnostics();
      const standard = await checkStandard(
        docContext,
        diagnostics,
        abortSignal,
      );
      updateDiagnostics();
      const modulePath = await checkModulePath(
        docContext,
        diagnostics,
        abortSignal,
      );
      updateDiagnostics();
      checkWrongTypeNames(docContext, diagnostics, standard, modulePath);
      checkWrongAttributeNames(docContext, diagnostics, standard);
    } finally {
      if (!abortSignal.aborted) updateDiagnostics();
    }
  })();
  return abortController;
  function updateDiagnostics() {
    collection.set(docContext.document.uri, diagnostics);
  }
}

function checkWrongAttributeNames(
  docContext: BdlShortTermDocumentContext,
  diagnostics: vscode.Diagnostic[],
  standard: BdlStandard | undefined,
): void {
  const { text, ast } = docContext;
  const attributes = groupAttributesBySlot(ast);
  const validAttributeKeys = {
    "bdl.module": new Set(["standard"]),
  } as Record<AttributeSlot, Set<string>>;
  for (const [slot, attrs] of Object.entries(standard?.attributes || {})) {
    const keys = (validAttributeKeys[slot as AttributeSlot] ??= new Set());
    for (const attr of attrs) keys.add(attr.key);
  }
  for (const [slot, attrs] of Object.entries(attributes)) {
    const validAttributeKeySet = validAttributeKeys[slot as AttributeSlot];
    for (const attr of attrs) {
      const key = span(text, attr.name);
      if (validAttributeKeySet?.has(key)) continue;
      diagnostics.push(
        new vscode.Diagnostic(
          spanToRange(docContext.document, attr.name),
          `Unknown attribute '${key}'.`,
          vscode.DiagnosticSeverity.Error,
        ),
      );
    }
  }
}

function checkWrongTypeNames(
  docContext: BdlShortTermDocumentContext,
  diagnostics: vscode.Diagnostic[],
  standard: BdlStandard | undefined,
  modulePath: string,
): void {
  const { text, ast } = docContext;
  const typeNameToPath = getTypeNameToPathFn(
    modulePath,
    buildImports(text, ast),
    getLocalDefNames(text, getDefStatements(ast)),
  );
  const typeExpressions = getTypeExpressions(ast);
  for (const typeExpression of typeExpressions) {
    const valueType = typeExpression.valueType;
    const keyType = typeExpression.container?.keyType;
    checkTypeName(span(text, valueType), typeExpression.valueType);
    if (keyType) checkTypeName(span(text, keyType), keyType);
  }
  function checkTypeName(typeName: string, span: bdlAst.Span) {
    const typePath = typeNameToPath(typeName);
    console.log({ typePath });
    if (typePath.includes(".")) return;
    if (standard && typeName in standard.primitives) return;
    diagnostics.push(
      new vscode.Diagnostic(
        spanToRange(docContext.document, span),
        `Cannot find name '${typeName}'.`,
        vscode.DiagnosticSeverity.Error,
      ),
    );
  }
}

async function checkStandard(
  docContext: BdlShortTermDocumentContext,
  _diagnostics: vscode.Diagnostic[],
  abortSignal: AbortSignal,
): Promise<BdlStandard | undefined> {
  const standard = await docContext.context.getBdlStandard();
  if (abortSignal.aborted) return standard;
  if (!standard) {
    // TODO: diagnose why standard could not be loaded
  }
  return standard;
}

async function checkModulePath(
  docContext: BdlShortTermDocumentContext,
  _diagnostics: vscode.Diagnostic[],
  abortSignal: AbortSignal,
): Promise<string> {
  const modulePath = await docContext.getModulePath() || "";
  if (abortSignal.aborted) return modulePath;
  if (!modulePath) {
    // TODO: diagnose why modulePath could not be found
  }
  return modulePath;
}

async function checkStandardId(
  docContext: BdlShortTermDocumentContext,
  diagnostics: vscode.Diagnostic[],
  abortSignal: AbortSignal,
): Promise<void> {
  const standardAttr = docContext.standardAttr;
  if (!standardAttr) {
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        "No BDL standard specified.",
        vscode.DiagnosticSeverity.Error,
      ),
    );
    return;
  }
  const bdlConfig = await docContext.context.getBdlConfig();
  if (abortSignal.aborted) return;
  const standardId = docContext.standardId;
  if (!standardId) return;
  if (bdlConfig?.standards && standardId in bdlConfig.standards) return;
  diagnostics.push(
    new vscode.Diagnostic(
      spanToRange(docContext.document, standardAttr.name),
      "Unknown BDL standard.",
      vscode.DiagnosticSeverity.Error,
    ),
  );
}

function checkParseError(
  docContext: BdlShortTermDocumentContext,
  diagnostics: vscode.Diagnostic[],
): boolean {
  try {
    docContext.ast;
  } catch (err) {
    if (err instanceof SyntaxError) {
      const line = err.colRow.row;
      const col = err.colRow.col;
      const got = typeof err.got === "symbol" ? "" : err.got;
      const range = new vscode.Range(line, col, line, col + got.length);
      const expected = err.expectedPatterns.map(patternToString).join(" or ");
      const message = `Expected ${expected}, got ${patternToString(got)}.`;
      const severity = vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostics.push(diagnostic);
      return true;
    }
  }
  return false;
}
