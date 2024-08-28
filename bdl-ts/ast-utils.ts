import * as ast from "./model/ast.ts";

export function span(text: string, { start, end }: ast.Span): string {
  return text.slice(start, end);
}

export function isImport(
  statement: ast.ModuleLevelStatement
): statement is ast.Import {
  return statement.type === "Import";
}

export function pathItemsToString(
  text: string,
  pathItems: ast.PathItem[]
): string {
  return pathItems
    .filter((item) => item.type === "Identifier")
    .map((item) => span(text, item))
    .join(".");
}

export function getImportPaths(text: string, ast: ast.BdlAst): string[] {
  const imports = ast.statements.filter(isImport);
  const importPaths = imports.map((importStatement) => importStatement.path);
  return importPaths.map((pathItems) => pathItemsToString(text, pathItems));
}

export function getAttributeContent(
  text: string,
  attribute: ast.Attribute
): string {
  if (!attribute.content) return "";
  return span(text, attribute.content)
    .split("\n")
    .map((line) => line.replace(/^\s*\|\x20?/, ""))
    .join("\n");
}
