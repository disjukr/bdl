import type * as ast from "../generated/ast.ts";
import { baseVisitor, type Visitor } from "./visitor.ts";

export function span(text: string, { start, end }: ast.Span): string {
  return text.slice(start, end);
}

export function extend(a: ast.Span, b?: ast.Span): ast.Span {
  if (!b) return a;
  return {
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
  };
}

export function isImport(
  statement: ast.ModuleLevelStatement,
): statement is ast.Import {
  return statement.type === "Import";
}

export function pathItemsToString(
  text: string,
  pathItems: ast.PathItem[],
): string {
  return pathItems
    .filter((item) => item.type === "Identifier")
    .map((item) => span(text, item))
    .join(".");
}

export function getImportPaths(text: string, bdlAst: ast.BdlAst): string[] {
  const imports = bdlAst.statements.filter(isImport);
  const importPaths = imports.map((importStatement) => importStatement.path);
  return importPaths.map((pathItems) => pathItemsToString(text, pathItems));
}

export function getAttributeContent(
  text: string,
  attribute: ast.Attribute,
): string {
  if (!attribute.content) return "";
  const content = span(text, attribute.content);
  if (content.startsWith("-")) return content.replace(/^- ?/, "");
  return content
    .split("\n")
    .map((line) => line.replace(/^\s*\|\x20?/, ""))
    .join("\n");
}

export function getTypeExpressions(ast: ast.BdlAst): ast.TypeExpression[] {
  const typeExpressions: ast.TypeExpression[] = [];
  const typeVisitor: Visitor = {
    ...baseVisitor,
    visitTypeExpression: (_, node) => typeExpressions.push(node),
  };
  typeVisitor.visitBdlAst(typeVisitor, ast);
  return typeExpressions;
}
