import * as vscode from "vscode";
import type * as bdlAst from "@disjukr/bdl/ast";
import { slice } from "@disjukr/bdl/ast/misc";
import {
  getImportPathSpan,
  getStatementSpan,
} from "@disjukr/bdl/ast/span-picker";
import parseBdl from "@disjukr/bdl/parser";
import { spanToRange } from "./misc.ts";

export function initSymbols(extensionContext: vscode.ExtensionContext) {
  extensionContext.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: "bdl" }],
      new BdlDocumentSymbolProvider(),
    ),
  );
}

export class BdlDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentSymbol[] {
    const text = document.getText();
    try {
      const ast = parseBdl(text);
      return ast.statements.map((statement) =>
        createStatementSymbol(document, text, statement)
      );
    } catch {
      return [];
    }
  }
}

function createStatementSymbol(
  document: vscode.TextDocument,
  text: string,
  statement: bdlAst.ModuleLevelStatement,
): vscode.DocumentSymbol {
  switch (statement.type) {
    case "Custom":
      return createNamedSymbol(
        document,
        text,
        statement,
        vscode.SymbolKind.TypeParameter,
        typeExpressionText(text, statement.originalType),
      );
    case "Enum": {
      const symbol = createNamedSymbol(
        document,
        text,
        statement,
        vscode.SymbolKind.Enum,
      );
      symbol.children = statement.items.map(
        (item) => createEnumItemSymbol(document, text, item),
      );
      return symbol;
    }
    case "Import": {
      const symbol = createImportSymbol(document, text, statement);
      symbol.children = statement.items.map(
        (item) => createImportItemSymbol(document, text, item),
      );
      return symbol;
    }
    case "Oneof": {
      const symbol = createNamedSymbol(
        document,
        text,
        statement,
        vscode.SymbolKind.Enum,
      );
      symbol.children = statement.items.map(
        (item) => createOneofItemSymbol(document, text, item),
      );
      return symbol;
    }
    case "Proc":
      return createNamedSymbol(
        document,
        text,
        statement,
        vscode.SymbolKind.Function,
        procDetail(text, statement),
      );
    case "Struct": {
      const symbol = createNamedSymbol(
        document,
        text,
        statement,
        vscode.SymbolKind.Struct,
      );
      symbol.children = statement.fields.map(
        (field) => createStructFieldSymbol(document, text, field),
      );
      return symbol;
    }
    case "Union": {
      const symbol = createNamedSymbol(
        document,
        text,
        statement,
        vscode.SymbolKind.Interface,
      );
      symbol.children = statement.items.map(
        (item) => createUnionItemSymbol(document, text, item),
      );
      return symbol;
    }
  }
}

type NamedStatement = Exclude<bdlAst.ModuleLevelStatement, bdlAst.Import>;

function createNamedSymbol(
  document: vscode.TextDocument,
  text: string,
  statement: NamedStatement,
  kind: vscode.SymbolKind,
  detail = "",
): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(
    slice(text, statement.name),
    detail,
    kind,
    spanToRange(document, getStatementSpan(statement)),
    spanToRange(document, statement.name),
  );
}

function createImportSymbol(
  document: vscode.TextDocument,
  text: string,
  statement: bdlAst.Import,
): vscode.DocumentSymbol {
  const path = statement.path.map((item) => slice(text, item)).join(".");
  const importPathSpan = getImportPathSpan(statement);
  return new vscode.DocumentSymbol(
    `import ${path}`,
    "",
    vscode.SymbolKind.Module,
    spanToRange(document, getStatementSpan(statement)),
    spanToRange(document, importPathSpan),
  );
}

function createImportItemSymbol(
  document: vscode.TextDocument,
  text: string,
  item: bdlAst.ImportItem,
): vscode.DocumentSymbol {
  const importedName = slice(text, item.name);
  const visibleName = item.alias ? slice(text, item.alias) : importedName;
  const detail = item.alias ? importedName : "";
  return new vscode.DocumentSymbol(
    visibleName,
    detail,
    vscode.SymbolKind.TypeParameter,
    spanToRange(document, item),
    spanToRange(document, item.alias ?? item.name),
  );
}

function createEnumItemSymbol(
  document: vscode.TextDocument,
  text: string,
  item: bdlAst.EnumItem,
): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(
    slice(text, item.name),
    "",
    vscode.SymbolKind.EnumMember,
    spanToRange(document, getAttributedSpan(item)),
    spanToRange(document, item.name),
  );
}

function createOneofItemSymbol(
  document: vscode.TextDocument,
  text: string,
  item: bdlAst.OneofItem,
): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(
    typeExpressionText(text, item.itemType),
    "",
    vscode.SymbolKind.TypeParameter,
    spanToRange(document, getAttributedSpan(item)),
    spanToRange(document, item.itemType),
  );
}

function createStructFieldSymbol(
  document: vscode.TextDocument,
  text: string,
  field: bdlAst.StructField,
): vscode.DocumentSymbol {
  return new vscode.DocumentSymbol(
    slice(text, field.name),
    typeExpressionText(text, field.fieldType),
    vscode.SymbolKind.Field,
    spanToRange(document, getAttributedSpan(field)),
    spanToRange(document, field.name),
  );
}

function createUnionItemSymbol(
  document: vscode.TextDocument,
  text: string,
  item: bdlAst.UnionItem,
): vscode.DocumentSymbol {
  const symbol = new vscode.DocumentSymbol(
    slice(text, item.name),
    "",
    vscode.SymbolKind.Struct,
    spanToRange(document, getAttributedSpan(item)),
    spanToRange(document, item.name),
  );
  symbol.children = (item.fields ?? []).map(
    (field) => createStructFieldSymbol(document, text, field),
  );
  return symbol;
}

function procDetail(text: string, proc: bdlAst.Proc): string {
  const input = typeExpressionText(text, proc.inputType);
  const output = typeExpressionText(text, proc.outputType);
  const error = proc.errorType
    ? ` throws ${typeExpressionText(text, proc.errorType)}`
    : "";
  return `${input} -> ${output}${error}`;
}

function typeExpressionText(
  text: string,
  typeExpression: bdlAst.TypeExpression,
): string {
  return slice(text, typeExpression).trim();
}

function getAttributedSpan(
  item: { attributes: bdlAst.Attribute[]; start: number; end: number },
): bdlAst.Span {
  const firstAttribute = item.attributes[0];
  return {
    start: firstAttribute ? firstAttribute.start : item.start,
    end: item.end,
  };
}
