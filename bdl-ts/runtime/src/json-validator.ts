import {
  globalDefs,
  type Path,
  type PrimitiveType,
  type Schema,
  type StructField,
  type Type,
} from "./data-schema.ts";
import type { RoughJson, RoughObject } from "./misc/rough-json.ts";

let path: Path = [];
function push(fragment: string | number) {
  path = [...path, fragment];
}
function pop() {
  path = path.slice(0, -1);
}

export type ValidateJsonFn = (value: RoughJson) => ValidateJsonResult;
export type ValidateJsonResult<T extends RoughJson = RoughJson> =
  | { value: T }
  | { issues: { message: string; path?: Path }[] };

export function validate(
  schema: Schema,
  value: RoughJson,
  defs = globalDefs,
): ValidateJsonResult {
  switch (schema.type) {
    case "Primitive":
      return validatePrimitives[schema.primitive](value);
    case "Custom":
      return validateType(schema.originalType, value, defs);
    case "Enum":
      if (value.type !== "string") {
        return { issues: [{ message: "value is not string", path }] };
      }
      if (!schema.items.has(value.value)) {
        return { issues: [{ message: "value is not in enum", path }] };
      }
      return { value };
    case "Oneof":
      for (const item of schema.items) {
        const result = validateType(item, value, defs);
        if ("issues" in result) continue;
        return result;
      }
      return { issues: [{ message: "value does not match any type", path }] };
    case "Struct":
      if (value.type !== "object") {
        return { issues: [{ message: "value is not object", path }] };
      }
      return validateFields(schema.fields, value);
    case "Union": {
      if (value.type !== "object") {
        return { issues: [{ message: "value is not object", path }] };
      }
      const discriminator = value.items.find(
        (item) => item.key.value == schema.discriminator,
      );
      if (!discriminator) {
        return {
          issues: [{ message: "value has no discriminator field", path }],
        };
      }
      if (discriminator.value.type !== "string") {
        return { issues: [{ message: "invalid discriminator", path }] };
      }
      const type = discriminator.value.value;
      if (!(type in schema.items)) {
        return { issues: [{ message: "invalid discriminator", path }] };
      }
      return validateFields(schema.items[type], value);
    }
  }
}

export function validateType(
  type: Type,
  value: RoughJson,
  defs = globalDefs,
): ValidateJsonResult {
  switch (type.type) {
    case "Plain":
      return validate(defs[type.valueId], value);
    case "Array":
      if (value.type !== "array") {
        return { issues: [{ message: "value is not array", path }] };
      }
      for (let i = 0; i < value.items.length; ++i) {
        try {
          push(i);
          const item = value.items[i];
          const result = validate(defs[type.valueId], item);
          if ("issues" in result) return result;
        } finally {
          pop();
        }
      }
      return { value };
    case "Dictionary":
      if (value.type !== "object") {
        return { issues: [{ message: "value is not object", path }] };
      }
      for (const item of value.items) {
        try {
          push(item.key.value);
          const result = validate(defs[type.valueId], item.value);
          if ("issues" in result) return result;
        } finally {
          pop();
        }
      }
      return { value };
  }
}

function validateFields(
  fields: StructField[],
  value: RoughObject,
): ValidateJsonResult<RoughObject> {
  const items: Record<string, RoughJson> = {};
  for (const item of value.items) items[item.key.value] = item.value;
  for (const field of fields) {
    try {
      push(field.name);
      const fieldValue = items[field.name];
      if (fieldValue == null) {
        if (field.optional) continue;
        return { issues: [{ message: "field is required", path }] };
      }
      const result = validateType(field.fieldType, fieldValue);
      if ("issues" in result) return result;
    } finally {
      pop();
    }
  }
  return { value };
}

const validatePrimitives = {
  boolean: (value) => {
    if (value.type === "boolean") return { value };
    return { issues: [{ message: "value is not boolean", path }] };
  },
  int32: (value) => {
    if (value.type === "number") {
      const number = Number(value.text);
      if (
        Number.isInteger(number) &&
        number >= -2147483648 &&
        number <= 2147483647
      ) return { value };
    }
    return { issues: [{ message: "value is not int32", path }] };
  },
  int64: (value) => {
    if (value.type !== "number" && value.type !== "string") {
      return { issues: [{ message: "value is not int64", path }] };
    }
    try {
      const bigint = BigInt(
        value.type === "number" ? value.text : value.value.slice(1, -1),
      );
      if (
        bigint >= -9223372036854775808n &&
        bigint <= 9223372036854775807n
      ) return { value };
    } catch { /* ignore */ }
    return { issues: [{ message: "value is not int64", path }] };
  },
  integer: (value) => {
    if (value.type !== "number" && value.type !== "string") {
      return { issues: [{ message: "value is not integer", path }] };
    }
    try {
      BigInt(value.type === "number" ? value.text : value.value.slice(1, -1));
      return { value };
    } catch { /* ignore */ }
    return { issues: [{ message: "value is not integer", path }] };
  },
  float64: (value) => {
    if (typeof value === "number") return { value };
    return { issues: [{ message: "value is not float64", path }] };
  },
  string: (value) => {
    if (typeof value === "string") return { value };
    return { issues: [{ message: "value is not string", path }] };
  },
  bytes: (value) => {
    if (value instanceof Uint8Array) return { value };
    return { issues: [{ message: "value is not bytes", path }] };
  },
  object: (value) => {
    if (value.type === "object") return { value };
    return { issues: [{ message: "value is not object", path }] };
  },
  void: (value) => {
    if (value.type === "null") return { value };
    return { issues: [{ message: "value is not void", path }] };
  },
} as const satisfies { [key in PrimitiveType]: ValidateJsonFn };
