import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml";
import * as bdlAst from "bdl/generated/ast.ts";
import { span } from "bdl/ast/misc.ts";
import {
  type DefStatement,
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
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const bdlText = document.getText();
    const bdlAst = parseBdl(bdlText);
    const offset = document.offsetAt(position);
    const type = pickType(offset, bdlAst);
    if (type) {
      const typeName = span(bdlText, type);
      const originSelectionRange = spanToRange(document, type);
      const definitionLink = findDefinitionLinkByTypeName(
        typeName,
        bdlText,
        bdlAst,
        document,
        originSelectionRange,
      );
      if (definitionLink) return definitionLink;
      const importItem = findImportItemByTypeName(typeName, bdlText, bdlAst);
      if (importItem?.item.alias) {
        const targetUri = document.uri;
        const targetRange = spanToRange(document, importItem.item.alias.name);
        return [{ originSelectionRange, targetUri, targetRange }];
      }
      const bdlConfig = workspaceFolder &&
        await getBdlConfig(workspaceFolder.uri);
      if (importItem) {
        try {
          gotoOtherFile: if (bdlConfig) {
            const { packageName, pathItems } = getImportPathInfo(
              bdlText,
              importItem.statement,
            );
            if (!(packageName in bdlConfig.paths)) break gotoOtherFile;
            const targetUri = vscode.Uri.joinPath(
              workspaceFolder.uri,
              bdlConfig.paths[packageName],
              pathItems.join("/") + ".bdl",
            );
            const targetDocument = await vscode.workspace.openTextDocument(
              targetUri,
            );
            const targetBdlText = targetDocument.getText();
            const targetBdlAst = parseBdl(targetBdlText);
            const definitionLink = findDefinitionLinkByTypeName(
              typeName,
              targetBdlText,
              targetBdlAst,
              targetDocument,
              originSelectionRange,
            );
            if (definitionLink) return definitionLink;
          }
        } catch { /* ignore */ }
        const targetUri = document.uri;
        const targetRange = spanToRange(document, importItem.item.name);
        return [{ originSelectionRange, targetUri, targetRange }];
      }
      if (bdlConfig && !importItem) {
        // TODO: primitive 정의로 점프
      }
    }
    // TODO: import path로부터 파일로 점프
    return null;
  }
}

interface ImportPathInfo {
  packageName: string;
  pathItems: string[];
}
function getImportPathInfo(
  bdlText: string,
  statement: bdlAst.Import,
): ImportPathInfo {
  const [packageName, ...pathItems] = statement.path
    .filter((item) => item.type === "Identifier")
    .map((item) => span(bdlText, item));
  return { packageName, pathItems };
}

function findDefinitionLinkByTypeName(
  typeName: string,
  bdlText: string,
  bdlAst: bdlAst.BdlAst,
  document: vscode.TextDocument,
  originSelectionRange?: vscode.Range,
): vscode.DefinitionLink[] | undefined {
  const defStatement = findStatementByTypeName(typeName, bdlText, bdlAst);
  if (defStatement) {
    return getDefinitionLink(document, defStatement, originSelectionRange);
  }
}

function getDefinitionLink(
  targetDocument: vscode.TextDocument,
  targetDefStatement: DefStatement,
  originSelectionRange?: vscode.Range,
): vscode.DefinitionLink[] {
  const defSpan = getStatementSpan(targetDefStatement);
  const targetUri = targetDocument.uri;
  const targetRange = spanToRange(targetDocument, defSpan);
  const targetSelectionRange = spanToRange(
    targetDocument,
    targetDefStatement.name,
  );
  return [{
    originSelectionRange,
    targetUri,
    targetRange,
    targetSelectionRange,
  }];
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
): Promise<BdlConfig | undefined> {
  try {
    const textDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceFolderUri, "bdl.yml"),
    );
    const bdlYmlText = textDocument.getText();
    const bdlYml = parseYml(bdlYmlText);
    return bdlYml as BdlConfig;
  } catch { /* ignore */ }
}
