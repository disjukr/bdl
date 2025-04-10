import { parse as parseYml } from "jsr:@std/yaml";
import * as ir from "@disjukr/bdl/ir";
import { moduleToString } from "@disjukr/bdl/ir-stringifier";

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
  const def: Omit<ir.Def, "body"> = { attributes: {}, name: entityName };
  const description = entity.description?.trim();
  if (description) def.attributes.description = description;
  if (entity.type === "object") {
    appendDef({ ...def, body: objectToStruct(entity) });
  }
  if (entity.type === "enum") {
    appendDef({ ...def, body: enumToEnum(entity) });
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
    if (field.description) {
      fieldDef.attributes.description = field.description.trim();
    }
    fields.push(fieldDef);
  }
  return { type: "Struct", fields };
}

function enumToEnum(enumEntity: EnumTypeDef): ir.Enum {
  const items: ir.EnumItem[] = [];
  for (const [variantName, variant] of Object.entries(enumEntity.variants)) {
    const item: ir.EnumItem = {
      name: variantName,
      attributes: {},
    };
    if (variant.description) {
      item.attributes.description = variant.description.trim();
    }
    items.push(item);
  }
  return { type: "Enum", items };
}

function fieldToType(field: FieldDef): ir.Type {
  if (field.type === "resourceRef") {
    const valueTypePath = fieldToTypePath(field);
    return { type: "Plain", valueTypePath };
  }
  if (field.type === "array") {
    const valueTypePath = fieldToTypePath((field as ArrayFieldDef).items);
    return { type: "Array", valueTypePath };
  }
  return { type: "Plain", valueTypePath: field.type };
}

function fieldToTypePath(field: FieldDef): string {
  if (field.type !== "resourceRef") return typeNameToTypePath(field.type);
  return typeNameToTypePath((field as ResourceRefFieldDef).$ref);
}

function typeNameToTypePath(typeName: string): string {
  if (!typeName.includes("/")) return typeName;
  return `portone.browser_sdk.${typeName.split("/").pop() || typeName}`;
}

function appendDef(def: ir.Def) {
  const defPath = `portone.browser_sdk.${def.name}`;
  result.defs[defPath] = def;
  result.modules["portone.browser_sdk"].defPaths.push(defPath);
}

async function writeIrToBdlFiles(
  ir: ir.BdlIr,
): Promise<void> {
  for (const modulePath of Object.keys(ir.modules)) {
    const filePath = new URL(
      `../generated/${modulePath.split(".").slice(1).join("/") + ".bdl"}`,
      import.meta.url,
    );
    await Deno.writeTextFile(filePath, moduleToString(ir, modulePath));
  }
}
await writeIrToBdlFiles(result);

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
