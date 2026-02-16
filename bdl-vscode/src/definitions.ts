import * as vscode from "vscode";
import type * as bdlAst from "@disjukr/bdl/ast";
import { slice } from "@disjukr/bdl/ast/misc";
import {
  type DefStatement,
  findImportItemByTypeName,
  type FindImportItemByTypeNameResult,
  findStatementByTypeName,
  getImportPathSpan,
  getStatementSpan,
  pickImportItem,
  type PickImportItemResult,
  pickImportStatementByPath,
  pickType,
} from "@disjukr/bdl/ast/span-picker";
import { BdlShortTermContext, BdlShortTermDocumentContext } from "./context.ts";
import { getImportPathInfo, spanToRange } from "./misc.ts";

export function initDefinitions(extensionContext: vscode.ExtensionContext) {
  extensionContext.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [{ language: "bdl" }],
      new BdlDefinitionProvider(extensionContext),
    ),
  );
}

export class BdlDefinitionProvider implements vscode.DefinitionProvider {
  constructor(public extensionContext: vscode.ExtensionContext) {}
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    const context = new BdlShortTermContext(this.extensionContext, document);
    const entryDocContext = context.entryDocContext;
    const offset = document.offsetAt(position);
    const standardAttr = entryDocContext.standardAttr;
    if (
      standardAttr &&
      standardAttr.start <= offset &&
      offset <= standardAttr.end
    ) return await provideStandardDefinition(entryDocContext, standardAttr);
    const type = pickType(offset, entryDocContext.ast);
    if (type) return await provideTypeDefinition(entryDocContext, type);
    if (!context.workspaceFolder) return null;
    const importStatement = pickImportStatementByPath(
      offset,
      entryDocContext.ast,
    );
    if (importStatement) {
      return await provideModuleDefinition(entryDocContext, importStatement);
    }
    const importItem = pickImportItem(offset, entryDocContext.ast);
    if (importItem) {
      const originSelectionRange = spanToRange(document, importItem.item);
      return await provideExternalTypeDefinition(
        entryDocContext,
        originSelectionRange,
        importItem,
      );
    }
    return null;
  }
}

async function provideStandardDefinition(
  docContext: BdlShortTermDocumentContext,
  standardAttr: bdlAst.Attribute,
): Promise<vscode.LocationLink[] | null> {
  const standardId = docContext.standardId;
  if (!standardId) return null;
  const bdlConfig = await docContext.context.getBdlConfig();
  if (!bdlConfig?.standards?.[standardId]) return null;
  const configDirectory = await docContext.context.getBdlConfigDirectory();
  if (!configDirectory) return null;
  const targetUri = vscode.Uri.joinPath(
    configDirectory,
    bdlConfig.standards[standardId],
  );
  const targetDocument = await vscode.workspace.openTextDocument(targetUri);
  const originSelectionRange = spanToRange(
    docContext.document,
    getStandardContentSpan(docContext, standardAttr),
  );
  return getModuleLink(targetDocument, originSelectionRange);
}

function getStandardContentSpan(
  docContext: BdlShortTermDocumentContext,
  standardAttr: bdlAst.Attribute,
): bdlAst.Span {
  if (!standardAttr.content) return standardAttr.name;
  const rawContent = slice(docContext.text, standardAttr.content);
  const leading = getAttributeContentLeadingLength(rawContent);
  const start = Math.min(
    standardAttr.content.start + leading,
    standardAttr.content.end,
  );
  return { start, end: standardAttr.content.end };
}

function getAttributeContentLeadingLength(rawContent: string): number {
  if (rawContent.startsWith("-")) {
    return rawContent.match(/^-\s*/)?.[0].length ?? 0;
  }
  if (rawContent.startsWith("|") || rawContent.match(/^\s+\|/)) {
    return rawContent.match(/^\s*\|\x20?/)?.[0].length ?? 0;
  }
  return rawContent.match(/^\s*/)?.[0].length ?? 0;
}

