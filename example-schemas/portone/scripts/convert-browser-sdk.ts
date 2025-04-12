import { ensureDir } from "jsr:@std/fs@1";
import { parse as parseYml } from "jsr:@std/yaml";
import * as ir from "@disjukr/bdl/ir";
import { listEveryMissingTypePaths } from "@disjukr/bdl/ir-analyzer";
import { moduleToString } from "@disjukr/bdl/ir-stringifier";

const browserSdkYml = await Deno.readTextFile(
  new URL("../tmp/browser-sdk.yml", import.meta.url),
);
const browserSdk = parseYml(browserSdkYml) as BrowserSdk;
const modulePathPrefix = `portone.v2.browserSdk`;
const result: ir.BdlIr = { modules: {}, defs: {} };

const registeredDefs = new Set<string>();
function registerDef(defPath: string, def: ir.Def) {
  if (registeredDefs.has(defPath)) {
    console.log(`Def conflict detected: ${defPath}`);
    return;
  }
  registeredDefs.add(defPath);
  result.defs[defPath] = def;
  const modulePath = defPath.split(".").slice(0, -1).join(".");
  const module = result.modules[modulePath] ||= {
    attributes: { standard: "portone-browser-sdk" },
    defPaths: [],
    imports: [],
  };
  module.defPaths.push(defPath);
}

for (const resource of iterResources(browserSdk.resources)) {
  resourceToBdlDef(resource);
}

// fill missing imports
for (const modulePath of Object.keys(result.modules)) {
  const module = result.modules[modulePath];
  const referencedModules: Record<string, string[]> = {};
  for (const typePath of listEveryMissingTypePaths(result, modulePath)) {
    const isPrimitiveType = !typePath.includes(".");
    if (isPrimitiveType) continue;
    const fragments = typePath.split(".");
    const typeName = fragments.pop()!;
    const modulePath = fragments.join(".");
    (referencedModules[modulePath] ||= []).push(typeName);
  }
  for (const [modulePath, typeNames] of Object.entries(referencedModules)) {
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
  typeDef: TypeDef | FieldDef;
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

function resourceToBdlDef(resource: Resource): void {
  const { name, typePath, typeDef } = resource;
  const def: Pick<ir.Def, "attributes" | "name"> = { attributes: {}, name };
  const description = typeDef.description?.trim();
  if (description) def.attributes.description = description;
  const body: Omit<ir.Def, "attributes" | "name"> | undefined = (() => {
    switch (typeDef.type) {
      case "object":
        return objectToStruct(typeDef as ObjectTypeDef);
      case "enum":
        return enumToEnum(typeDef as EnumTypeDef);
      case "oneOf":
        return oneOfToOneof(typeDef as OneOfTypeDef);
    }
  })();
  if (body) registerDef(typePath, { ...def, ...body } as ir.Def);
}

function objectToStruct(
  typeDef: ObjectTypeDef,
): Omit<ir.Struct, "attributes" | "name"> {
  const fields: ir.StructField[] = [];
  for (const [fieldName, field] of Object.entries(typeDef.properties)) {
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

function enumToEnum(
  typeDef: EnumTypeDef,
): Omit<ir.Enum, "attributes" | "name"> {
  const items: ir.EnumItem[] = [];
  for (const [variantName, variant] of Object.entries(typeDef.variants)) {
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

function oneOfToOneof(
  typeDef: OneOfTypeDef,
): Omit<ir.Oneof, "attributes" | "name"> {
  const items: ir.OneofItem[] = [];
  for (const [itemName, item] of Object.entries(typeDef.properties)) {
    const oneofItem: ir.OneofItem = {
      attributes: { field: itemName },
      itemType: fieldToType(item),
    };
    if (item.description) {
      oneofItem.attributes.description = item.description.trim();
    }
    items.push(oneofItem);
  }
  return { type: "Oneof", items };
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
