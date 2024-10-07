export interface Span {
  start: number;
  end: number;
}

export interface Attribute {
  type: "Attribute";
  symbol: AttributeSymbol;
  id: Span;
  content?: Span;
}

export type AttributeSymbol = Sharp | At;

export interface Sharp extends Span {
  type: "Sharp";
}

export interface At extends Span {
  type: "At";
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

export type PathItem = Identifier | Dot;

export interface Identifier extends Span {
  type: "Identifier";
}

export interface Dot extends Span {
  type: "Dot";
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

export interface ImportItem {
  name: Span;
  alias?: ImportAlias;
  comma?: Span;
}

export interface ImportAlias {
  as: Span;
  name: Span;
}

export interface Scalar {
  type: "Scalar";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  eq: Span;
  scalarType: TypeExpression;
}

export interface Enum {
  type: "Enum";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: EnumItem[];
  bracketClose: Span;
}

export interface EnumItem {
  attributes: Attribute[];
  name: Span;
  comma?: Span;
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

export interface OneofItem {
  attributes: Attribute[];
  type: TypeExpression;
  comma?: Span;
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

export interface Struct {
  type: "Struct";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  fields: StructField[];
  bracketClose: Span;
}

export interface StructField {
  attributes: Attribute[];
  name: Span;
  question?: Span;
  colon: Span;
  itemType: TypeExpression;
  comma?: Span;
}

export interface Exclamation extends Span {
  type: "Exclamation";
}

export interface Question extends Span {
  type: "Question";
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

export interface ThrowsError {
  keywordThrows: Span;
  errorType: TypeExpression;
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

export interface TypeExpression {
  valueType: Span;
  container?: Container;
}

export interface Container {
  bracketOpen: Span;
  keyType?: Span;
  bracketClose: Span;
}
