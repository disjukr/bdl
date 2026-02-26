import * as vscode from "vscode";
import type { Pair as YamlPair } from "yaml";
import {
  isMap as isYamlMap,
  isScalar as isYamlScalar,
  isSeq as isYamlSeq,
  parseDocument as parseYamlDocument,
} from "yaml";
import type * as bdlAst from "@disjukr/bdl/ast";
import { groupAttributesBySlot, slice } from "@disjukr/bdl/ast/misc";
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
import builtinStandards from "@disjukr/bdl/builtin/standards";
import type { AttributeSlot } from "@disjukr/bdl/io/standard";
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
    const attributeDefinition = await provideAttributeDefinition(
      entryDocContext,
      offset,
    );
    if (attributeDefinition) return attributeDefinition;
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
  const targetDocument = await findStandardTargetDocument(docContext);
  if (!targetDocument) return null;
  const originSelectionRange = spanToRange(
    docContext.document,
    getStandardContentSpan(docContext, standardAttr),
  );
  return getModuleLink(targetDocument, originSelectionRange);
}

async function findStandardTargetDocument(
  docContext: BdlShortTermDocumentContext,
): Promise<vscode.TextDocument | undefined> {
  const standardId = docContext.standardId;
  if (!standardId) return;
  const bdlConfig = await docContext.context.getBdlConfig();
  if (!bdlConfig?.standards?.[standardId]) {
    if (standardId in builtinStandards) {
      return await vscode.workspace.openTextDocument(vscode.Uri.from({
        scheme: "bdl-builtin-standard",
        path: `/${standardId}.yaml`,
      }));
    }
    return;
  }
  const configDirectory = await docContext.context.getBdlConfigDirectory();
  if (!configDirectory) return;
  const targetUri = vscode.Uri.joinPath(
    configDirectory,
    bdlConfig.standards[standardId],
  );
  try {
    return await vscode.workspace.openTextDocument(targetUri);
  } catch { /* ignore */ }
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

async function provideAttributeDefinition(
  docContext: BdlShortTermDocumentContext,
  offset: number,
): Promise<vscode.LocationLink[] | null> {
  const attribute = pickAttribute(offset, docContext.ast);
  if (!attribute) return null;
  const slot = findAttributeSlot(docContext.ast, attribute);
  if (!slot) return null;
  const targetDocument = await findStandardTargetDocument(docContext);
  if (!targetDocument) return null;
  const attributeName = slice(docContext.text, attribute.name);
  const targetSelectionRange = findAttributeSelectionRangeInStandard(
    targetDocument,
    slot,
    attributeName,
  );
  if (!targetSelectionRange) return null;
  const originSelectionRange = spanToRange(docContext.document, attribute.name);
  return [{
    originSelectionRange,
    targetUri: targetDocument.uri,
    targetRange: targetSelectionRange,
    targetSelectionRange,
  }];
}

function pickAttribute(
  offset: number,
  bdlParsed: bdlAst.BdlAst,
): bdlAst.Attribute | undefined {
  const attributesBySlot = groupAttributesBySlot(bdlParsed);
  for (const attributes of Object.values(attributesBySlot)) {
    const picked = attributes.find((attribute) => {
      return attribute.start <= offset && offset <= attribute.end;
    });
    if (picked) return picked;
  }
}

function findAttributeSlot(
  bdlParsed: bdlAst.BdlAst,
  targetAttribute: bdlAst.Attribute,
): AttributeSlot | undefined {
  const attributesBySlot = groupAttributesBySlot(bdlParsed);
  for (const [slot, attributes] of Object.entries(attributesBySlot)) {
    const hasTarget = attributes.some((attribute) => {
      return isSameAttribute(attribute, targetAttribute);
    });
    if (hasTarget) return slot as AttributeSlot;
  }
}

function isSameAttribute(a: bdlAst.Attribute, b: bdlAst.Attribute): boolean {
  return a.start === b.start &&
    a.end === b.end &&
    a.name.start === b.name.start &&
    a.name.end === b.name.end;
}

function findAttributeSelectionRangeInStandard(
  standardDocument: vscode.TextDocument,
  slot: AttributeSlot,
  attributeName: string,
): vscode.Range | undefined {
  const yamlDocument = parseYamlDocument(standardDocument.getText(), {
    keepSourceTokens: true,
  });
  const root = yamlDocument.contents;
  if (!isYamlMap(root)) return;
  const attributesPair = root.items.find((pair: YamlPair) => {
    return isYamlScalar(pair.key) && pair.key.value === "attributes";
  });
  if (!attributesPair || !isYamlMap(attributesPair.value)) return;
  const slotPair = attributesPair.value.items.find((pair: YamlPair) => {
    return isYamlScalar(pair.key) && pair.key.value === slot;
  });
  if (!slotPair || !isYamlSeq(slotPair.value)) return;
  for (const item of slotPair.value.items) {
    if (!isYamlMap(item)) continue;
    const keyPair = item.items.find((pair: YamlPair) => {
      return isYamlScalar(pair.key) && pair.key.value === "key" &&
        isYamlScalar(pair.value) && pair.value.value === attributeName;
    });
    if (!keyPair) continue;
    const span = getYamlNodeSpan(keyPair.value);
    if (!span) return;
    return new vscode.Range(
      standardDocument.positionAt(span.start),
      standardDocument.positionAt(span.end),
    );
  }
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
    const primitiveDefinition = await providePrimitiveTypeDefinition(
      docContext,
      typeName,
      originSelectionRange,
    );
    if (primitiveDefinition) return primitiveDefinition;
  }
  return null;
}

