export type BonValue = Primitive | Array | Dictionary | Object | UnionValue;

export interface Primitive {
  type: "Primitive";
  typePath?: string;
  value: PrimitiveValue;
}

export interface Array {
  type: "Array";
  typePath?: string;
  items: BonValue[];
}

export interface Dictionary {
  type: "Dictionary";
  typePath?: string;
  entries: Entry[];
}

export interface Object {
  type: "Object";
  typePath?: string;
  fields: Field[];
}

export interface UnionValue {
  type: "UnionValue";
  typePath?: string;
  itemName: string;
  fields: Field[];
}

export interface Field {
  name: string;
  value: BonValue;
}

export interface Entry {
  key: BonValue;
  value: BonValue;
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
}

export interface Boolean {
  type: "Boolean";
  value: boolean;
}

export interface Identifier {
  type: "Identifier";
  value: string;
}

export interface Integer {
  type: "Integer";
  value: bigint;
}

export interface Float {
  type: "Float";
  value: FloatValue;
}

export interface String {
  type: "String";
  value: string;
}

export type FloatValue = NotANumber | Infinity | Value;

export interface NotANumber {
  type: "NotANumber";
}

export interface Infinity {
  type: "Infinity";
  sign: boolean;
}

export interface Value {
  type: "Value";
  significand: bigint;
  exponent: bigint;
}
