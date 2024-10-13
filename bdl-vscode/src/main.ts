import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml";
import * as bdlAst from "jsr:@disjukr/bdl@0.3.3/ast";
import {
  getStatementSpan,
  pickType,
} from "jsr:@disjukr/bdl@0.3.3/ast/span-picker";
import parseBdl from "jsr:@disjukr/bdl/parser";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(
    [{ language: "bdl", scheme: "file" }],
    new BdlDefinitionProvider(),
  ));
}

class BdlDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    const documentText = document.getText();
    const bdlAst = parseBdl(documentText);
    const offset = document.offsetAt(position);
    const type = pickType(offset, bdlAst);
    if (!type) return null;
    const typeName = documentText.slice(type.start, type.end);
    const defStmts = bdlAst.statements.filter(
      (statement) => statement.type !== "Import",
    ).map(
      (stmt) => (stmt as Exclude<bdlAst.ModuleLevelStatement, bdlAst.Import>),
    );
    const matchDef = defStmts.find((defStmt) =>
      documentText.slice(defStmt.name.start, defStmt.name.end) === typeName
    );
    function spanToRange({ start, end }: bdlAst.Span): vscode.Range {
      return new vscode.Range(
        document.positionAt(start),
        document.positionAt(end),
      );
    }
    if (matchDef) {
      const defSpan = getStatementSpan(matchDef);
      const originSelectionRange = spanToRange(type);
      const targetUri = document.uri;
      const targetRange = spanToRange(defSpan);
      const targetSelectionRange = spanToRange(matchDef.name);
      return [{
        originSelectionRange,
        targetUri,
        targetRange,
        targetSelectionRange,
      }];
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    // TODO
    return null;
  }
}

async function getBdlConfig(
  workspaceFolderUri: vscode.Uri,
): Promise<BdlConfig> {
  const textDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(workspaceFolderUri, "bdl.yml"),
  );
  const bdlYmlText = textDocument.getText();
  const bdlYml = parseYml(bdlYmlText);
  return bdlYml as BdlConfig;
}

interface BdlConfig {
  paths?: Record<string, string>;
}
