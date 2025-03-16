import type * as ast from "../generated/ast.ts";
import { isImport, span } from "./misc.ts";

function isAdjacentTo(offset: number, span: ast.Span): boolean {
  return (offset >= span.start) && (offset <= span.end);
}

export type DefStatement = Exclude<ast.ModuleLevelStatement, ast.Import>;

export function findStatementByTypeName(
  typeName: string,
  bdlText: string,
  bdlAst: ast.BdlAst,
): DefStatement | undefined {
  const defs = bdlAst.statements
    .filter((statement) => !isImport(statement))
    .map((stmt) => (stmt as DefStatement));
  return defs.find((statement) => span(bdlText, statement.name) === typeName);
}

export interface FindImportItemByTypeNameResult {
  statement: ast.Import;
  item: ast.ImportItem;
}
export function findImportItemByTypeName(
  typeName: string,
  bdlText: string,
  bdlAst: ast.BdlAst,
): FindImportItemByTypeNameResult | undefined {
  const imports = bdlAst.statements.filter(isImport);
  for (const statement of imports) {
    for (const item of statement.items) {
      if (item.alias) {
        const aliasName = span(bdlText, item.alias.name);
        if (aliasName === typeName) return { statement, item };
      } else {
        const itemName = span(bdlText, item.name);
        if (itemName === typeName) return { statement, item };
      }
    }
  }
}

export function pickStatement(
  offset: number,
  bdlAst: ast.BdlAst,
): ast.ModuleLevelStatement | undefined {
  for (const statement of bdlAst.statements) {
    if (isAdjacentTo(offset, getStatementSpan(statement))) return statement;
  }
}

export function pickType(
  offset: number,
  bdlAst: ast.BdlAst,
): ast.Span | undefined {
  const statement = pickStatement(offset, bdlAst);
  if (!statement) return;
  switch (statement.type) {
    case "Oneof": {
      return pickTypeInTypeExpressions(
        offset,
        statement.items.map((item) => item.itemType),
      );
    }
    case "Proc": {
      return pickTypeInTypeExpressions(
        offset,
        [statement.inputType, statement.outputType, statement.error?.errorType]
          .filter(Boolean) as ast.TypeExpression[],
      );
    }
    case "Scalar": {
      return pickTypeInTypeExpression(offset, statement.scalarType);
    }
    case "Socket": {
      return pickTypeInTypeExpressions(
        offset,
        [statement.serverMessageType, statement.clientMessageType],
      );
    }
    case "Struct": {
      return pickTypeInTypeExpressions(
        offset,
        statement.fields.map((field) => field.fieldType),
      );
    }
    case "Union": {
      return pickTypeInTypeExpressions(
        offset,
        statement.items.filter((item) => item.struct).flatMap((item) =>
          item.struct!.fields.map((field) => field.fieldType)
        ),
      );
    }
  }
}

export function pickTypeInTypeExpressions(
  offset: number,
  typeExpressions: ast.TypeExpression[],
): ast.Span | undefined {
  for (const typeExpression of typeExpressions) {
    const type = pickTypeInTypeExpression(offset, typeExpression);
    if (type) return type;
  }
}

export function pickTypeInTypeExpression(
  offset: number,
  typeExpression: ast.TypeExpression,
): ast.Span | undefined {
  if (isAdjacentTo(offset, typeExpression.valueType)) {
    return typeExpression.valueType;
  }
  if (!typeExpression.container?.keyType) return;
  if (isAdjacentTo(offset, typeExpression.container.keyType)) {
    return typeExpression.container.keyType;
  }
}

export function getAttributeSpan(attribute: ast.Attribute): ast.Span {
  const start = attribute.symbol.start;
  if (attribute.content) {
    const end = attribute.content.end;
    return { start, end };
  }
  const end = attribute.name.end;
  return { start, end };
}

export function getStatementSpan(
  statement: ast.ModuleLevelStatement,
): ast.Span {
  const firstAttribute = statement.attributes[0];
  const start = firstAttribute
    ? firstAttribute.symbol.start
    : statement.keyword.start;
  if ("bracketClose" in statement) {
    const end = statement.bracketClose.end;
    return { start, end };
  } else {
    const end = statement.type === "Proc"
      ? getProcEnd(statement)
      : statement.type === "Scalar"
      ? getTypeExpressionEnd(statement.scalarType)
      // Socket
      : getTypeExpressionEnd(statement.clientMessageType);
    return { start, end };
  }
}

function getProcEnd(statement: ast.Proc): number {
  if (statement.error) return getTypeExpressionEnd(statement.error.errorType);
  return getTypeExpressionEnd(statement.outputType);
}

function getTypeExpressionEnd(type: ast.TypeExpression): number {
  if (type.container) return type.container.bracketClose.end;
  return type.valueType.end;
}
