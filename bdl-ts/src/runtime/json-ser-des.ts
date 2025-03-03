import { decodeBase64, encodeBase64 } from "./base64.ts";
import { parseRoughly, type RoughJson } from "./rough-json.ts";
import type {
  Path,
  Schema,
  StructField,
  Type,
  ValidateFn,
  ValidateResult,
} from "./schema.ts";

export interface JsonSerDes<T> {
  default?: () => T;
  validate?: ValidateFn<T>;
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
      return (primitiveJsonSerDesTable[
        schema.primitive as keyof typeof primitiveJsonSerDesTable
      ].ser as any)(data);
    case "Scalar":
      if (schema.customJsonSerDes) return schema.customJsonSerDes.ser(data);
      return serType(schema.scalarType, data);
    case "Enum":
      return JSON.stringify(data);
    case "Oneof":
      return ""; // TODO: validate
    case "Struct":
      return `{${serFields(schema.fields, data)}}`;
    case "Union": {
      const type = (data as any).type;
      return `{"type":${type},${serFields(schema.items[type], data)}}`;
    }
  }
}

export function des<T>(schema: Schema<T>, json: string): T {
  return desSchema(schema, parseRoughly(json));
}

export function validate<T>(
  schema: Schema<T>,
  value: unknown,
): ValidateResult<T> {
  switch (schema.type) {
    case "Primitive":
      return (primitiveJsonSerDesTable[
        schema.primitive as keyof typeof primitiveJsonSerDesTable
      ].validate as ValidateFn<T>)(value);
    case "Scalar":
      if (schema.customJsonSerDes?.validate) {
        return schema.customJsonSerDes.validate(value);
      }
      return validateType(schema.scalarType, value);
    case "Enum":
      if (typeof value !== "string") {
        return { issues: [{ message: "value is not string", path }] };
      }
      if (!schema.items.has(value)) {
        return { issues: [{ message: "value is not in enum", path }] };
      }
      return { value } as ValidateResult<T>;
    case "Oneof":
      throw new Error("Not implemented");
    case "Struct":
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "value is not object", path }] };
      }
      return validateFields(schema.fields, value as T);
    case "Union": {
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "value is not object", path }] };
      }
      if (!("type" in value)) {
        return { issues: [{ message: "value has no type field", path }] };
      }
      const type = value.type as string;
      if (!(type in schema.items)) {
        return { issues: [{ message: "value has invalid type", path }] };
      }
      return validateFields(schema.items[type], value as T);
    }
  }
}

function validateFields<T>(fields: StructField[], value: T): ValidateResult<T> {
  for (const field of fields) {
    try {
      push(field.name);
      const fieldValue = (value as any)[field.name];
      if (fieldValue == null) {
        if (field.optional) continue;
        return { issues: [{ message: "field is required", path }] };
      }
      const result = validateType(field.itemType, fieldValue);
      if ("issues" in result) return result;
    } finally {
      pop();
    }
  }
  return { value } as ValidateResult<T>;
}

function validateType<T>(type: Type, value: unknown): ValidateResult<T> {
  switch (type.type) {
    case "Plain":
      return validate(type.valueSchema, value);
    case "Array":
      if (!Array.isArray(value)) {
        return { issues: [{ message: "value is not array", path }] };
      }
      for (const [index, item] of value.entries()) {
        try {
          push(index);
          const result = validate(type.valueSchema, item);
          if ("issues" in result) return result;
        } finally {
          pop();
        }
      }
      return { value } as ValidateResult<T>;
    case "Dictionary":
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "value is not object", path }] };
      }
      for (const [key, item] of Object.entries(value)) {
        try {
          push(key);
          const result = validate(type.valueSchema, item);
          if ("issues" in result) return result;
        } finally {
          pop();
        }
      }
      return { value } as ValidateResult<T>;
  }
}

let path: Path = [];
function push(fragment: string | number) {
  path = [...path, fragment];
}
function pop() {
  path = path.slice(0, -1);
}

function serFields<T>(fields: StructField[], data: T): string {
  return fields.map((field) => {
    const value = (data as any)[field.name];
    if (value == null) return "";
    return `${JSON.stringify(field.name)}:${serType(field.itemType, value)}`;
  }).filter(Boolean).join(",");
}

function serType<T>(type: Type, data: T): string {
  switch (type.type) {
    case "Plain":
      return ser(type.valueSchema, data);
    case "Array":
      return `[${
        (data as any[]).map(
          (item) => ser(type.valueSchema, item),
        ).join(",")
      }]`;
    case "Dictionary": {
      return `{${
        Object.entries(data as any).map(([key, value]) =>
          `${JSON.stringify(key)}:${ser(type.valueSchema, value)}`
        ).join(",")
      }}`;
    }
  }
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
    case "Scalar": {
      const getDefaultValue = schema.customJsonSerDes?.default;
      if (getDefaultValue) return getDefaultValue();
      return getDefaultValueFromType(schema.scalarType);
    }
  }
}

export const primitiveJsonSerDesTable = {
  boolean: {
    default: () => false,
    validate: (value) => {
      if (typeof value === "boolean") return { value };
      return { issues: [{ message: "value is not boolean", path }] };
    },
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
    validate: (value) => {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= -2147483648 &&
        value <= 2147483647
      ) return { value };
      return { issues: [{ message: "value is not int32", path }] };
    },
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
    validate: (value) => {
      if (
        typeof value === "bigint" &&
        value >= -9223372036854775808n &&
        value <= 9223372036854775807n
      ) return { value };
      return { issues: [{ message: "value is not int64", path }] };
    },
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
    validate: (value) => {
      if (typeof value === "number") return { value };
      return { issues: [{ message: "value is not float64", path }] };
    },
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
    validate: (value) => {
      if (typeof value === "string") return { value };
      return { issues: [{ message: "value is not string", path }] };
    },
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
    validate: (value) => {
      if (value instanceof Uint8Array) return { value };
      return { issues: [{ message: "value is not bytes", path }] };
    },
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
