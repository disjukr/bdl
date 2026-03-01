import {
  globalDefs,
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

export function ser<T>(schema: Schema<T>, data: T, defs = globalDefs): unknown {
  switch (schema.type) {
    case "Primitive":
      return (primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].ser as (value: T) => unknown)(data);
    case "Custom":
      if (schema.customPojoSerDes) return schema.customPojoSerDes.ser(data);
      return serType(schema.originalType, data, defs);
    case "Enum":
      return data;
    case "Oneof": {
      for (const item of schema.items) {
        try {
          const result = validateType(item, data, defs);
          if ("issues" in result) continue;
          return serType(item, data, defs);
        } catch { /* ignore */ }
      }
      throw new PojoSerDesError();
    }
    case "Struct":
      return serObject(schema.fields, data, defs);
    case "Union": {
      const type = (data as Record<string, string>)[schema.discriminator];
      return {
        [schema.discriminator]: type,
        ...serObject(schema.items[type], data, defs),
      };
    }
  }
}

function serObject<T>(
  fields: StructField[],
  data: T,
  defs = globalDefs,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = (data as Record<string, unknown>)[field.name];
      if (value == null) return;
      return [field.name, serType(field.fieldType, value, defs)];
    }).filter(Boolean),
  );
}

function serType<T>(type: Type, data: T, defs = globalDefs): unknown {
  switch (type.type) {
    case "Plain":
      return ser(defs[type.valueId], data, defs);
    case "Array":
      return (data as unknown[]).map((item) =>
        ser(defs[type.valueId], item, defs)
      );
    case "Dictionary": {
      // TODO: non-string key case
      return Object.fromEntries(
        Object.entries(data as Record<string, unknown>).map(
          ([key, value]) => [key, ser(defs[type.valueId], value, defs)],
        ),
      );
    }
  }
}

export function des<T>(schema: Schema<T>, pojo: unknown, defs = globalDefs): T {
  switch (schema.type) {
    case "Primitive":
      return primitiveSerDesTable[
        schema.primitive as PrimitiveType
      ].des(pojo) as T;
    case "Custom":
      if (schema.customPojoSerDes) return schema.customPojoSerDes.des(pojo);
      return desType(schema.originalType, pojo, defs);
    case "Enum": {
      if (typeof pojo !== "string") throw new PojoSerDesError();
      if (!schema.items.has(pojo)) throw new PojoSerDesError();
      return pojo as T;
    }
    case "Oneof": {
      for (const item of schema.items) {
        try {
          const value = desType(item, pojo, defs);
          const result = validateType(item, value, defs); // TODO: use pojo validator
          if ("issues" in result) continue;
          return value as T;
        } catch { /* ignore */ }
      }
      throw new PojoSerDesError();
    }
    case "Struct": {
      if (typeof pojo !== "object" || pojo == null) throw new PojoSerDesError();
      return desObject(schema.fields, pojo, defs);
    }
    case "Union": {
      if (typeof pojo !== "object" || pojo == null) throw new PojoSerDesError();
      if (!(schema.discriminator in pojo)) throw new PojoSerDesError();
      const discriminator = pojo[schema.discriminator];
      if (typeof discriminator !== "string") throw new PojoSerDesError();
      if (!(discriminator in schema.items)) throw new PojoSerDesError();
      const result = {
        [schema.discriminator]: discriminator,
        ...desObject(schema.items[discriminator], pojo, defs) as Record<
          string,
          unknown
        >,
      };
      return result as T;
    }
  }
}

function desObject<T>(
  fields: StructField[],
  pojo: unknown,
  defs = globalDefs,
): T {
  const object = pojo as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name in object) {
      result[field.name] = desType(field.fieldType, object[field.name], defs);
    } else {
      if (field.optional) continue;
      result[field.name] = getDefaultValueFromType(field.fieldType, defs);
    }
  }
  return result as T;
}

export function desType<T>(type: Type, pojo: unknown, defs = globalDefs): T {
  switch (type.type) {
    case "Plain":
      return des(defs[type.valueId] as Schema<T>, pojo, defs);
    case "Array":
      if (!Array.isArray(pojo)) throw new PojoSerDesError();
      return pojo.map((item) => des(defs[type.valueId], item, defs)) as T;
    case "Dictionary": {
      if (typeof pojo !== "object" || pojo == null) throw new PojoSerDesError();
      // TODO: non-string key case
      return Object.fromEntries(
        Object.entries(pojo).map(
          ([key, value]) => [key, des(defs[type.valueId], value, defs)],
        ),
      ) as T;
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
      throw new PojoSerDesError();
    case "Primitive":
      return primitiveDefaultTable[
        schema.primitive as PrimitiveType
      ]() as T;
  }
}

const primitiveSerDesTable = {
  boolean: {
    ser: Boolean,
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
    ser: Number,
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
    ser: Number,
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
    ser: Number,
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
      return Number(value);
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
    ser: String,
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
    ser: encodeBase64,
    des(value: unknown) {
      switch (typeof value) {
        default:
          throw new PojoSerDesError();
        case "string":
          return decodeBase64(value);
      }
    },
  },
  object: {
    ser(value: Record<string, unknown>) {
      return value;
    },
    des(value: unknown) {
      if (typeof value !== "object" || value == null || Array.isArray(value)) {
        throw new PojoSerDesError();
      }
      return value as Record<string, unknown>;
    },
  },
  void: {
    ser() {
      return null;
    },
    des() {
      return undefined;
    },
  },
} as const satisfies { [key in PrimitiveType]: PojoSerDes<unknown> };
