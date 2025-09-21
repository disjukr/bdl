export type OffsetEncoding =
  | "UTF8_CODE_UNIT"
  | "UTF16_CODE_UNIT"
  | "UNICODE_CODE_POINT";

export interface Span {
  start: number;
  end: number;
}

export interface BdlCst {
  offsetEncoding: OffsetEncoding;
  statements: ModuleLevelStatement[];
}

export interface Attribute {
  type: "Attribute";
  symbol: AttributeSymbol;
  name: Span;
  content?: Span;
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

export type ModuleLevelStatement =
  | Attribute
  | Enum
  | Import
  | Oneof
  | Proc
  | Custom
  | Struct
  | Union;

export interface Enum {
  type: "Enum";
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  statements: EnumBlockStatement[];
  bracketClose: Span;
}

export interface Import {
  type: "Import";
  keyword: Span;
  path: PathItem[];
  bracketOpen: Span;
  items: ImportItem[];
  bracketClose: Span;
}

export interface Oneof {
  type: "Oneof";
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  statements: OneofBlockStatement[];
  bracketClose: Span;
}

export interface Proc {
  type: "Proc";
  keyword: Span;
  name: Span;
  eq: Span;
  inputType: TypeExpression;
  arrow: Span;
  outputType: TypeExpression;
  error?: ThrowsError;
}

export interface Custom {
  type: "Custom";
  keyword: Span;
  name: Span;
  eq: Span;
  originalType: TypeExpression;
}

export interface Struct {
  type: "Struct";
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  statements: StructBlockStatement[];
  bracketClose: Span;
}

export interface Union {
  type: "Union";
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  statements: UnionBlockStatement[];
  bracketClose: Span;
}

export type EnumBlockStatement =
  | Attribute
  | EnumItem;

export interface EnumItem {
  type: "EnumItem";
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

export type OneofBlockStatement =
  | Attribute
  | OneofItem;

export interface OneofItem {
  type: "OneofItem";
  itemType: TypeExpression;
  comma?: Span;
}

export interface ThrowsError {
  keywordThrows: Span;
  errorType: TypeExpression;
}

export type StructBlockStatement =
  | Attribute
  | StructField;

export interface StructField {
  type: "StructField";
  name: Span;
  question?: Span;
  colon: Span;
  fieldType: TypeExpression;
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

export type UnionBlockStatement =
  | Attribute
  | UnionItem;

export interface UnionItem {
  type: "UnionItem";
  name: Span;
  struct?: UnionItemStruct;
  comma?: Span;
}

export interface UnionItemStruct {
  bracketOpen: Span;
  statements: StructBlockStatement[];
  bracketClose: Span;
}
