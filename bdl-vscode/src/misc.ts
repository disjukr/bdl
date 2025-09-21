import * as vscode from "vscode";
import type * as bdlAst from "@disjukr/bdl/ast";
import { span } from "@disjukr/bdl/ast/misc";

export function spanToRange(
  document: vscode.TextDocument,
  { start, end }: bdlAst.Span,
): vscode.Range {
  return new vscode.Range(
    document.positionAt(start),
    document.positionAt(end),
  );
}

interface ImportPathInfo {
  packageName: string;
  pathItems: string[];
}
export function getImportPathInfo(
  bdlText: string,
  statement: bdlAst.Import,
): ImportPathInfo {
  const [packageName, ...pathItems] = statement.path
    .filter((item) => item.type === "Identifier")
    .map((item) => span(bdlText, item));
  return { packageName, pathItems };
}
