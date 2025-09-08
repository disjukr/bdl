import * as vscode from "vscode";
import { patternToString, SyntaxError } from "@disjukr/bdl/parser";
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

  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId !== "bdl") return;
    runTask(document);
  });
  vscode.workspace.onDidChangeTextDocument((event) => {
    const document = event.document;
    if (document.languageId !== "bdl") return;
    runTask(document);
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
      await checkStandard(docContext, diagnostics, abortSignal);
    } finally {
      if (!abortSignal.aborted) {
        collection.set(docContext.document.uri, diagnostics);
      }
    }
  })();
  return abortController;
}

async function checkStandard(
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
      "Unknown BDL standard",
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
      const message = `Expected ${expected}, got ${patternToString(got)}\n\n`;
      const severity = vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostics.push(diagnostic);
      return true;
    }
  }
  return false;
}
