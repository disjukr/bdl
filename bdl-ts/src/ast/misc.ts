import type * as ast from "../generated/ast.ts";

export function span(text: string, { start, end }: ast.Span): string {
  return text.slice(start, end);
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
