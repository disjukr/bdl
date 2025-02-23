import { decodeBase64, encodeBase64 } from "./base64.ts";
import { parseRoughly, type RoughJson } from "./rough-json.ts";
import type { Schema, Type } from "./schema.ts";

export interface JsonSerDes<T> {
  ser: (value: T) => string;
  des: (value: RoughJson) => T;
}

export class JsonSerDesError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "JsonSerDesError";
  }
}

export function ser<T>(schema: Schema<T>, data: T): string {
  return ""; // TODO
}

export function des<T>(schema: Schema<T>, json: string): T {
  return desSchema(schema, parseRoughly(json));
}

function desSchema<T>(schema: Schema<T>, json: RoughJson): T {
  switch (schema.type) {
    case "Primitive":
      if (!(schema.primitive in primitiveJsonSerDesTable)) {
        throw new JsonSerDesError();
      }
      return primitiveJsonSerDesTable[
        schema.primitive as keyof typeof primitiveJsonSerDesTable
      ].des(json) as T;
    case "Scalar":
    case "Enum":
      if (json.type !== "string") throw new JsonSerDesError();
      return JSON.parse(json.text) as T;
    case "Oneof":
      // TODO: validate
      throw new JsonSerDesError();
    case "Struct":
      // TODO
      throw new JsonSerDesError();
    case "Union":
      // TODO
      throw new JsonSerDesError();
  }
}

function desType<T>(type: Type, json: RoughJson): T {
  switch (type.type) {
    case "Plain":
      return desSchema(type.valueSchema, json);
    case "Array":
      if (json.type !== "array") throw new JsonSerDesError();
      return json.items.map((item) => desSchema(type.valueSchema, item)) as T;
    case "Dictionary": {
      if (json.type !== "object") throw new JsonSerDesError();
      const result: Record<any, any> = {};
      for (const item of json.items) {
        const key = JSON.parse(item.key.text);
        result[key] = desSchema(type.valueSchema, item.value);
      }
      return result as T;
    }
  }
}

export const primitiveJsonSerDesTable = {
  boolean: {
    ser(value: boolean) {
      return value.toString();
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "boolean":
          return value.value;
        case "number":
          return Number(value.text) !== 0;
      }
    },
  },
  int32: {
    ser(value: number) {
      return String(value | 0);
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "string":
          return Number(JSON.parse(value.text)) | 0;
        case "number":
          return Number(value.text) | 0;
      }
    },
  },
  int64: {
    ser(value: bigint) {
      return String(value);
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "string":
          return BigInt(JSON.parse(value.text));
        case "number":
          return BigInt(value.text);
      }
    },
  },
  float64: {
    ser(value: number) {
      return JSON.stringify(value);
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "string":
          return Number(JSON.parse(value.text));
        case "number":
          return Number(value.text);
      }
    },
  },
  string: {
    ser(value: string) {
      return JSON.stringify(value);
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "string":
          return value.text;
      }
    },
  },
  bytes: {
    ser(value: Uint8Array) {
      return encodeBase64(value);
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "string":
          return decodeBase64(value.text);
      }
    },
  },
} as const satisfies Record<string, JsonSerDes<any>>;
