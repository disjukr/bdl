import type * as bon from "../../generated/bon.ts";
import type * as bonCst from "../../generated/bon-cst.ts";
import { slice } from "../../ast/misc.ts";
import parseBonCst from "./cst-parser.ts";

export default function parseBon(text: string): bon.BonValue {
  const cst = parseBonCst(text);
  return convertBonValue(text, cst.value);
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
