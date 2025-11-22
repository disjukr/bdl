import { slice } from "../ast/misc.ts";
import { baseVisitor, type Visitor } from "../cst/visitor.ts";
import type * as cst from "../generated/cst.ts";

export function stringifyImportPathItems(text: string, node: cst.Import) {
  let result = "";
  const visitor: Visitor = {
    ...baseVisitor,
    visitIdentifier: (_visitor, node) => {
      result += slice(text, node);
    },
    visitDot: () => {
      result += ".";
    },
  };
  visitor.visitImport(visitor, node);
  return result;
}

export function stringifyImportItem(text: string, node: cst.ImportItem) {
  let result = "";
  const visitor: Visitor = {
    ...baseVisitor,
    visitImportItem: (visitor, node) => {
      result += slice(text, node.name);
      node.alias && visitor.visitImportAlias(visitor, node.alias);
      node.comma && (result += slice(text, node.comma));
    },
    visitImportAlias: (_visitor, node) => {
      result += ` as ${slice(text, node.name)}`;
    },
  };
  visitor.visitImportItem(visitor, node);
  return result;
}
