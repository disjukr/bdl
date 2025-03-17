import {
  primitiveDefaultTable,
  type PrimitiveType,
  type Schema,
  type StructField,
  type Type,
} from "../data-schema.ts";
import { decodeBase64, encodeBase64 } from "../misc/base64.ts";
import { parseRoughly, type RoughJson } from "./rough-json.ts";
import { validateType } from "../validate.ts";

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
  switch (schema.type) {
    case "Primitive":
      return (primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].ser as (value: T) => string)(data);
    case "Scalar":
      if (schema.customJsonSerDes) return schema.customJsonSerDes.ser(data);
      if (schema.customStringSerDes) return schema.customStringSerDes.ser(data);
      return serType(schema.scalarType, data);
    case "Enum":
      return JSON.stringify(data);
    case "Oneof": {
      for (const item of schema.items) {
        const result = validateType(item, data);
        if ("issues" in result) continue;
        return serType(item, data);
      }
      throw new JsonSerDesError();
    }
    case "Struct":
      return `{${serFields(schema.fields, data)}}`;
    case "Union": {
      const type = (data as Record<string, string>)[schema.discriminator];
      return `{${JSON.stringify(schema.discriminator)}:${type},${
        serFields(schema.items[type], data)
      }}`;
    }
  }
}

export function des<T>(schema: Schema<T>, json: string): T {
  return desSchema(schema, parseRoughly(json));
}

export function serFields<T>(fields: StructField[], data: T): string {
  return fields.map((field) => {
    const value = (data as Record<string, unknown>)[field.name];
    if (value == null) return "";
    return `${JSON.stringify(field.name)}:${serType(field.itemType, value)}`;
  }).filter(Boolean).join(",");
}

export function serType<T>(type: Type, data: T): string {
  switch (type.type) {
    case "Plain":
      return ser(type.valueSchema, data);
    case "Array":
      return `[${
        (data as unknown[]).map(
          (item) => ser(type.valueSchema, item),
        ).join(",")
      }]`;
    case "Dictionary": {
      return `{${
        Object.entries(data as Record<string, unknown>).map(([key, value]) =>
          `${JSON.stringify(key)}:${ser(type.valueSchema, value)}`
        ).join(",")
      }}`;
    }
  }
}

function desSchema<T>(schema: Schema<T>, json: RoughJson): T {
  switch (schema.type) {
    case "Primitive":
      return primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].des(json) as T;
    case "Scalar":
      if (schema.customJsonSerDes) return schema.customJsonSerDes.des(json);
      if (schema.customStringSerDes) {
        if (json.type !== "string") throw new JsonSerDesError();
        return schema.customStringSerDes.des(JSON.parse(json.text));
      }
      return desType(schema.scalarType, json);
    case "Enum": {
      if (json.type !== "string") throw new JsonSerDesError();
      const value = JSON.parse(json.text);
      if (!schema.items.has(value)) throw new JsonSerDesError();
      return value as T;
    }
    case "Oneof": {
      for (const item of schema.items) {
        const value = desType(item, json);
        const result = validateType(item, value);
        if ("issues" in result) continue;
        return value as T;
      }
      throw new JsonSerDesError();
    }
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
      if (!(schema.discriminator in items)) throw new JsonSerDesError();
      const discriminator = items[schema.discriminator];
      if (discriminator.type !== "string") throw new JsonSerDesError();
      const type = JSON.parse(discriminator.text);
      if (!(type in schema.items)) throw new JsonSerDesError();
      return desFields(schema.items[type], items);
    }
  }
}

function desFields<T>(
  fields: StructField[],
  items: Record<string, RoughJson>,
): T {
  const result: Record<string, unknown> = {};
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
      return desSchema(type.valueSchema as Schema<T>, json);
    case "Array":
      if (json.type !== "array") throw new JsonSerDesError();
      return json.items.map((item) => desSchema(type.valueSchema, item)) as T;
    case "Dictionary": {
      if (json.type !== "object") throw new JsonSerDesError();
      const result: Record<string, unknown> = {};
      for (const item of json.items) {
        const key = JSON.parse(item.key.text);
        result[key] = desSchema(type.valueSchema, item.value);
      }
      return result as T;
    }
  }
}

function getDefaultValueFromType(type: Type): unknown {
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
      return primitiveDefaultTable[
        schema.primitive as PrimitiveType
      ]() as T;
  }
}

const primitiveSerDesTable = {
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
  integer: {
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
      // Don't use String().
      // Infinity, -Infinity, NaN should be serialized as null
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
      return JSON.stringify(encodeBase64(value));
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "string":
          return decodeBase64(JSON.parse(value.text));
      }
    },
  },
} as const satisfies { [key in PrimitiveType]: JsonSerDes<any> };
