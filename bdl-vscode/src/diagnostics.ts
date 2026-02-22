import * as vscode from "vscode";
import {
  lintBdl,
  type LintBdlConfig,
  type LintDiagnostic,
} from "@disjukr/bdl/linter/bdl";
import { BdlShortTermContext, BdlShortTermDocumentContext } from "./context.ts";
import { spanToRange } from "./misc.ts";

export function initDiagnostics(extensionContext: vscode.ExtensionContext) {
  const collection = vscode.languages.createDiagnosticCollection("bdl");
  extensionContext.subscriptions.push(collection);

  const tasks: Record<string, AbortController> = {};
  function runTask(document: vscode.TextDocument) {
    const isBdl = document.languageId === "bdl";
    const isFile = document.uri.scheme === "file";
    if (!isBdl || !isFile) return;
    const context = new BdlShortTermContext(extensionContext, document);
    const documentKey = document.uri.toString();
    tasks[documentKey]?.abort();
    tasks[documentKey] = run(context.entryDocContext, collection);
  }

  vscode.workspace.textDocuments.forEach(runTask);
  vscode.workspace.onDidOpenTextDocument(runTask);
  vscode.workspace.onDidChangeTextDocument(({ document }) => runTask(document));
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
  let diagnostics: vscode.Diagnostic[] = [];

  (async () => {
    try {
      const lintConfig = createLintConfig(docContext, abortSignal);
      for await (const lintResult of lintBdl(lintConfig)) {
        if (abortSignal.aborted) return;
        diagnostics = lintResult.diagnostics.map(
          (diag) => toVscodeDiagnostic(docContext.document, diag),
        );
        updateDiagnostics();
      }
    } finally {
      if (!abortSignal.aborted) updateDiagnostics();
    }
  })();

  return abortController;

  function updateDiagnostics() {
    collection.set(docContext.document.uri, diagnostics);
  }
}

function createLintConfig(
  docContext: BdlShortTermDocumentContext,
  abortSignal: AbortSignal,
): LintBdlConfig {
  const context = docContext.context;

  return {
    abortSignal,
    text: docContext.text,
    loadBdlConfig: () => context.getBdlConfig(),
    loadBdlStandard: () => context.getBdlStandard(),
    resolveModulePath: () => docContext.getModulePath(),
    readModule: async (modulePath) => {
      if (!context.workspaceFolder) return;

      const [packageName, ...pathItems] = modulePath.split(".");
      if (!packageName || pathItems.length === 0) return;

      const bdlConfig = await context.getBdlConfig();
      if (!bdlConfig) return;
      if (!(packageName in bdlConfig.paths)) return;

      const targetUri = vscode.Uri.joinPath(
        context.workspaceFolder.uri,
        bdlConfig.paths[packageName],
        pathItems.join("/") + ".bdl",
      );

      try {
        await vscode.workspace.fs.stat(targetUri);
        const targetDoc = await vscode.workspace.openTextDocument(targetUri);
        return context.getDocContext(targetDoc).text;
      } catch (err) {
        if (err instanceof vscode.FileSystemError) return;
        throw err;
      }
    },
  };
}

function toVscodeDiagnostic(
  document: vscode.TextDocument,
  diagnostic: LintDiagnostic,
): vscode.Diagnostic {
  const severity = diagnostic.severity === "warning"
    ? vscode.DiagnosticSeverity.Warning
    : vscode.DiagnosticSeverity.Error;
  const result = new vscode.Diagnostic(
    spanToRange(document, diagnostic.span),
    diagnostic.message,
    severity,
  );
  result.code = diagnostic.code;
  return result;
}
