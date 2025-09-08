import * as vscode from "vscode";
import type * as bdlAst from "@disjukr/bdl/ast";

export function spanToRange(
  document: vscode.TextDocument,
  { start, end }: bdlAst.Span,
): vscode.Range {
  return new vscode.Range(
    document.positionAt(start),
    document.positionAt(end),
  );
}
