import * as vscode from "vscode";
import { BdlShortTermContext } from "./context.ts";
import { format } from "@disjukr/bdl/formatter";

export function initFormatter(extensionContext: vscode.ExtensionContext) {
  extensionContext.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      [{ language: "bdl", scheme: "file" }],
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
    const context = new BdlShortTermContext(this.extensionContext, document);
    const entryDocContext = context.entryDocContext;
    const formatted = format(entryDocContext.text);
    const fileStart = new vscode.Position(0, 0);
    const fileEnd = document.lineAt(document.lineCount - 1).range.end;
    return [
      new vscode.TextEdit(new vscode.Range(fileStart, fileEnd), formatted),
    ];
  }
}
