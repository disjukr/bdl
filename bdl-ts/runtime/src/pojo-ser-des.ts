import {
  defs,
  primitiveDefaultTable,
  type PrimitiveType,
  type Schema,
  type StructField,
  type Type,
} from "./data-schema.ts";
import { decodeBase64, encodeBase64 } from "./misc/base64.ts";
import { validateType } from "./validator.ts";

export interface PojoSerDes<T> {
  ser: (value: T) => unknown;
  des: (value: unknown) => T;
}

export class PojoSerDesError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "PojoSerDesError";
  }
}

export function ser<T>(schema: Schema<T>, data: T): unknown {
  switch (schema.type) {
    case "Primitive":
      return (primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].ser as (value: T) => unknown)(data);
    case "Custom":
      if (schema.customPojoSerDes) return schema.customPojoSerDes.ser(data);
      return serType(schema.originalType, data);
    case "Enum":
      return data;
    case "Oneof": {
      for (const item of schema.items) {
        const result = validateType(item, data);
        if ("issues" in result) continue;
        return serType(item, data);
      }
      throw new PojoSerDesError();
    }
    case "Struct":
      return serObject(schema.fields, data);
    case "Union": {
      const type = (data as Record<string, string>)[schema.discriminator];
      return {
        [schema.discriminator]: type,
        ...serObject(schema.items[type], data),
      };
    }
  }
}

function serObject<T>(fields: StructField[], data: T): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = (data as Record<string, unknown>)[field.name];
      if (value == null) return;
      return [field.name, serType(field.fieldType, value)];
    }).filter(Boolean),
  );
}

function serType<T>(type: Type, data: T): unknown {
  switch (type.type) {
    case "Plain":
      return ser(defs[type.valueId], data);
    case "Array":
      return (data as unknown[]).map((item) => ser(defs[type.valueId], item));
    case "Dictionary": {
      // TODO: non-string key case
      return Object.fromEntries(
        Object.entries(data as Record<string, unknown>).map(
          ([key, value]) => [key, ser(defs[type.valueId], value)],
        ),
      );
    }
  }
}

export function des<T>(schema: Schema<T>, pojo: unknown): T {
  switch (schema.type) {
    case "Primitive":
      return primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].des(pojo) as T;
    case "Custom":
      if (schema.customPojoSerDes) return schema.customPojoSerDes.des(pojo);
      return desType(schema.originalType, pojo);
    case "Enum": {
      if (typeof pojo !== "string") throw new PojoSerDesError();
      if (!schema.items.has(pojo)) throw new PojoSerDesError();
      return pojo as T;
    }
    case "Oneof": {
      for (const item of schema.items) {
        const value = desType(item, pojo);
        const result = validateType(item, value); // TODO: use pojo validator
        if ("issues" in result) continue;
        return value as T;
      }
      throw new PojoSerDesError();
    }
    case "Struct": {
      if (typeof pojo !== "object") throw new PojoSerDesError();
      return desObject(schema.fields, pojo);
    }
    case "Union": {
      if (typeof pojo !== "object") throw new PojoSerDesError();
      if (!(schema.discriminator in pojo)) throw new PojoSerDesError();
      const discriminator = pojo[schema.discriminator];
      if (discriminator.type !== "string") throw new PojoSerDesError();
      const type = discriminator.value;
      if (!(type in schema.items)) throw new PojoSerDesError();
      const result = {
        [schema.discriminator]: type,
        ...desObject(schema.items[type], pojo) as Record<string, unknown>,
      };
      return result as T;
    }
  }
}

function desObject<T>(fields: StructField[], pojo: unknown): T {
  const object = pojo as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name in object) {
      result[field.name] = desType(field.fieldType, object[field.name]);
    } else {
      if (field.optional) continue;
      result[field.name] = getDefaultValueFromType(field.fieldType);
    }
  }
  return result as T;
}

export function desType<T>(type: Type, pojo: unknown): T {
  switch (type.type) {
    case "Plain":
      return des(defs[type.valueId] as Schema<T>, pojo);
    case "Array":
      if (!Array.isArray(pojo)) throw new PojoSerDesError();
      return pojo.map((item) => des(defs[type.valueId], item)) as T;
    case "Dictionary": {
      if (typeof pojo !== "object") throw new PojoSerDesError();
      // TODO: non-string key case
      return Object.fromEntries(
        Object.entries(pojo).map(
          ([key, value]) => [key, des(defs[type.valueId], value)],
        ),
      ) as T;
    }
  }
}

function getDefaultValueFromType(type: Type): unknown {
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
      throw new PojoSerDesError();
    case "Primitive":
      return primitiveDefaultTable[
        schema.primitive as PrimitiveType
      ]() as T;
  }
}

const primitiveSerDesTable = {
  boolean: {
    ser(value: boolean) {
      return String(value);
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "boolean":
          return value;
        case "number":
          return Boolean(value);
      }
    },
  },
  int32: {
    ser(value: number) {
      return String(value | 0);
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "string":
          return Number(value) | 0;
        case "number":
          return Number(value) | 0;
      }
    },
  },
  int64: {
    ser(value: bigint) {
      return String(value);
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "string":
          return BigInt(value);
        case "number":
          return BigInt(value);
      }
    },
  },
  integer: {
    ser(value: bigint) {
      return String(value);
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "string":
          return BigInt(value);
        case "number":
          return BigInt(value);
      }
    },
  },
  float64: {
    ser(value: number) {
      if (isNaN(value)) return "NaN";
      if (value === Infinity) return "Infinity";
      if (value === -Infinity) return "-Infinity";
      return JSON.stringify(value);
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "undefined":
          return NaN;
        case "object":
          if (value == null) return NaN;
          throw new PojoSerDesError();
        case "string":
          return Number(value);
        case "number":
          return value;
      }
    },
  },
  string: {
    ser(value: string) {
      return value;
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "string":
          return value;
      }
    },
  },
  bytes: {
    ser(value: Uint8Array) {
      return encodeBase64(value);
    },
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "string":
          return decodeBase64(value);
      }
    },
  },
} as const satisfies { [key in PrimitiveType]: PojoSerDes<unknown> };
