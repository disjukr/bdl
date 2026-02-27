import type { JsonSerDes } from "./json-ser-des.ts";
import type { PojoSerDes } from "./pojo-ser-des.ts";
import type { TextSerDes } from "./text-ser-des.ts";
import { validate as validateFn } from "./validator.ts";

export type Schema<T = unknown> =
  | Primitive<T>
  | Custom<T>
  | Enum<T>
  | Oneof<T>
  | Struct<T>
  | Union<T>;

export type ValidateFn<T> = (value: unknown) => ValidateResult<T>;
export type ValidateResult<T> =
  | { value: T }
  | { issues: { message: string; path?: Path }[] };

export type Path = (string | number)[];

interface SchemaBase<T> {
  "~standard": {
    version: 1;
    vendor: "bdl-ts";
    validate: ValidateFn<T>;
  };
}
function getSchemaBase<T>(validate: ValidateFn<T>): SchemaBase<T> {
  return { "~standard": { version: 1, vendor: "bdl-ts", validate } };
}

export type PrimitiveType = keyof Primitives;
export interface Primitives {
  boolean: boolean;
  int32: number;
  int64: bigint;
  integer: bigint;
  float64: number;
  string: string;
  bytes: Uint8Array;
}
export const primitiveDefaultTable: {
  [K in PrimitiveType]: () => Primitives[K];
} = {
  boolean: () => false,
  int32: () => 0,
  int64: () => 0n,
  integer: () => 0n,
  float64: () => 0,
  string: () => "",
  bytes: () => new Uint8Array(),
};
export const defs: Record<string, Schema<any>> = Object.fromEntries(
  Object.keys(primitiveDefaultTable).map(
    (primitive) => {
      const def: Primitive<unknown> = {
        type: "Primitive",
        primitive: primitive as PrimitiveType,
        ...getSchemaBase((value) => validateFn(def, value)),
      };
      return [primitive, def];
    },
  ),
);

export interface Primitive<T> extends SchemaBase<T> {
  type: "Primitive";
  primitive: PrimitiveType;
}

export interface Custom<T> extends SchemaBase<T> {
  type: "Custom";
  originalType: Type;
  customValidate?: ValidateFn<T>;
  customJsonSerDes?: JsonSerDes<T>;
  customPojoSerDes?: PojoSerDes<T>;
  customTextSerDes?: TextSerDes<T>;
}
export function defineCustom<T>(
  id: string,
  originalType: Type,
  partial: Partial<Custom<T>> = {},
): Custom<T> {
  const { customValidate } = partial;
  const def: Custom<T> = {
    type: "Custom",
    originalType,
    ...partial,
    ...getSchemaBase(
      customValidate ?? ((value) => validateFn(def, value)),
    ),
  };
  defs[id] = def;
  return def;
}

export interface Enum<T> extends SchemaBase<T> {
  type: "Enum";
  items: Set<string>;
}
export function defineEnum<T>(id: string, items: Set<string>): Enum<T> {
  const def: Enum<T> = {
    type: "Enum",
    items,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  defs[id] = def;
  return def;
}

export interface Oneof<T> extends SchemaBase<T> {
  type: "Oneof";
  items: Type[];
}
export function defineOneof<T>(id: string, items: Type[]): Oneof<T> {
  const def: Oneof<T> = {
    type: "Oneof",
    items,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  defs[id] = def;
  return def;
}

export interface Struct<T> extends SchemaBase<T> {
  type: "Struct";
  fields: StructField[];
}
export function defineStruct<T>(id: string, fields: StructField[]): Struct<T> {
  const def: Struct<T> = {
    type: "Struct",
    fields,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  defs[id] = def;
  return def;
}

export interface Union<T> extends SchemaBase<T> {
  type: "Union";
  discriminator: string;
  items: Record<string, StructField[]>;
}
export function defineUnion<T>(
  id: string,
  discriminator: string,
  items: Record<string, StructField[]>,
): Union<T> {
  const def: Union<T> = {
    type: "Union",
    discriminator,
    items,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  defs[id] = def;
  return def;
}

export interface StructField {
  name: string;
  fieldType: Type;
  optional: boolean;
}
export function f(
  name: string,
  fieldType: Type,
  optional = false,
): StructField {
  return { name, fieldType, optional };
}

export type Type = Plain | Array | Dictionary;

export interface Plain {
  type: "Plain";
  valueId: string;
}
export function p(valueId: string): Plain {
  return { type: "Plain", valueId };
}

export interface Array {
  type: "Array";
  valueId: string;
}
export function a(valueId: string): Array {
  return { type: "Array", valueId };
}

export interface Dictionary {
  type: "Dictionary";
  keyId: string;
  valueId: string;
}
export function d(keyId: string, valueId: string): Dictionary {
  return { type: "Dictionary", keyId, valueId };
}
