import type { PrimitiveType, Schema, Type } from "./data-schema.ts";
import { ser as serJson, serType as serTypeJson } from "./json/ser-des.ts";
import { decodeBase64, encodeBase64 } from "./misc/base64.ts";

export interface StringSerDes<T> {
  ser: (value: T) => string;
  des: (value: string) => T;
}

export function ser<T>(schema: Schema<T>, data: T): string {
  switch (schema.type) {
    default:
      return serJson(schema, data);
    case "Primitive":
      return (primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].ser as (value: T) => string)(data);
    case "Enum":
      return data as string;
  }
}

export function serType<T>(type: Type, data: T): string {
  switch (type.type) {
    default:
      return serTypeJson(type, data);
    case "Plain":
      return ser(type.valueSchema, data);
  }
}

// export function des<T>(schema: Schema<T>, string: string): T {
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
  float64: {
    ser: String,
    des: Number,
  },
  string: {
    ser: (value) => value,
    des: (value) => value,
  },
  bytes: {
    ser: encodeBase64,
    des: decodeBase64,
  },
} as const satisfies { [key in PrimitiveType]: StringSerDes<any> };
