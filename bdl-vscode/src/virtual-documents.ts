import * as vscode from "vscode";
import builtinStandards, {
  builtinStandardYamls,
} from "@disjukr/bdl/builtin/standards";

export function initVirtualDocuments(
  extensionContext: vscode.ExtensionContext,
) {
  extensionContext.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "bdl-builtin-standard",
      new BdlBuiltinStandardContentProvider(extensionContext),
    ),
  );
}

class BdlBuiltinStandardContentProvider
  implements vscode.TextDocumentContentProvider {
  constructor(public extensionContext: vscode.ExtensionContext) {}
  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    const standardId = uri.path.slice(1).replace(/\.(json|yaml)$/, "");
    if (!(standardId in builtinStandards)) return;
    if (uri.path.endsWith(".yaml")) return builtinStandardYamls[standardId];
    if (uri.path.endsWith(".json")) {
      return JSON.stringify(builtinStandards[standardId], null, 2) + "\n";
    }
  }
}
