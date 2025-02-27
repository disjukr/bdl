import type { JsonSerDes } from "./json-ser-des.ts";

export type Schema<T = any> =
  | Primitive<T>
  | Scalar<T>
  | Enum<T>
  | Oneof<T>
  | Struct<T>
  | Union<T>;

interface SchemaBase<T> {
  "~standard": {
    version: 1;
    vendor: "bdl-ts";
    validate: (value: unknown) =>
      | { value: T }
      | { issues: { message: string; path?: (string | number)[] }[] };
  };
}

export interface Primitive<T> extends SchemaBase<T> {
  type: "Primitive";
  primitive: string;
}

export interface Scalar<T> extends SchemaBase<T> {
  type: "Scalar";
  scalarType: Type;
  customJsonSerDes?: JsonSerDes<T>;
}

export interface Enum<T> extends SchemaBase<T> {
  type: "Enum";
  items: Set<string>;
}

export interface Oneof<T> extends SchemaBase<T> {
  type: "Oneof";
  items: Type[];
}

export interface Struct<T> extends SchemaBase<T> {
  type: "Struct";
  fields: StructField[];
}

export interface Union<T> extends SchemaBase<T> {
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
