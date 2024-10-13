import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml";
import * as bdlAst from "bdl/ast.ts";
import { span } from "bdl/ast/misc.ts";
import {
  findImportItemByTypeName,
  findStatementByTypeName,
  getStatementSpan,
  pickType,
} from "bdl/ast/span-picker.ts";
import { type BdlConfig } from "bdl/config.ts";
import parseBdl from "bdl/parser/bdl-parser.ts";

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
    const bdlText = document.getText();
    const bdlAst = parseBdl(bdlText);
    const offset = document.offsetAt(position);
    const type = pickType(offset, bdlAst);
    if (!type) return null;
    const typeName = span(bdlText, type);
    const defStatement = findStatementByTypeName(typeName, bdlText, bdlAst);
    if (defStatement) {
      const defSpan = getStatementSpan(defStatement);
      const originSelectionRange = spanToRange(document, type);
      const targetUri = document.uri;
      const targetRange = spanToRange(document, defSpan);
      const targetSelectionRange = spanToRange(document, defStatement.name);
      return [{
        originSelectionRange,
        targetUri,
        targetRange,
        targetSelectionRange,
      }];
    }
    const importItem = findImportItemByTypeName(typeName, bdlText, bdlAst);
    if (!importItem) return null;
    if (importItem.alias) {
      const originSelectionRange = spanToRange(document, type);
      const targetUri = document.uri;
      const targetRange = spanToRange(document, importItem.alias.name);
      return [{ originSelectionRange, targetUri, targetRange }];
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    // TODO: 참조하는 모듈을 파싱후 거기에 들어있는 정의를 찾아서 점프
    //       모듈이 없거나 파싱에 실패했거나 정의가 없으면 importItem.name으로 점프
    // TODO: primitive 정의로 점프
    // TODO: import path로부터 파일로 점프
    return null;
  }
}

function spanToRange(
  document: vscode.TextDocument,
  { start, end }: bdlAst.Span,
): vscode.Range {
  return new vscode.Range(
    document.positionAt(start),
    document.positionAt(end),
  );
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
