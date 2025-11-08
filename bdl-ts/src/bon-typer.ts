import type { BonValue } from "./generated/bon.ts";
import type * as ir from "./generated/ir.ts";

export function fillBonTypes(
  ir: ir.BdlIr,
  bon: BonValue,
  rootTypePath?: string,
): BonValue {
  const typePath = rootTypePath ?? bon.typePath;
  if (!typePath) throw new Error("No typePath found in BonValue");
  if (typePath.indexOf(".") < 0) {
    throw new Error("Primitive types cannot use type filling");
  }
  const typeDef = ir.defs[typePath];
  if (!typeDef) throw new Error(`Type not found: ${typePath}`);
  const ctx = createFillContext(ir);
  return fill(ctx, typePath, bon);
}

interface FillContext {
  ir: ir.BdlIr;
  getFieldDef(
    irFieldArray: ir.StructField[],
    fieldName: string,
  ): ir.StructField | undefined;
}
function createFillContext(ir: ir.BdlIr): FillContext {
  type Fields = Record<string, ir.StructField>;
  const irFieldsMap = new Map<ir.StructField[], Fields>();
  function getFields(irFieldArray: ir.StructField[]): Fields {
    if (irFieldsMap.has(irFieldArray)) return irFieldsMap.get(irFieldArray)!;
    const fields: Fields = {};
    for (const irField of irFieldArray) fields[irField.name] = irField;
    irFieldsMap.set(irFieldArray, fields);
    return fields;
  }
  return {
    ir,
    getFieldDef(irFieldArray, fieldName) {
      return getFields(irFieldArray)[fieldName];
    },
  };
}

function fill(ctx: FillContext, typePath: string, value: BonValue): BonValue {
  value.typePath = typePath;
  const typeDef = ctx.ir.defs[typePath];
  if (!typeDef) return value;
  if (typeDef.type === "Struct") return fillStruct(ctx, typeDef, value);
  // TODO
  return value;
}

function fillStruct(
  ctx: FillContext,
  def: ir.Struct,
  value: BonValue,
): BonValue {
  if (value.type !== "Object") return value;
  for (const field of value.fields) {
    const fieldDef = ctx.getFieldDef(def.fields, field.name);
    if (!fieldDef) continue;
    fillStructField(ctx, fieldDef, field.value);
  }
  return value;
}

function fillStructField(
  ctx: FillContext,
  fieldDef: ir.StructField,
  value: BonValue,
): BonValue {
  const { fieldType } = fieldDef;
  if (fieldType.type === "Dictionary") {
    return fillDictionaryField(ctx, fieldType, value);
  }
  if (fieldType.type === "Array") {
    return fillArrayField(ctx, fieldType, value);
  }
  return fill(ctx, fieldType.valueTypePath, value);
}

function fillDictionaryField(
  ctx: FillContext,
  fieldType: ir.Dictionary,
  value: BonValue,
): BonValue {
  // Dictionary fields themselves do not have a typePath,
  // but each entry has its own type.
  const newValue = { ...value, typePath: undefined };
  if (newValue.type !== "Dictionary") return newValue;
  for (const entry of newValue.entries) {
    entry.key = fill(ctx, fieldType.keyTypePath, entry.key);
    entry.value = fill(ctx, fieldType.valueTypePath, entry.value);
  }
  return newValue;
}

function fillArrayField(
  ctx: FillContext,
  fieldType: ir.Array,
  value: BonValue,
): BonValue {
  // Array fields themselves do not have a typePath,
  // but each item has its own type.
  const newValue = { ...value, typePath: undefined };
  if (newValue.type !== "Array") return newValue;
  newValue.items = newValue.items.map(
    (item) => fill(ctx, fieldType.valueTypePath, item),
  );
  return newValue;
}
