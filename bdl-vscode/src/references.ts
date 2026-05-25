import * as vscode from "vscode";
import type * as bdlAst from "@disjukr/bdl/ast";
import { isImport, slice } from "@disjukr/bdl/ast/misc";
import {
  findImportItemByTypeName,
  findStatementByTypeName,
  isOffsetInSpan,
  pickImportItem,
  pickStatement,
  pickType,
} from "@disjukr/bdl/ast/span-picker";
import { BdlShortTermContext, BdlShortTermDocumentContext } from "./context.ts";
import { getImportPathInfo, spanToRange } from "./misc.ts";

export function initReferences(extensionContext: vscode.ExtensionContext) {
  extensionContext.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      [{ language: "bdl" }],
      new BdlReferenceProvider(extensionContext),
    ),
  );
}

export class BdlReferenceProvider implements vscode.ReferenceProvider {
  constructor(public extensionContext: vscode.ExtensionContext) {}

  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    referenceContext: vscode.ReferenceContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.Location[] | null> {
    const context = new BdlShortTermContext(this.extensionContext, document);
    const entryDocContext = context.entryDocContext;
    const target = await getReferenceTarget(
      entryDocContext,
      document.offsetAt(position),
    );
    if (!target) return null;
    const targetDocuments = target.modulePath
      ? await findWorkspaceBdlDocuments(context, token)
      : [document];
    const result: vscode.Location[] = [];
    const locationKeys = new Set<string>();
    for (const targetDocument of targetDocuments) {
      if (token.isCancellationRequested) break;
      const targetDocContext = context.getDocContext(targetDocument);
      await collectReferences(
        targetDocContext,
        target,
        referenceContext,
        result,
        locationKeys,
      );
    }
    return result;
  }
}

interface ReferenceTarget {
  modulePath?: string;
  typeName: string;
}

async function getReferenceTarget(
  docContext: BdlShortTermDocumentContext,
  offset: number,
): Promise<ReferenceTarget | undefined> {
  const statement = pickStatement(offset, docContext.ast);
  if (
    statement && !isImport(statement) && isOffsetInSpan(offset, statement.name)
  ) {
    const modulePath = await docContext.getModulePath();
    const typeName = slice(docContext.text, statement.name);
    if (modulePath) return { modulePath, typeName };
    return { typeName };
  }
  const importItem = pickImportItem(offset, docContext.ast);
  if (importItem) return getImportItemReferenceTarget(docContext, importItem);
  const typeSpan = pickType(offset, docContext.ast);
  if (!typeSpan) return;
  return await resolveTypeNameReferenceTarget(
    docContext,
    slice(docContext.text, typeSpan),
  );
}

function getImportItemReferenceTarget(
  docContext: BdlShortTermDocumentContext,
  importItem: {
    statement: bdlAst.Import;
    item: bdlAst.ImportItem;
  },
): ReferenceTarget {
  const { packageName, pathItems } = getImportPathInfo(
    docContext.text,
    importItem.statement,
  );
  return {
    modulePath: [packageName, ...pathItems].join("."),
    typeName: slice(docContext.text, importItem.item.name),
  };
}

async function resolveTypeNameReferenceTarget(
  docContext: BdlShortTermDocumentContext,
  typeName: string,
): Promise<ReferenceTarget | undefined> {
  const modulePath = await docContext.getModulePath();
  const localStatement = findStatementByTypeName(
    typeName,
    docContext.text,
    docContext.ast,
  );
  if (localStatement) {
    if (modulePath) return { modulePath, typeName };
    return { typeName };
  }
  const importItem = findImportItemByTypeName(
    typeName,
    docContext.text,
    docContext.ast,
  );
  if (importItem) return getImportItemReferenceTarget(docContext, importItem);
}

async function findWorkspaceBdlDocuments(
  context: BdlShortTermContext,
  token: vscode.CancellationToken,
): Promise<vscode.TextDocument[]> {
  if (!context.workspaceFolder) return [context.entryDocument];
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(context.workspaceFolder, "**/*.bdl"),
    "**/{.git,node_modules}/**",
  );
  const documents: vscode.TextDocument[] = [];
  for (const uri of uris) {
    if (token.isCancellationRequested) break;
    try {
      documents.push(await vscode.workspace.openTextDocument(uri));
    } catch { /* ignore */ }
  }
  return documents;
}

async function collectReferences(
  docContext: BdlShortTermDocumentContext,
  target: ReferenceTarget,
  referenceContext: vscode.ReferenceContext,
  locations: vscode.Location[],
  locationKeys: Set<string>,
) {
  const modulePath = await docContext.getModulePath();
  if (referenceContext.includeDeclaration) {
    collectDeclarationReference(
      docContext,
      modulePath,
      target,
      locations,
      locationKeys,
    );
  }
  collectImportReferences(docContext, target, locations, locationKeys);
  collectTypeReferences(
    docContext,
    modulePath,
    target,
    locations,
    locationKeys,
  );
}

