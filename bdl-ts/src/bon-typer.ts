import type { BonValue } from "./generated/bon.ts";
import type { BdlIr } from "./generated/ir.ts";

export function fillBonTypes(
  ir: BdlIr,
  bon: BonValue,
  rootTypePath?: string,
): BonValue {
  const typePath = rootTypePath ?? bon.typePath;
  if (!typePath) throw new Error("No typePath found in BonValue");
  const typeDef = ir.defs[typePath];
  if (!typeDef) throw new Error(`Type not found: ${typePath}`);
  const result = { ...bon, typePath };
  // TODO
  return result;
}
