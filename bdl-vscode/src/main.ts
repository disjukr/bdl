import * as vscode from "vscode";
import { initDefinitions } from "./definitions.ts";
import { initDiagnostics } from "./diagnostics.ts";

export function activate(context: vscode.ExtensionContext) {
  initDefinitions(context);
  initDiagnostics(context);
}
