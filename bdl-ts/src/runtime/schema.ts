import type { JsonSerDes } from "./json-ser-des.ts";

export type Schema<T = any> =
  | Primitive
  | Scalar<T>
  | Enum
  | Oneof
  | Struct
  | Union;

export interface Primitive {
  type: "Primitive";
  primitive: string;
}

export interface Scalar<T> {
  type: "Scalar";
  scalarType: Type;
  customJsonSerDes?: JsonSerDes<T>;
}

export interface Enum {
  type: "Enum";
  items: Set<string>;
}

export interface Oneof {
  type: "Oneof";
  items: Type[];
}

export interface Struct {
  type: "Struct";
  fields: StructField[];
}

export interface Union {
  type: "Union";
  items: Record<string, StructField[]>;
}

export interface StructField {
  name: string;
  itemType: Type;
  optional: boolean;
}

export type Type = Plain | Array | Dictionary;

export interface Plain {
  type: "Plain";
  valueSchema: Schema;
}

export interface Array {
  type: "Array";
  valueSchema: Schema;
}

export interface Dictionary {
  type: "Dictionary";
  keySchema: Schema;
  valueSchema: Schema;
}
