import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml";
import * as bdlAst from "jsr:@disjukr/bdl/ast";
import parseBdl from "jsr:@disjukr/bdl/parser";

// export async function activate(context: vscode.ExtensionContext) {
//   context.subscriptions.push(vscode.languages.registerDefinitionProvider(
//     [{ language: "bdl", scheme: "file" }],
//     new BdlDefinitionProvider(),
//   ));
// }

class BdlDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    const documentText = document.getText();
    const bdlAst = parseBdl(documentText);
    const offset = document.offsetAt(position);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    // TODO
    return null;
  }
}

function getBdlTypename(
  offset: number,
  text: string,
  ast: bdlAst.BdlAst,
): string | undefined {
  // for (const statement of ast.statements) {
  //   if (offset < statement.keyword.start) continue;
  // }
  return;
}

function getStatementSpan(statement: bdlAst.ModuleLevelStatement): bdlAst.Span {
  // TODO
  return { start, end };
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
