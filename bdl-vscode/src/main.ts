import * as vscode from "vscode";
import { parse as parseYml } from "jsr:@std/yaml";
import * as bdlAst from "bdl/generated/ast.ts";
import { span } from "bdl/ast/misc.ts";
import {
  type DefStatement,
  findImportItemByTypeName,
  findStatementByTypeName,
  getImportPathSpan,
  getStatementSpan,
  pickImportStatementByPath,
  pickType,
} from "bdl/ast/span-picker.ts";
import { type BdlConfig } from "bdl/io/config.ts";
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
      return await provideTypeDefinition(
        document,
        workspaceFolder,
        bdlText,
        bdlAst,
        type,
      );
    }
    if (!workspaceFolder) return null;
    const importStatement = pickImportStatementByPath(offset, bdlAst);
    if (importStatement) {
      return await provideModuleDefinition(
        document,
        workspaceFolder,
        bdlText,
        importStatement,
      );
    }
    return null;
  }
}

async function provideTypeDefinition(
  document: vscode.TextDocument,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  bdlText: string,
  bdlAst: bdlAst.BdlAst,
  typeSpan: bdlAst.Span,
): Promise<vscode.LocationLink[] | null> {
  const typeName = span(bdlText, typeSpan);
  const originSelectionRange = spanToRange(document, typeSpan);
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
    await loadBdlConfig(workspaceFolder.uri);
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
  return null;
}

async function provideModuleDefinition(
  document: vscode.TextDocument,
  workspaceFolder: vscode.WorkspaceFolder,
  bdlText: string,
  importStatement: bdlAst.Import,
): Promise<vscode.LocationLink[] | null> {
  const importPathSpan = getImportPathSpan(importStatement);
  const originSelectionRange = spanToRange(document, importPathSpan);
  const targetDocument = await findImportTargetDocument(
    workspaceFolder,
    bdlText,
    importStatement,
  );
  if (!targetDocument) return null;
  return getModuleLink(targetDocument, originSelectionRange);
}

async function findImportTargetDocument(
  workspaceFolder: vscode.WorkspaceFolder,
  bdlText: string,
  importStatement: bdlAst.Import,
): Promise<vscode.TextDocument | undefined> {
  const bdlConfig = workspaceFolder &&
    await loadBdlConfig(workspaceFolder.uri);
  if (!bdlConfig) return;
  const { packageName, pathItems } = getImportPathInfo(
    bdlText,
    importStatement,
  );
  if (!(packageName in bdlConfig.paths)) return;
  const targetUri = vscode.Uri.joinPath(
    workspaceFolder.uri,
    bdlConfig.paths[packageName],
    pathItems.join("/") + ".bdl",
  );
  try {
    return await vscode.workspace.openTextDocument(targetUri);
  } catch { /* ignore */ }
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

function getModuleLink(
  targetDocument: vscode.TextDocument,
  originSelectionRange?: vscode.Range,
): vscode.DefinitionLink[] {
  const targetUri = targetDocument.uri;
  const start = targetDocument.positionAt(0);
  const end = targetDocument.positionAt(targetDocument.getText().length);
  const targetRange = new vscode.Range(start, end);
  return [{
    originSelectionRange,
    targetUri,
    targetRange,
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

async function loadBdlConfig(
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
