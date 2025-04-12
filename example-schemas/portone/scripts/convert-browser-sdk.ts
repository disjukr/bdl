import { ensureDir } from "jsr:@std/fs@1";
import { parse as parseYml } from "jsr:@std/yaml";
import * as ir from "@disjukr/bdl/ir";
import { moduleToString } from "@disjukr/bdl/ir-stringifier";

const browserSdkYml = await Deno.readTextFile(
  new URL("../tmp/browser-sdk.yml", import.meta.url),
);
const browserSdk = parseYml(browserSdkYml) as BrowserSdk;
const modulePathPrefix = `portone.v2.browserSdk`;
const result: ir.BdlIr = { modules: {}, defs: {} };

for (const resource of iterResources(browserSdk.resources)) {
  const { name, typePath, typeDef } = resource;
  const def: Omit<ir.Def, "body"> = { attributes: {}, name };
  const description = typeDef.description?.trim();
  if (description) def.attributes.description = description;
  if (typeDef.type === "object") {
    appendDef(typePath, { ...def, body: objectToStruct(typeDef) });
  }
  if (typeDef.type === "enum") {
    appendDef(typePath, { ...def, body: enumToEnum(typeDef) });
  }
}

for (const [modulePath, module] of Object.entries(result.modules)) {
  const refs = new Set<string>();
  const addType = (type: ir.Type) => {
    if (type.type === "Dictionary") refs.add(type.keyTypePath);
    refs.add(type.valueTypePath);
  };
  for (const defPath of module.defPaths) {
    const def = result.defs[defPath];
    switch (def.body.type) {
      case "Custom":
        addType(def.body.originalType);
        break;
      case "Enum":
        break;
      case "Oneof":
        for (const item of def.body.items) addType(item.itemType);
        break;
      case "Proc":
        addType(def.body.inputType);
        addType(def.body.outputType);
        if (def.body.errorType) addType(def.body.errorType);
        break;
      case "Struct":
        for (const field of def.body.fields) addType(field.fieldType);
        break;
      case "Union":
        for (const item of def.body.items) {
          for (const field of item.fields) addType(field.fieldType);
        }
        break;
    }
  }
  const modules: Record<string, string[]> = {};
  for (const ref of refs) {
    if (!ref.includes(".")) continue;
    const fragments = ref.split(".");
    const typeName = fragments.pop()!;
    const modulePath = fragments.join(".");
    (modules[modulePath] ||= []).push(typeName);
  }
  delete modules[modulePath];
  for (const [modulePath, typeNames] of Object.entries(modules)) {
    module.imports.push({
      attributes: {},
      modulePath,
      items: typeNames.map((name) => ({ name })),
    });
  }
}

interface Resource {
  name: string;
  typePath: string;
  typeDef: TypeDef;
}
function* iterResources(
  resources: Resources,
  modulePath: string = modulePathPrefix,
): Generator<Resource> {
  for (const [name, resource] of Object.entries(resources)) {
    if (isUpperCase(name)) {
      const typePath = `${modulePath}.${name}`;
      const typeDef = resource as TypeDef;
      yield { name, typePath, typeDef };
    } else {
      yield* iterResources(resource as Resources, `${modulePath}.${name}`);
    }
  }
}
function isUpperCase(str: string) {
  return str[0].toUpperCase() === str[0];
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
  if (field.type !== "resourceRef") return refToTypePath(field.type);
  return refToTypePath((field as ResourceRefFieldDef).$ref);
}

function refToTypePath(ref: string): string {
  if (!ref.includes("/")) return ref;
  return `${modulePathPrefix}.${
    ref.replace(/^#\/resources\//, "").replaceAll("/", ".")
  }`;
}

function appendDef(defPath: string, def: ir.Def) {
  result.defs[defPath] = def;
  const modulePath = defPath.split(".").slice(0, -1).join(".");
  const module = result.modules[modulePath] ||= {
    attributes: { standard: "portone-browser-sdk" },
    defPaths: [],
    imports: [],
  };
  module.defPaths.push(defPath);
}

async function writeIrToBdlFiles(
  ir: ir.BdlIr,
): Promise<void> {
  for (const modulePath of Object.keys(ir.modules)) {
    const directoryUrl = new URL(
      `../generated/${modulePath.split(".").slice(1, -1).join("/")}`,
      import.meta.url,
    );
    const fileUrl = new URL(
      `../generated/${modulePath.split(".").slice(1).join("/") + ".bdl"}`,
      import.meta.url,
    );
    await ensureDir(directoryUrl);
    await Deno.writeTextFile(fileUrl, moduleToString(ir, modulePath));
  }
}
await writeIrToBdlFiles(result);

interface BrowserSdk {
  resources: Resources;
}

interface Resources {
  [key: string]: TypeDef | Resources;
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
