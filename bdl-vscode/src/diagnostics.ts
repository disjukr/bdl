import * as vscode from "vscode";
import parseBdl, { patternToString, SyntaxError } from "@disjukr/bdl/parser";

export function initDiagnostics(context: vscode.ExtensionContext) {
  const collection = vscode.languages.createDiagnosticCollection("bdl");
  context.subscriptions.push(collection);
  vscode.workspace.onDidOpenTextDocument((document) => {
    if (document.languageId !== "bdl") return;
    run(document, collection);
  });
  vscode.workspace.onDidChangeTextDocument((event) => {
    const document = event.document;
    if (document.languageId !== "bdl") return;
    run(document, collection);
  });
}

function run(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
) {
  const diagnostics: vscode.Diagnostic[] = [];
  try {
    const bdlText = document.getText();
    parseBdl(bdlText);
  } catch (err) {
    if (err instanceof SyntaxError) {
      const line = err.colRow.row;
      const col = err.colRow.col;
      const got = typeof err.got === "symbol" ? "" : err.got;
      const range = new vscode.Range(line, col, line, col + got.length);
      const expected = err.expectedPatterns.map(patternToString).join(" or ");
      const message = `expected ${expected}, got ${got}\n\n`;
      const severity = vscode.DiagnosticSeverity.Error;
      const diagnostic = new vscode.Diagnostic(range, message, severity);
      diagnostics.push(diagnostic);
    }
  }
  collection.set(document.uri, diagnostics);
}