async function provideTypeDefinition(
  docContext: BdlShortTermDocumentContext,
  typeSpan: bdlAst.Span,
): Promise<vscode.LocationLink[] | null> {
  const document = docContext.document;
  const typeName = slice(docContext.text, typeSpan);
  const originSelectionRange = spanToRange(document, typeSpan);
  const definitionLink = findDefinitionLinkByTypeName(
    docContext,
    typeName,
    originSelectionRange,
  );
  if (definitionLink) return definitionLink;
  const targetUri = document.uri;
  const importItem = findImportItemByTypeName(
    typeName,
    docContext.text,
    docContext.ast,
  );
  if (importItem?.item.alias) {
    const targetRange = spanToRange(document, importItem.item.alias);
    return [{ originSelectionRange, targetUri, targetRange }];
  }
  const bdlConfig = await docContext.context.getBdlConfig();
  if (importItem) {
    if (docContext.context.workspaceFolder) {
      return await provideExternalTypeDefinition(
        docContext,
        originSelectionRange,
        importItem,
      );
    } else {
      const targetRange = spanToRange(document, importItem.item.name);
      return [{ originSelectionRange, targetUri, targetRange }];
    }
  }
  if (bdlConfig) {
    // TODO: primitive 정의로 점프
  }
  return null;
}

async function provideExternalTypeDefinition(
  docContext: BdlShortTermDocumentContext,
  originSelectionRange: vscode.Range,
  importItem: FindImportItemByTypeNameResult | PickImportItemResult,
): Promise<vscode.LocationLink[] | null> {
  const context = docContext.context;
  const typeName = slice(docContext.text, importItem.item.name);
  const bdlConfig = await context.getBdlConfig();
  if (!context.workspaceFolder) return null;
  try {
    gotoOtherFile: if (bdlConfig) {
      const { packageName, pathItems } = getImportPathInfo(
        docContext.text,
        importItem.statement,
      );
      if (!(packageName in bdlConfig.paths)) break gotoOtherFile;
      const targetUri = vscode.Uri.joinPath(
        context.workspaceFolder.uri,
        bdlConfig.paths[packageName],
        pathItems.join("/") + ".bdl",
      );
      const targetDocument = await vscode.workspace.openTextDocument(
        targetUri,
      );
      const targetDocContext = context.getDocContext(targetDocument);
      const definitionLink = findDefinitionLinkByTypeName(
        targetDocContext,
        typeName,
        originSelectionRange,
      );
      if (definitionLink) return definitionLink;
    }
  } catch { /* ignore */ }
  const targetUri = docContext.document.uri;
  const targetRange = spanToRange(docContext.document, importItem.item.name);
  return [{ originSelectionRange, targetUri, targetRange }];
}

async function provideModuleDefinition(
  docContext: BdlShortTermDocumentContext,
  importStatement: bdlAst.Import,
): Promise<vscode.LocationLink[] | null> {
  if (!docContext.context.workspaceFolder) return null;
  const importPathSpan = getImportPathSpan(importStatement);
  const originSelectionRange = spanToRange(docContext.document, importPathSpan);
  const targetDocument = await findImportTargetDocument(
    docContext,
    importStatement,
  );
  if (!targetDocument) return null;
  return getModuleLink(targetDocument, originSelectionRange);
}

async function findImportTargetDocument(
  docContext: BdlShortTermDocumentContext,
  importStatement: bdlAst.Import,
): Promise<vscode.TextDocument | undefined> {
  if (!docContext.context.workspaceFolder) return;
  const bdlConfig = await docContext.context.getBdlConfig();
  if (!bdlConfig) return;
  const { packageName, pathItems } = getImportPathInfo(
    docContext.text,
    importStatement,
  );
  if (!(packageName in bdlConfig.paths)) return;
  const targetUri = vscode.Uri.joinPath(
    docContext.context.workspaceFolder.uri,
    bdlConfig.paths[packageName],
    pathItems.join("/") + ".bdl",
  );
  try {
    return await vscode.workspace.openTextDocument(targetUri);
  } catch { /* ignore */ }
}

function findDefinitionLinkByTypeName(
  docContext: BdlShortTermDocumentContext,
  typeName: string,
  originSelectionRange?: vscode.Range,
): vscode.DefinitionLink[] | undefined {
  const defStatement = findStatementByTypeName(
    typeName,
    docContext.text,
    docContext.ast,
  );
  if (defStatement) {
    return getDefinitionLink(
      docContext.document,
      defStatement,
      originSelectionRange,
    );
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
