import type * as ast from "../generated/ast.ts";
import type { AttributeSlot } from "../generated/standard.ts";
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

export function groupAttributesBySlot(
  ast: ast.BdlAst,
): Record<AttributeSlot, ast.Attribute[]> {
  const result = {} as Record<AttributeSlot, ast.Attribute[]>;
  let currentSlot: AttributeSlot = "bdl.module";
  const attributeVisitor: Visitor = {
    ...baseVisitor,
    visitAttribute: (_, node) => (result[currentSlot] ??= []).push(node),
    visitEnum: (visitor, node) => {
      currentSlot = "bdl.enum";
      baseVisitor.visitEnum(visitor, node);
    },
    visitEnumItem: (visitor, node) => {
      currentSlot = "bdl.enum.item";
      baseVisitor.visitEnumItem(visitor, node);
    },
    visitImport: (visitor, node) => {
      currentSlot = "bdl.import";
      baseVisitor.visitImport(visitor, node);
    },
    visitOneof: (visitor, node) => {
      currentSlot = "bdl.oneof";
      baseVisitor.visitOneof(visitor, node);
    },
    visitOneofItem: (visitor, node) => {
      currentSlot = "bdl.oneof.item";
      baseVisitor.visitOneofItem(visitor, node);
    },
    visitProc: (visitor, node) => {
      currentSlot = "bdl.proc";
      baseVisitor.visitProc(visitor, node);
    },
    visitCustom: (visitor, node) => {
      currentSlot = "bdl.custom";
      baseVisitor.visitCustom(visitor, node);
    },
    visitStruct: (visitor, node) => {
      currentSlot = "bdl.struct";
      baseVisitor.visitStruct(visitor, node);
    },
    visitStructField: (visitor, node) => {
      currentSlot = "bdl.struct.field";
      baseVisitor.visitStructField(visitor, node);
    },
    visitUnion: (visitor, node) => {
      currentSlot = "bdl.union";
      baseVisitor.visitUnion(visitor, node);
    },
    visitUnionItem: (visitor, node) => {
      currentSlot = "bdl.union.item";
      baseVisitor.visitUnionItem(visitor, node);
    },
  };
  attributeVisitor.visitBdlAst(attributeVisitor, ast);
  return result;
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
