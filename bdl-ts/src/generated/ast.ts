export type OffsetEncoding =
  | "UTF8_CODE_UNIT"
  | "UTF16_CODE_UNIT"
  | "UNICODE_CODE_POINT";

export interface Span {
  start: number;
  end: number;
}

export interface Attribute {
  start: number;
  end: number;
  name: Span;
  content?: Span;
}

export interface BdlAst {
  offsetEncoding: OffsetEncoding;
  attributes: Attribute[];
  statements: ModuleLevelStatement[];
}

export type ModuleLevelStatement =
  | Enum
  | Import
  | Oneof
  | Proc
  | Custom
  | Struct
  | Union;

export interface Enum {
  type: "Enum";
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  items: EnumItem[];
}

export interface Import {
  type: "Import";
  attributes: Attribute[];
  start: number;
  end: number;
  path: Span[];
  items: ImportItem[];
}

export interface Oneof {
  type: "Oneof";
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  items: OneofItem[];
}

export interface Proc {
  type: "Proc";
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  inputType: TypeExpression;
  outputType: TypeExpression;
  errorType?: TypeExpression;
}

export interface Custom {
  type: "Custom";
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  originalType: TypeExpression;
}

export interface Struct {
  type: "Struct";
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  fields: StructField[];
}

export interface Union {
  type: "Union";
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  items: UnionItem[];
}

export interface EnumItem {
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
}

export interface ImportItem {
  start: number;
  end: number;
  name: Span;
  alias?: Span;
}

export interface OneofItem {
  attributes: Attribute[];
  start: number;
  end: number;
  itemType: TypeExpression;
}

export interface StructField {
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  question?: Span;
  fieldType: TypeExpression;
}

export interface TypeExpression {
  start: number;
  end: number;
  valueType: Span;
  container?: Container;
}

export interface Container {
  start: number;
  end: number;
  keyType?: Span;
}

export interface UnionItem {
  attributes: Attribute[];
  start: number;
  end: number;
  name: Span;
  fields?: StructField[];
}
