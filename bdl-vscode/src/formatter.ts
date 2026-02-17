import * as vscode from "vscode";
import { BdlShortTermContext } from "./context.ts";
import { formatBdl } from "@disjukr/bdl/formatter/bdl";

export function initFormatter(extensionContext: vscode.ExtensionContext) {
  extensionContext.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      [{ language: "bdl" }],
      new BdlDocumentFormattingEditProvider(extensionContext),
    ),
  );
}

export class BdlDocumentFormattingEditProvider
  implements vscode.DocumentFormattingEditProvider {
  constructor(public extensionContext: vscode.ExtensionContext) {}
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ) {
    try {
      const context = new BdlShortTermContext(this.extensionContext, document);
      const entryDocContext = context.entryDocContext;
      const formatted = formatBdl(entryDocContext.text);
      const fileStart = new vscode.Position(0, 0);
      const fileEnd = document.lineAt(document.lineCount - 1).range.end;
      return [
        new vscode.TextEdit(new vscode.Range(fileStart, fileEnd), formatted),
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`BDL formatting failed: ${message}`);
      return [];
    }
  }
}
