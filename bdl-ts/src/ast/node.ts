import type * as ast from "../generated/ast.ts";

export type Node = Nodes[keyof Nodes];

export interface Nodes {
  Span: ast.Span;
  Attribute: ast.Attribute;
  BdlAst: ast.BdlAst;
  ModuleLevelStatement: ast.ModuleLevelStatement;
  Enum: ast.Enum;
  Import: ast.Import;
  Oneof: ast.Oneof;
  Proc: ast.Proc;
  Custom: ast.Custom;
  Struct: ast.Struct;
  Union: ast.Union;
  EnumItem: ast.EnumItem;
  ImportItem: ast.ImportItem;
  OneofItem: ast.OneofItem;
  StructField: ast.StructField;
  TypeExpression: ast.TypeExpression;
  Container: ast.Container;
  UnionItem: ast.UnionItem;
}
