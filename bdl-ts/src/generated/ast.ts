export interface Span {
  start: number;
  end: number;
}

export interface Attribute {
  symbol: AttributeSymbol;
  name: Span;
  content?: Span;
}

export interface BdlAst {
  attributes: Attribute[];
  statements: ModuleLevelStatement[];
}

export type ModuleLevelStatement =
  | Enum
  | Import
  | Oneof
  | Proc
  | Scalar
  | Socket
  | Struct
  | Union;

export interface Enum {
  type: "Enum";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: EnumItem[];
  bracketClose: Span;
}

export interface Import {
  type: "Import";
  attributes: Attribute[];
  keyword: Span;
  path: PathItem[];
  bracketOpen: Span;
  items: ImportItem[];
  bracketClose: Span;
}

export interface Oneof {
  type: "Oneof";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: OneofItem[];
  bracketClose: Span;
}

export interface Proc {
  type: "Proc";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  eq: Span;
  inputType: TypeExpression;
  arrow: Span;
  outputType: TypeExpression;
  error?: ThrowsError;
}

export interface Scalar {
  type: "Scalar";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  eq: Span;
  scalarType: TypeExpression;
}

export interface Socket {
  type: "Socket";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  eq: Span;
  serverMessageType: TypeExpression;
  arrow: Span;
  clientMessageType: TypeExpression;
}

export interface Struct {
  type: "Struct";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  fields: StructField[];
  bracketClose: Span;
}

export interface Union {
  type: "Union";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: UnionItem[];
  bracketClose: Span;
}

export type AttributeSymbol = Sharp | At;

export interface Sharp {
  type: "Sharp";
  start: number;
  end: number;
}

export interface At {
  type: "At";
  start: number;
  end: number;
}

export interface EnumItem {
  attributes: Attribute[];
  name: Span;
  comma?: Span;
}

export interface ImportItem {
  name: Span;
  alias?: ImportAlias;
  comma?: Span;
}

export interface ImportAlias {
  as: Span;
  name: Span;
}

export type PathItem = Identifier | Dot;

export interface Identifier {
  type: "Identifier";
  start: number;
  end: number;
}

export interface Dot {
  type: "Dot";
  start: number;
  end: number;
}

export interface OneofItem {
  attributes: Attribute[];
  type: TypeExpression;
  comma?: Span;
}

export interface ThrowsError {
  keywordThrows: Span;
  errorType: TypeExpression;
}

export interface StructField {
  attributes: Attribute[];
  name: Span;
  question?: Span;
  colon: Span;
  itemType: TypeExpression;
  comma?: Span;
}

export interface TypeExpression {
  valueType: Span;
  container?: Container;
}

export interface Container {
  bracketOpen: Span;
  keyType?: Span;
  bracketClose: Span;
}

export interface UnionItem {
  attributes: Attribute[];
  name: Span;
  struct?: UnionItemStruct;
  comma?: Span;
}

export interface UnionItemStruct {
  bracketOpen: Span;
  fields: StructField[];
  bracketClose: Span;
}