function collectDeclarationReference(
  docContext: BdlShortTermDocumentContext,
  modulePath: string | undefined,
  target: ReferenceTarget,
  locations: vscode.Location[],
  locationKeys: Set<string>,
) {
  if (modulePath !== target.modulePath) return;
  const statement = findStatementByTypeName(
    target.typeName,
    docContext.text,
    docContext.ast,
  );
  if (!statement) return;
  pushLocation(docContext.document, statement.name, locations, locationKeys);
}

function collectImportReferences(
  docContext: BdlShortTermDocumentContext,
  target: ReferenceTarget,
  locations: vscode.Location[],
  locationKeys: Set<string>,
) {
  if (!target.modulePath) return;
  for (const statement of docContext.ast.statements) {
    if (!isImport(statement)) continue;
    const { packageName, pathItems } = getImportPathInfo(
      docContext.text,
      statement,
    );
    if ([packageName, ...pathItems].join(".") !== target.modulePath) continue;
    for (const item of statement.items) {
      if (slice(docContext.text, item.name) !== target.typeName) continue;
      pushLocation(docContext.document, item.name, locations, locationKeys);
      if (item.alias) {
        pushLocation(docContext.document, item.alias, locations, locationKeys);
      }
    }
  }
}

function collectTypeReferences(
  docContext: BdlShortTermDocumentContext,
  modulePath: string | undefined,
  target: ReferenceTarget,
  locations: vscode.Location[],
  locationKeys: Set<string>,
) {
  for (
    const typeReference of getTypeReferences(docContext.text, docContext.ast)
  ) {
    const resolvedTarget = resolveTypeReference(
      docContext,
      modulePath,
      typeReference.name,
    );
    if (!isSameReferenceTarget(resolvedTarget, target)) continue;
    pushLocation(
      docContext.document,
      typeReference.span,
      locations,
      locationKeys,
    );
  }
}

interface TypeReference {
  name: string;
  span: bdlAst.Span;
}

function getTypeReferences(
  bdlText: string,
  bdlParsed: bdlAst.BdlAst,
): TypeReference[] {
  const result: TypeReference[] = [];
  for (const statement of bdlParsed.statements) {
    switch (statement.type) {
      case "Custom":
        collectTypeExpressionReferences(
          bdlText,
          statement.originalType,
          result,
        );
        break;
      case "Oneof":
        for (const item of statement.items) {
          collectTypeExpressionReferences(bdlText, item.itemType, result);
        }
        break;
      case "Proc":
        collectTypeExpressionReferences(bdlText, statement.inputType, result);
        collectTypeExpressionReferences(bdlText, statement.outputType, result);
        if (statement.errorType) {
          collectTypeExpressionReferences(bdlText, statement.errorType, result);
        }
        break;
      case "Struct":
        for (const field of statement.fields) {
          collectTypeExpressionReferences(bdlText, field.fieldType, result);
        }
        break;
      case "Union":
        for (const item of statement.items) {
          for (const field of item.fields ?? []) {
            collectTypeExpressionReferences(bdlText, field.fieldType, result);
          }
        }
        break;
    }
  }
  return result;
}

function collectTypeExpressionReferences(
  bdlText: string,
  typeExpression: bdlAst.TypeExpression,
  result: TypeReference[],
) {
  result.push({
    name: slice(bdlText, typeExpression.valueType),
    span: typeExpression.valueType,
  });
  if (typeExpression.container?.keyType) {
    result.push({
      name: slice(bdlText, typeExpression.container.keyType),
      span: typeExpression.container.keyType,
    });
  }
}

function resolveTypeReference(
  docContext: BdlShortTermDocumentContext,
  modulePath: string | undefined,
  typeName: string,
): ReferenceTarget | undefined {
  const localStatement = findStatementByTypeName(
    typeName,
    docContext.text,
    docContext.ast,
  );
  if (localStatement) {
    if (!modulePath) return { typeName };
    return { modulePath, typeName };
  }
  const importItem = findImportItemByTypeName(
    typeName,
    docContext.text,
    docContext.ast,
  );
  if (!importItem) return;
  return getImportItemReferenceTarget(docContext, importItem);
}

function isSameReferenceTarget(
  a: ReferenceTarget | undefined,
  b: ReferenceTarget,
): boolean {
  if (!a) return false;
  if (a.typeName !== b.typeName) return false;
  return a.modulePath === b.modulePath;
}

function pushLocation(
  document: vscode.TextDocument,
  span: bdlAst.Span,
  locations: vscode.Location[],
  locationKeys: Set<string>,
) {
  const key = `${document.uri.toString()}#${span.start}:${span.end}`;
  if (locationKeys.has(key)) return;
  locationKeys.add(key);
  locations.push(
    new vscode.Location(document.uri, spanToRange(document, span)),
  );
}
