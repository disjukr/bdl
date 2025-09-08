import * as vscode from "vscode";
import { patternToString, SyntaxError } from "@disjukr/bdl/parser";
import { BdlShortTermContext, BdlShortTermDocumentContext } from "./context.ts";

export function initDiagnostics(extensionContext: vscode.ExtensionContext) {
  const collection = vscode.languages.createDiagnosticCollection("bdl");
  extensionContext.subscriptions.push(collection);
  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId !== "bdl") return;
    const context = new BdlShortTermContext(extensionContext, document);
    run(context.entryDocContext, collection);
  });
  vscode.workspace.onDidChangeTextDocument((event) => {
    const document = event.document;
    if (document.languageId !== "bdl") return;
    const context = new BdlShortTermContext(extensionContext, document);
    run(context.entryDocContext, collection);
  });
}

function run(
  docContext: BdlShortTermDocumentContext,
  collection: vscode.DiagnosticCollection,
) {
  const diagnostics: vscode.Diagnostic[] = [];
  try {
    if (checkParseError(docContext, diagnostics)) return;
  } finally {
    collection.set(docContext.document.uri, diagnostics);
  }
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
      const message = `expected ${expected}, got ${patternToString(got)}\n\n`;
      const severity = vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostics.push(diagnostic);
      return true;
    }
  }
  return false;
}
