import type * as cst from "../generated/cst.ts";

export type Node = Nodes[keyof Nodes];

export interface Nodes {
  Span: cst.Span;
  Attribute: cst.Attribute;
  BdlCst: cst.BdlCst;
  ModuleLevelStatement: cst.ModuleLevelStatement;
  Enum: cst.Enum;
  Import: cst.Import;
  Oneof: cst.Oneof;
  Proc: cst.Proc;
  Custom: cst.Custom;
  Struct: cst.Struct;
  Union: cst.Union;
  AttributeSymbol: cst.AttributeSymbol;
  Sharp: cst.Sharp;
  At: cst.At;
  EnumBlockStatement: cst.EnumBlockStatement;
  EnumItem: cst.EnumItem;
  ImportItem: cst.ImportItem;
  ImportAlias: cst.ImportAlias;
  PathItem: cst.PathItem;
  Identifier: cst.Identifier;
  Dot: cst.Dot;
  OneofBlockStatement: cst.OneofBlockStatement;
  OneofItem: cst.OneofItem;
  ThrowsError: cst.ThrowsError;
  StructBlockStatement: cst.StructBlockStatement;
  StructField: cst.StructField;
  TypeExpression: cst.TypeExpression;
  Container: cst.Container;
  UnionBlockStatement: cst.UnionBlockStatement;
  UnionItem: cst.UnionItem;
  UnionItemStruct: cst.UnionItemStruct;
}
