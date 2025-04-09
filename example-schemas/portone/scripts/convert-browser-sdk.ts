import { parse as parseYml } from "jsr:@std/yaml";
import * as ir from "@disjukr/bdl/ir";

const browserSdkYml = await Deno.readTextFile(
  new URL("../tmp/browser-sdk.yml", import.meta.url),
);
const browserSdk = parseYml(browserSdkYml) as BrowserSdk;
const result: ir.BdlIr = {
  modules: {
    "portone.browser_sdk": {
      attributes: {},
      defPaths: [],
      imports: [],
    },
  },
  defs: {},
};

for (
  const [entityName, entity] of Object.entries(browserSdk.resources.entity)
) {
  if (entity.type === "object") {
    appendDef({
      attributes: {},
      name: entityName,
      body: objectToStruct(entity),
    });
  }
}

function objectToStruct(objectEntity: ObjectTypeDef): ir.Struct {
  const fields: ir.StructField[] = [];
  for (const [fieldName, field] of Object.entries(objectEntity.properties)) {
    const fieldDef: ir.StructField = {
      name: fieldName,
      attributes: {},
      fieldType: fieldToType(field),
      optional: Boolean(field.optional),
    };
    if (field.description) fieldDef.attributes.description = field.description;
    fields.push(fieldDef);
  }
  return { type: "Struct", fields };
}

function fieldToType(field: FieldDef): ir.Type {
  if (field.type === "array") {
    const valueTypePath = fieldToTypePath((field as ArrayFieldDef).items);
    return { type: "Array", valueTypePath };
  }
  return { type: "Plain", valueTypePath: "unknown" };
}

function fieldToTypePath(field: FieldDef): string {
  if (field.type === "resourceRef") return (field as ResourceRefFieldDef).$ref;
  return `portone.browser_sdk.${field.type.split("/").pop() || field.type}`;
}

function appendDef(def: ir.Def) {
  const defPath = `portone.browser_sdk.${def.name}`;
  result.defs[defPath] = def;
  result.modules["portone.browser_sdk"].defPaths.push(defPath);
}

console.log(result);

interface BrowserSdk {
  resources: {
    entity: Record<string, TypeDef>;
  };
}

type TypeDef =
  | ObjectTypeDef
  | EnumTypeDef
  | OneOfTypeDef
  | UnionTypeDef
  | ResourceRefTypeDef;

interface TypeDefBase {
  type: string;
  description?: string;
}

interface ObjectTypeDef extends TypeDefBase {
  type: "object";
  properties: Record<string, FieldDef>;
}

interface EnumTypeDef extends TypeDefBase {
  type: "enum";
  variants: Record<string, { description: string }>;
  valuePrefix?: string;
}

interface OneOfTypeDef extends TypeDefBase {
  type: "oneOf";
  properties: Record<string, FieldDef>;
}

interface UnionTypeDef extends TypeDefBase {
  type: "union";
  types: TypeDef[];
}

interface ResourceRefTypeDef extends TypeDefBase {
  type: "resourceRef";
  $ref: string;
}

type FieldDef =
  | FieldDefBase
  | ArrayFieldDef
  | UnionFieldDef
  | ResourceRefFieldDef;

interface FieldDefBase {
  type: string;
  description?: string;
  optional?: boolean;
}

interface ArrayFieldDef extends FieldDefBase {
  type: "array";
  items: FieldDef;
}

interface UnionFieldDef extends FieldDefBase {
  type: "union";
  items: FieldDef[];
}

interface ResourceRefFieldDef extends FieldDefBase {
  type: "resourceRef";
  $ref: string;
}
