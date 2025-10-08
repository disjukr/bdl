export type OffsetEncoding =
  | "UTF8_CODE_UNIT"
  | "UTF16_CODE_UNIT"
  | "UNICODE_CODE_POINT";

export interface Span {
  start: number;
  end: number;
}

export interface BonCst {
  offsetEncoding: OffsetEncoding;
  value: BonValue;
}

export type BonValue = Primitive | Array | Dictionary | Object | UnionValue;

export interface Primitive {
  type: "Primitive";
  typeInfo?: TypeInfo;
  value: PrimitiveValue;
}

export interface Array {
  type: "Array";
  typeInfo?: TypeInfo;
  bracketOpen: Span;
  items: Item[];
  bracketClose: Span;
}

export interface Dictionary {
  type: "Dictionary";
  typeInfo?: TypeInfo;
  bracketOpen: Span;
  entries: Entry[];
  bracketClose: Span;
}

export interface Object {
  type: "Object";
  typeInfo?: TypeInfo;
  bracketOpen: Span;
  fields: Field[];
  bracketClose: Span;
}

export interface UnionValue {
  type: "UnionValue";
  typeInfo?: TypeInfo;
  itemName: Span;
  bracketOpen: Span;
  fields: Field[];
  bracketClose: Span;
}

export type PrimitiveValue =
  | Null
  | Boolean
  | Identifier
  | Integer
  | Float
  | String;

export interface Null {
  type: "Null";
  start: number;
  end: number;
}

export interface Boolean {
  type: "Boolean";
  start: number;
  end: number;
}

export interface Identifier {
  type: "Identifier";
  start: number;
  end: number;
}

export interface Integer {
  type: "Integer";
  sign?: Span;
  value: Span;
}

export interface Float {
  type: "Float";
  value: FloatValue;
}

export interface String {
  type: "String";
  start: number;
  end: number;
}

export type FloatValue = NotANumber | Infinity | Value;

export interface NotANumber {
  type: "NotANumber";
  start: number;
  end: number;
}

export interface Infinity {
  type: "Infinity";
  sign?: Span;
  value: Span;
}

export interface Value {
  type: "Value";
  sign?: Span;
  significand: Span;
  fraction?: Fraction;
  exponent?: Exponent;
}

export interface Fraction {
  dot: Span;
  value: Span;
}

export interface Exponent {
  marker: Span;
  sign?: Span;
  value: Span;
}

export interface Item {
  value: BonValue;
  comma?: Span;
}

export interface Entry {
  key: BonValue;
  colon: Span;
  value: BonValue;
  comma?: Span;
}

export interface Field {
  name: Span;
  colon: Span;
  value: BonValue;
  comma?: Span;
}

export interface TypeInfo {
  typePath: PathItem[];
  colonColon: Span;
}

export type PathItem = Identifier | Dot;

export interface Dot {
  type: "Dot";
  start: number;
  end: number;
}
