import {
  globalDefs,
  type PrimitiveType,
  type Schema,
  type Type,
} from "./data-schema.ts";
import { ser as serJson, serType as serTypeJson } from "./json-ser-des.ts";
import { decodeBase64, encodeBase64 } from "./misc/base64.ts";

export interface TextSerDes<T> {
  ser: (value: T) => string;
  des: (value: string) => T;
}

export function ser<T>(schema: Schema<T>, data: T, defs = globalDefs): string {
  switch (schema.type) {
    default:
      return serJson(schema, data, defs);
    case "Primitive":
      return (primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].ser as (value: T) => string)(data);
    case "Custom":
      if (schema.customTextSerDes) return schema.customTextSerDes.ser(data);
      return serType(schema.originalType, data, defs);
    case "Enum":
      return data as string;
  }
}

export function serType<T>(type: Type, data: T, defs = globalDefs): string {
  switch (type.type) {
    default:
      return serTypeJson(type, data, defs);
    case "Plain":
      return ser(defs[type.valueId], data, defs);
  }
}

// export function des<T>(schema: Schema<T>, text: string, defs = globalDefs): T {
//   // TODO
// }

const primitiveSerDesTable = {
  boolean: {
    ser(value: boolean) {
      return value ? "true" : "false";
    },
    des(value: string) {
      return value === "true";
    },
  },
  int32: {
    ser(value: number) {
      return String(value | 0);
    },
    des(value: string) {
      return Number(value) | 0;
    },
  },
  int64: {
    ser: String,
    des: BigInt,
  },
  integer: {
    ser: String,
    des: BigInt,
  },
  float64: {
    ser: String,
    des: Number,
  },
  string: {
    ser: String,
    des: String,
  },
  bytes: {
    ser: encodeBase64,
    des: decodeBase64,
  },
  object: {
    ser(value: Record<string, unknown>) {
      return JSON.stringify(value);
    },
    des(value: string) {
      return JSON.parse(value) as Record<string, unknown>;
    },
  },
  void: {
    ser() {
      return "";
    },
    des() {
      return undefined;
    },
  },
} as const satisfies { [key in PrimitiveType]: TextSerDes<unknown> };
