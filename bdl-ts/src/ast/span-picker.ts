import type * as ast from "../ast.ts";

export function isInsideOf(offset: number, span: ast.Span): boolean {
  return (offset >= span.start) && (offset < span.end);
}

export function pickStatement(
  offset: number,
  bdlAst: ast.BdlAst,
): ast.ModuleLevelStatement | undefined {
  for (const statement of bdlAst.statements) {
    if (isInsideOf(offset, getStatementSpan(statement))) return statement;
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
        statement.items.map((item) => item.type),
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
        statement.fields.map((field) => field.itemType),
      );
    }
    case "Union": {
      return pickTypeInTypeExpressions(
        offset,
        statement.items.filter((item) => item.struct).flatMap((item) =>
          item.struct!.fields.map((field) => field.itemType)
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
  if (isInsideOf(offset, typeExpression.valueType)) {
    return typeExpression.valueType;
  }
  if (!typeExpression.container?.keyType) return;
  if (isInsideOf(offset, typeExpression.container.keyType)) {
    return typeExpression.container.keyType;
  }
}

export function getAttributeSpan(attribute: ast.Attribute): ast.Span {
  const start = attribute.symbol.start;
  if (attribute.content) {
    const end = attribute.content.end;
    return { start, end };
  }
  const end = attribute.id.end;
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
