import type { JsonSerDes } from "./json/ser-des.ts";
import type { StringSerDes } from "./string-ser-des.ts";
import { validate as validateFn } from "./validate.ts";

export type Schema<T = unknown> =
  | Primitive<T>
  | Scalar<T>
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

export type PrimitiveType = keyof typeof primitiveDefaultTable;
export const primitiveDefaultTable = {
  boolean: () => false,
  int32: () => 0,
  int64: () => 0n,
  integer: () => 0n,
  float64: () => 0,
  string: () => "",
  bytes: () => new Uint8Array(),
} as const;
type PrimitiveTsType<T extends PrimitiveType> = ReturnType<
  (typeof primitiveDefaultTable)[T]
>;

export interface Primitive<T> extends SchemaBase<T> {
  type: "Primitive";
  primitive: PrimitiveType;
}
export const primitives = Object.fromEntries(
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
) as { [K in PrimitiveType]: Primitive<PrimitiveTsType<K>> };

export interface Scalar<T> extends SchemaBase<T> {
  type: "Scalar";
  scalarType: Type;
  customValidate?: ValidateFn<T>;
  customJsonSerDes?: JsonSerDes<T>;
  customStringSerDes?: StringSerDes<T>;
}
export function createScalar<T>(
  scalarType: Type,
  partial: Partial<Scalar<T>> = {},
): Scalar<T> {
  const { customValidate } = partial;
  const def: Scalar<T> = {
    type: "Scalar",
    scalarType,
    ...partial,
    ...getSchemaBase(
      customValidate ?? ((value) => validateFn(def, value)),
    ),
  };
  return def;
}

export interface Enum<T> extends SchemaBase<T> {
  type: "Enum";
  items: Set<string>;
}
export function createEnum<T>(items: Set<string>): Enum<T> {
  const def: Enum<T> = {
    type: "Enum",
    items,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  return def;
}

export interface Oneof<T> extends SchemaBase<T> {
  type: "Oneof";
  items: Type[];
}
export function createOneof<T>(items: Type[]): Oneof<T> {
  const def: Oneof<T> = {
    type: "Oneof",
    items,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  return def;
}

export interface Struct<T> extends SchemaBase<T> {
  type: "Struct";
  fields: StructField[];
}
export function createStruct<T>(fields: StructField[]): Struct<T> {
  const def: Struct<T> = {
    type: "Struct",
    fields,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  return def;
}

export interface Union<T> extends SchemaBase<T> {
  type: "Union";
  discriminator: string;
  items: Record<string, StructField[]>;
}
export function createUnion<T>(
  discriminator: string,
  items: Record<string, StructField[]>,
): Union<T> {
  const def: Union<T> = {
    type: "Union",
    discriminator,
    items,
    ...getSchemaBase((value) => validateFn(def, value)),
  };
  return def;
}

export interface StructField {
  name: string;
  itemType: Type;
  optional: boolean;
}
export function f(
  name: string,
  itemType: Type,
  optional = false,
): StructField {
  return { name, itemType, optional };
}

export type Type = Plain | Array | Dictionary;

export interface Plain {
  type: "Plain";
  valueSchema: Schema;
}
export function p(valueSchema: Schema): Plain {
  return { type: "Plain", valueSchema };
}

export interface Array {
  type: "Array";
  valueSchema: Schema;
}
export function a(valueSchema: Schema): Array {
  return { type: "Array", valueSchema };
}

export interface Dictionary {
  type: "Dictionary";
  keySchema: Schema;
  valueSchema: Schema;
}
export function d(keySchema: Schema, valueSchema: Schema): Dictionary {
  return { type: "Dictionary", keySchema, valueSchema };
}
