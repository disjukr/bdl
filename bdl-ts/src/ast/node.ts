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
  AttributeSymbol: ast.AttributeSymbol;
  Sharp: ast.Sharp;
  At: ast.At;
  EnumItem: ast.EnumItem;
  ImportItem: ast.ImportItem;
  ImportAlias: ast.ImportAlias;
  PathItem: ast.PathItem;
  Identifier: ast.Identifier;
  Dot: ast.Dot;
  OneofItem: ast.OneofItem;
  ThrowsError: ast.ThrowsError;
  StructField: ast.StructField;
  TypeExpression: ast.TypeExpression;
  Container: ast.Container;
  UnionItem: ast.UnionItem;
  UnionItemStruct: ast.UnionItemStruct;
}
