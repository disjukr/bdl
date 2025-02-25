import { decodeBase64, encodeBase64 } from "./base64.ts";
import { parseRoughly, type RoughJson } from "./rough-json.ts";
import type { Schema, StructField, Type } from "./schema.ts";

export interface JsonSerDes<T> {
  default: () => T;
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
      return primitiveJsonSerDesTable[
        schema.primitive as keyof typeof primitiveJsonSerDesTable
      ].des(json) as T;
    case "Scalar":
      if (schema.customJsonSerDes) return schema.customJsonSerDes.des(json);
      return desType(schema.scalarType, json);
    case "Enum": {
      if (json.type !== "string") throw new JsonSerDesError();
      const value = JSON.parse(json.text);
      if (!schema.items.has(value)) throw new JsonSerDesError();
      return value as T;
    }
    case "Oneof":
      // TODO: validate
      throw new JsonSerDesError();
    case "Struct": {
      if (json.type !== "object") throw new JsonSerDesError();
      const items: Record<string, RoughJson> = Object.fromEntries(
        json.items.map((item) => [JSON.parse(item.key.text), item.value]),
      );
      return desFields(schema.fields, items);
    }
    case "Union": {
      if (json.type !== "object") throw new JsonSerDesError();
      const items: Record<string, RoughJson> = Object.fromEntries(
        json.items.map((item) => [JSON.parse(item.key.text), item.value]),
      );
      if (items.type.type !== "string") throw new JsonSerDesError();
      const type = JSON.parse(items.type.text);
      if (!(type in schema.items)) throw new JsonSerDesError();
      return desFields(schema.items[type], items);
    }
  }
}

function desFields<T>(
  fields: StructField[],
  items: Record<string, RoughJson>,
): T {
  const result: Record<string, any> = {};
  for (const field of fields) {
    if (field.name in items) {
      result[field.name] = desType(field.itemType, items[field.name]);
    } else {
      if (field.optional) continue;
      result[field.name] = getDefaultValueFromType(field.itemType);
    }
  }
  return result as T;
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

function getDefaultValueFromType(type: Type): any {
  switch (type.type) {
    case "Plain":
      return getDefaultValueFromSchema(type.valueSchema);
    case "Array":
      return [];
    case "Dictionary":
      return {};
  }
}

function getDefaultValueFromSchema<T>(schema: Schema<T>): T {
  switch (schema.type) {
    default:
      throw new JsonSerDesError();
    case "Primitive":
      return primitiveJsonSerDesTable[
        schema.primitive as keyof typeof primitiveJsonSerDesTable
      ].default() as T;
    case "Scalar":
      if (schema.customJsonSerDes) return schema.customJsonSerDes?.default();
      return getDefaultValueFromType(schema.scalarType);
    case "Enum":
      return schema.items.values().next().value as T;
  }
}

export const primitiveJsonSerDesTable = {
  boolean: {
    default: () => false,
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
    default: () => 0,
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
    default: () => 0n,
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
    default: () => 0,
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
    default: () => "",
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
    default: () => new Uint8Array(),
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