async function providePrimitiveTypeDefinition(
  docContext: BdlShortTermDocumentContext,
  typeName: string,
  originSelectionRange: vscode.Range,
): Promise<vscode.LocationLink[] | null> {
  const standard = await docContext.context.getBdlStandard();
  if (!standard?.primitives?.[typeName]) return null;
  const targetDocument = await findStandardTargetDocument(docContext);
  if (!targetDocument) return null;
  const targetSelectionRange = findPrimitiveDefinitionSelectionRange(
    targetDocument,
    typeName,
  );
  if (!targetSelectionRange) {
    return getModuleLink(targetDocument, originSelectionRange);
  }
  const targetUri = targetDocument.uri;
  const targetRange = targetSelectionRange;
  return [{
    originSelectionRange,
    targetUri,
    targetRange,
    targetSelectionRange,
  }];
}

function findPrimitiveDefinitionSelectionRange(
  targetDocument: vscode.TextDocument,
  primitiveTypeName: string,
): vscode.Range | undefined {
  const yamlDocument = parseYamlDocument(targetDocument.getText(), {
    keepSourceTokens: true,
  });
  const root = yamlDocument.contents;
  if (!isYamlMap(root)) return;
  const primitivesPair = root.items.find((pair: YamlPair) => {
    return isYamlScalar(pair.key) && pair.key.value === "primitives";
  });
  if (!primitivesPair || !isYamlMap(primitivesPair.value)) return;
  const primitivePair = primitivesPair.value.items.find((pair: YamlPair) => {
    return isYamlScalar(pair.key) && pair.key.value === primitiveTypeName;
  });
  if (!primitivePair) return;
  const keySpan = getYamlNodeSpan(primitivePair.key);
  if (!keySpan) return;
  return new vscode.Range(
    targetDocument.positionAt(keySpan.start),
    targetDocument.positionAt(keySpan.end),
  );
}

function getYamlNodeSpan(
  node: unknown,
): { start: number; end: number } | undefined {
  const sourceToken = getYamlSourceToken(node);
  if (sourceToken) {
    const { offset, source } = sourceToken;
    return { start: offset, end: offset + source.length };
  }
  const range = getYamlNodeRange(node);
  if (!range) return;
  const [start, end] = range;
  return { start, end };
}

function getYamlSourceToken(
  node: unknown,
): { offset: number; source: string } | undefined {
  if (!node || typeof node !== "object") return;
  if (!("srcToken" in node)) return;
  const srcToken = (node as { srcToken?: unknown }).srcToken;
  if (!srcToken || typeof srcToken !== "object") return;
  if (!("offset" in srcToken) || !("source" in srcToken)) return;
  const offset = (srcToken as { offset?: unknown }).offset;
  const source = (srcToken as { source?: unknown }).source;
  if (typeof offset !== "number" || typeof source !== "string") return;
  return { offset, source };
}

function getYamlNodeRange(node: unknown): [number, number] | undefined {
  if (!node || typeof node !== "object") return;
  if (!("range" in node)) return;
  const nodeRange = (node as { range?: unknown }).range;
  if (!Array.isArray(nodeRange) || nodeRange.length < 2) return;
  const [start, end] = nodeRange;
  if (typeof start !== "number" || typeof end !== "number") return;
  if (end < start) return;
  return [start, end];
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
