import type * as bon from "../generated/bon.ts";
import type * as ir from "../generated/ir.ts";

export function toPojo(bonValue: bon.BonValue, ir?: ir.BdlIr): unknown {
  switch (bonValue.type) {
    case "Primitive": {
      const { value } = bonValue;
      switch (value.type) {
        default: {
          const type = (value as any).type;
          throw new Error(`Unknown Primitive type: ${type}`);
        }
        case "Null":
          return null;
        case "Boolean":
          return value.value;
        case "Identifier": {
          const def = ir?.defs[bonValue.typePath!];
          if (def?.type !== "Enum") return value.value;
          const enumItemDef = def.items.find(
            (item) => item.name === value.value,
          );
          return enumItemDef?.attributes.value || value.value;
        }
        case "Integer":
          return Number(value.value);
        case "Float": {
          const floatValue = value.value;
          switch (floatValue.type) {
            default: {
              const type = (floatValue as any).type;
              throw new Error(`Unknown Float type: ${type}`);
            }
            case "NotANumber":
              return NaN;
            case "Infinity":
              return floatValue.sign ? -Infinity : Infinity;
            case "Value": {
              const num = Number(floatValue.significand) *
                10 ** Number(floatValue.exponent);
              return num;
            }
          }
        }
        case "String":
          return value.value;
      }
    }
    case "Array": {
      return bonValue.items.map((item) => toPojo(item, ir));
    }
    case "Dictionary": {
      const obj: Record<string, unknown> = {};
      for (const entry of bonValue.entries) {
        obj[String(toPojo(entry.key, ir))] = toPojo(entry.value, ir);
      }
      return obj;
    }
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const field of bonValue.fields) {
        obj[field.name] = toPojo(field.value, ir);
      }
      return obj;
    }
    case "UnionValue": {
      const obj: Record<string, unknown> = {};
      for (const field of bonValue.fields) {
        obj[field.name] = toPojo(field.value, ir);
      }
      obj.type = bonValue.itemName;
      return obj;
    }
  }
}
