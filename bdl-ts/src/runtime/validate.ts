import type {
  Path,
  PrimitiveType,
  Schema,
  StructField,
  Type,
  ValidateFn,
  ValidateResult,
} from "./schema.ts";

let path: Path = [];
function push(fragment: string | number) {
  path = [...path, fragment];
}
function pop() {
  path = path.slice(0, -1);
}

export function validate<T>(
  schema: Schema<T>,
  value: unknown,
): ValidateResult<T> {
  switch (schema.type) {
    case "Primitive":
      return validatePrimitives[schema.primitive](value) as ValidateResult<T>;
    case "Scalar":
      return schema["~standard"].validate(value);
    case "Enum":
      if (typeof value !== "string") {
        return { issues: [{ message: "value is not string", path }] };
      }
      if (!schema.items.has(value)) {
        return { issues: [{ message: "value is not in enum", path }] };
      }
      return { value } as ValidateResult<T>;
    case "Oneof":
      for (const item of schema.items) {
        const result = validateType(item, value);
        if ("issues" in result) continue;
        return result as ValidateResult<T>;
      }
      return { issues: [{ message: "value does not match any type", path }] };
    case "Struct":
      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "value is not object", path }] };
      }
      return validateFields(schema.fields, value);
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
      return validateFields(schema.items[type], value);
    }
  }
}

export function validateType<T>(type: Type, value: unknown): ValidateResult<T> {
  switch (type.type) {
    case "Plain":
      return validate(type.valueSchema, value) as ValidateResult<T>;
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

function validateFields<T>(
  fields: StructField[],
  value: unknown,
): ValidateResult<T> {
  for (const field of fields) {
    try {
      push(field.name);
      const fieldValue = (value as Record<string, unknown>)[field.name];
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

const validatePrimitives = {
  boolean: (value): ValidateResult<boolean> => {
    if (typeof value === "boolean") return { value };
    return { issues: [{ message: "value is not boolean", path }] };
  },
  int32: (value): ValidateResult<number> => {
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= -2147483648 &&
      value <= 2147483647
    ) return { value };
    return { issues: [{ message: "value is not int32", path }] };
  },
  int64: (value): ValidateResult<bigint> => {
    if (
      typeof value === "bigint" &&
      value >= -9223372036854775808n &&
      value <= 9223372036854775807n
    ) return { value };
    return { issues: [{ message: "value is not int64", path }] };
  },
  float64: (value): ValidateResult<number> => {
    if (typeof value === "number") return { value };
    return { issues: [{ message: "value is not float64", path }] };
  },
  string: (value): ValidateResult<string> => {
    if (typeof value === "string") return { value };
    return { issues: [{ message: "value is not string", path }] };
  },
  bytes: (value): ValidateResult<Uint8Array> => {
    if (value instanceof Uint8Array) return { value };
    return { issues: [{ message: "value is not bytes", path }] };
  },
} as const satisfies { [key in PrimitiveType]: ValidateFn<unknown> };
