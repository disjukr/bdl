import {
  globalDefs,
  primitiveDefaultTable,
  type PrimitiveType,
  type Schema,
  type StructField,
  type Type,
} from "./data-schema.ts";
import { decodeBase64, encodeBase64 } from "./misc/base64.ts";
import { parseRoughly, type RoughJson } from "./misc/rough-json.ts";
import { validateType } from "./validator.ts";
import { validateType as validateJsonType } from "./json-validator.ts";

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

export function ser<T>(schema: Schema<T>, data: T, defs = globalDefs): string {
  switch (schema.type) {
    case "Primitive":
      return (primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].ser as (value: T) => string)(data);
    case "Custom":
      if (schema.customJsonSerDes) return schema.customJsonSerDes.ser(data);
      return serType(schema.originalType, data, defs);
    case "Enum":
      return JSON.stringify(data);
    case "Oneof": {
      for (const item of schema.items) {
        try {
          const result = validateType(item, data, defs);
          if ("issues" in result) continue;
          return serType(item, data, defs);
        } catch { /* ignore */ }
      }
      throw new JsonSerDesError();
    }
    case "Struct":
      return `{${serFields(schema.fields, data, defs)}}`;
    case "Union": {
      const type = (data as Record<string, string>)[schema.discriminator];
      return `{${JSON.stringify(schema.discriminator)}:${type},${
        serFields(schema.items[type], data, defs)
      }}`;
    }
  }
}

export function des<T>(schema: Schema<T>, json: string, defs = globalDefs): T {
  return desSchema(schema, parseRoughly(json), defs);
}

export function serFields<T>(
  fields: StructField[],
  data: T,
  defs = globalDefs,
): string {
  return fields.map((field) => {
    const value = (data as Record<string, unknown>)[field.name];
    if (value == null) return "";
    return `${JSON.stringify(field.name)}:${
      serType(field.fieldType, value, defs)
    }`;
  }).filter(Boolean).join(",");
}

export function serType<T>(type: Type, data: T, defs = globalDefs): string {
  switch (type.type) {
    case "Plain":
      return ser(defs[type.valueId], data, defs);
    case "Array":
      return `[${
        (data as unknown[]).map(
          (item) => ser(defs[type.valueId], item, defs),
        ).join(",")
      }]`;
    case "Dictionary": {
      // TODO: non-string key case
      return `{${
        Object.entries(data as Record<string, unknown>).map(([key, value]) =>
          `${JSON.stringify(key)}:${ser(defs[type.valueId], value, defs)}`
        ).join(",")
      }}`;
    }
  }
}

function desSchema<T>(
  schema: Schema<T>,
  json: RoughJson,
  defs = globalDefs,
): T {
  switch (schema.type) {
    case "Primitive":
      return primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].des(json) as T;
    case "Custom":
      if (schema.customJsonSerDes) return schema.customJsonSerDes.des(json);
      return desType(schema.originalType, json, defs);
    case "Enum": {
      if (json.type !== "string") throw new JsonSerDesError();
      if (!schema.items.has(json.value)) throw new JsonSerDesError();
      return json.value as T;
    }
    case "Oneof": {
      for (const item of schema.items) {
        try {
          const result = validateJsonType(item, json, defs);
          if ("issues" in result) continue;
          return desType(item, json, defs) as T;
        } catch { /* ignore */ }
      }
      throw new JsonSerDesError();
    }
    case "Struct": {
      if (json.type !== "object") throw new JsonSerDesError();
      const items: Record<string, RoughJson> = Object.fromEntries(
        json.items.map((item) => [item.key.value, item.value]),
      );
      return desFields(schema.fields, items, defs);
    }
    case "Union": {
      if (json.type !== "object") throw new JsonSerDesError();
      const items: Record<string, RoughJson> = Object.fromEntries(
        json.items.map((item) => [item.key.value, item.value]),
      );
      if (!(schema.discriminator in items)) throw new JsonSerDesError();
      const discriminator = items[schema.discriminator];
      if (discriminator.type !== "string") throw new JsonSerDesError();
      const type = discriminator.value;
      if (!(type in schema.items)) throw new JsonSerDesError();
      const result = desFields<T>(schema.items[type], items, defs);
      (result as unknown)[schema.discriminator] = type;
      return result;
    }
  }
}

function desFields<T>(
  fields: StructField[],
  items: Record<string, RoughJson>,
  defs = globalDefs,
): T {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name in items) {
      result[field.name] = desType(field.fieldType, items[field.name], defs);
    } else {
      if (field.optional) continue;
      result[field.name] = getDefaultValueFromType(field.fieldType, defs);
    }
  }
  return result as T;
}

export function desType<T>(type: Type, json: RoughJson, defs = globalDefs): T {
  switch (type.type) {
    case "Plain":
      return desSchema(defs[type.valueId] as Schema<T>, json, defs);
    case "Array":
      if (json.type !== "array") throw new JsonSerDesError();
      return json.items.map(
        (item) => desSchema(defs[type.valueId], item, defs),
      ) as T;
    case "Dictionary": {
      if (json.type !== "object") throw new JsonSerDesError();
      // TODO: non-string key case
      const result: Record<string, unknown> = {};
      for (const item of json.items) {
        const key = item.key.value;
        result[key] = desSchema(defs[type.valueId], item.value, defs);
      }
      return result as T;
    }
  }
}

function getDefaultValueFromType(type: Type, defs = globalDefs): unknown {
  switch (type.type) {
    case "Plain":
      return getDefaultValueFromSchema(defs[type.valueId]);
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
          return Number(value.value) | 0;
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
          return BigInt(value.value);
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
          return BigInt(value.value);
        case "number":
          return BigInt(value.text);
      }
    },
  },
  float64: {
    ser(value: number) {
      if (isNaN(value)) return '"NaN"';
      if (value === Infinity) return '"Infinity"';
      if (value === -Infinity) return '"-Infinity"';
      return JSON.stringify(value);
    },
    des(value: RoughJson) {
      switch (value.type) {
        default:
          throw new JsonSerDesError();
        case "null":
          return NaN;
        case "string":
          return Number(value.value);
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
          return value.value;
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
          return decodeBase64(value.value);
      }
    },
  },
  object: {
    ser(value: Record<string, unknown>) {
      return JSON.stringify(value);
    },
    des(value: RoughJson) {
      if (value.type !== "object") throw new JsonSerDesError();
      return JSON.parse(value.text) as Record<string, unknown>;
    },
  },
  void: {
    ser(_value: undefined) {
      return "null";
    },
    des(value: RoughJson) {
      if (value.type !== "null") throw new JsonSerDesError();
      return undefined;
    },
  },
} as const satisfies { [key in PrimitiveType]: JsonSerDes<unknown> };
