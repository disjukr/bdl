import type * as bon from "../../generated/bon.ts";
import type * as bonCst from "../../generated/bon-cst.ts";
import { slice } from "../../ast/misc.ts";
import parseBonCst from "./cst-parser.ts";

export default function parseBon(text: string): bon.BonValue {
  const cst = parseBonCst(text);
  // cst.value
}

function convertBonValue(text: string, cst: bonCst.BonValue): bon.BonValue {
  switch (cst.type) {
    case "Primitive":
      return convertPrimitive(text, cst);
    case "Array":
    case "Dictionary":
    case "Object":
    case "UnionValue":
  }
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
  throw new Error(`Unknown primitive type: ${type}`);
}

function convertTypeInfo(text: string, cst: bonCst.TypeInfo): string {
  const ids = cst.typePath.filter(
    (part): part is bonCst.Identifier => part.type === "Identifier",
  );
  return ids.map((id) => slice(text, id)).join(".");
}
