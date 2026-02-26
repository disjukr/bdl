import * as vscode from "vscode";
import { initDefinitions } from "./definitions.ts";
import { initDiagnostics } from "./diagnostics.ts";
import { initFormatter } from "./formatter.ts";
import { initVirtualDocuments } from "./virtual-documents.ts";

export function activate(context: vscode.ExtensionContext) {
  initDefinitions(context);
  initDiagnostics(context);
  initFormatter(context);
  initVirtualDocuments(context);
}
