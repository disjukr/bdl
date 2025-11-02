import type * as bon from "../../generated/bon.ts";
import type * as bonCst from "../../generated/bon-cst.ts";
import { slice } from "../../ast/misc.ts";
import parseBonCst from "./cst-parser.ts";

export default function parseBon(text: string): bon.BonValue {
  const cst = parseBonCst(text);
  return convertBonValue(text, cst.value);
}

export function toLossyPojo(bonValue: bon.BonValue): unknown {
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
        case "Identifier":
          return value.value;
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
      return bonValue.items.map((item) => toLossyPojo(item));
    }
    case "Dictionary": {
      const obj: Record<string, unknown> = {};
      for (const entry of bonValue.entries) {
        obj[String(toLossyPojo(entry.key))] = toLossyPojo(entry.value);
      }
      return obj;
    }
    case "Object": {
      const obj: Record<string, unknown> = {};
      for (const field of bonValue.fields) {
        obj[field.name] = toLossyPojo(field.value);
      }
      return obj;
    }
    case "UnionValue": {
      const obj: Record<string, unknown> = {};
      for (const field of bonValue.fields) {
        obj[field.name] = toLossyPojo(field.value);
      }
      obj.type = bonValue.itemName;
      return obj;
    }
  }
}

function convertBonValue(text: string, cst: bonCst.BonValue): bon.BonValue {
  const { type } = cst;
  switch (type) {
    case "Primitive":
      return convertPrimitive(text, cst);
    case "Array":
      return convertArray(text, cst);
    case "Dictionary":
      return convertDictionary(text, cst);
    case "Object":
      return convertObject(text, cst);
    case "UnionValue":
      return convertUnionValue(text, cst);
  }
  throw new Error(`Unknown BonValue type: ${type}`);
}

function convertPrimitive(text: string, cst: bonCst.Primitive): bon.Primitive {
  const typePath = cst.typeInfo && convertTypeInfo(text, cst.typeInfo);
  const primitive = { type: "Primitive", typePath } as bon.Primitive;
  const { type } = cst.value;
  if (type === "Null") return { ...primitive, value: { type: "Null" } };
  else if (type === "Boolean") {
    const value = slice(text, cst.value) === "true";
    return { ...primitive, value: { type: "Boolean", value } };
  } else if (type === "Identifier") {
    const value = slice(text, cst.value);
    return { ...primitive, value: { type: "Identifier", value } };
  } else if (type === "Integer") {
    const sign = (cst.value.sign && slice(text, cst.value.sign)) || "";
    const value = BigInt(sign + slice(text, cst.value.value));
    return { ...primitive, value: { type: "Integer", value } };
  } else if (type === "Float") {
    const floatCst = cst.value.value;
    const { type } = floatCst;
    if (type === "NotANumber") {
      return { ...primitive, value: { type: "Float", value: { type } } };
    }
    const signText = (floatCst.sign && slice(text, floatCst.sign)) || "";
    const sign = signText === "-";
    if (type === "Infinity") {
      return { ...primitive, value: { type: "Float", value: { type, sign } } };
    }
    const fraction = floatCst.fraction
      ? slice(text, floatCst.fraction.value)
      : "";
    const significand = BigInt(
      signText + slice(text, floatCst.significand) + fraction,
    );
    const fractionLength = fraction.length;
    const exponentSign = (floatCst.exponent?.sign &&
      slice(text, floatCst.exponent.sign)) || "";
    const exponent = (floatCst.exponent
      ? BigInt(exponentSign + slice(text, floatCst.exponent.value))
      : 0n) - BigInt(fractionLength);
    return {
      ...primitive,
      value: { type: "Float", value: { type: "Value", significand, exponent } },
    };
  } else if (type === "String") {
    const value = JSON.parse(slice(text, cst.value));
    return { ...primitive, value: { type: "String", value } };
  } else if (type === "VerbatimString") {
    const raw = slice(text, cst.value);
    const firstNewlineIndex = raw.indexOf("\n");
    if (firstNewlineIndex === -1) {
      const value = raw.replace(/^\$\x20?/, "");
      return { ...primitive, value: { type: "String", value } };
    }
    const firstLine = raw.slice(0, firstNewlineIndex)
      .replace(/^\$\x20?/, "");
    const restLines = raw.slice(firstNewlineIndex + 1).replace(/\n$/, "")
      .split("\n").map((line) => line.trimStart())
      .filter(Boolean).map((line) => line.replace(/^\|\x20?/, ""));
    restLines.unshift(firstLine);
    const value = restLines.join("\n");
    return { ...primitive, value: { type: "String", value } };
  }
  throw new Error(`Unknown Primitive type: ${type}`);
}

function convertArray(text: string, cst: bonCst.Array): bon.Array {
  const typePath = cst.typeInfo && convertTypeInfo(text, cst.typeInfo);
  const items = cst.items.map((item) => convertBonValue(text, item.value));
  return { type: "Array", typePath, items };
}

function convertDictionary(
  text: string,
  cst: bonCst.Dictionary,
): bon.Dictionary {
  const typePath = cst.typeInfo && convertTypeInfo(text, cst.typeInfo);
  const entries = cst.entries.map((entry) => ({
    key: convertBonValue(text, entry.key),
    value: convertBonValue(text, entry.value),
  }));
  return { type: "Dictionary", typePath, entries };
}

function convertObject(text: string, cst: bonCst.Object): bon.Object {
  const typePath = cst.typeInfo && convertTypeInfo(text, cst.typeInfo);
  const fields = cst.fields.map((field) => ({
    name: slice(text, field.name),
    value: convertBonValue(text, field.value),
  }));
  return { type: "Object", typePath, fields };
}

function convertUnionValue(
  text: string,
  cst: bonCst.UnionValue,
): bon.UnionValue {
  const typePath = cst.typeInfo && convertTypeInfo(text, cst.typeInfo);
  const itemName = slice(text, cst.itemName);
  const fields = cst.fields.map((field) => ({
    name: slice(text, field.name),
    value: convertBonValue(text, field.value),
  }));
  return { type: "UnionValue", typePath, itemName, fields };
}

function convertTypeInfo(text: string, cst: bonCst.TypeInfo): string {
  const ids = cst.typePath.filter(
    (part): part is bonCst.Identifier => part.type === "Identifier",
  );
  return ids.map((id) => slice(text, id)).join(".");
}
