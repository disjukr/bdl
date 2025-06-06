import { dirname, fromFileUrl } from "jsr:@std/path@1";
import { parse as parseYml } from "jsr:@std/yaml";
import * as ir from "@disjukr/bdl/ir";
import { listEveryMissingExternalTypePaths } from "@disjukr/bdl/ir-analyzer";
import { writeIrToBdlFiles } from "@disjukr/bdl/io/ir";
import { resolve } from "jsr:@std/path/resolve";

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
function newTypePath(typePath: string): string {
  let curr = typePath;
  let attempt = 0;
  while (registeredDefs.has(curr)) curr = `${typePath}_${++attempt}`;
  return curr;
}

const resourceToBdlDefTable: Record<string, (resource: Resource) => ir.Def> = {
  object: objectToStruct,
  error: errorToStruct,
  enum: enumToEnum,
  oneOf: oneOfToOneof,
  union: unionToOneof,
  discriminatedUnion: discriminatedUnionToUnion,
  intersection: intersectionToUnion,
};
function isPrimitiveType(type: string): boolean {
  return !(type in resourceToBdlDefTable);
}

for (const resource of iterResources(browserSdk.resources)) {
  registerResource(resource);
}

for (const [methodName, method] of Object.entries(browserSdk.methods)) {
  const name = camelToPascal(methodName);
  const typePath = `${modulePathPrefix}.methods.${name}`;
  const voidType: ir.Type = { type: "Plain", valueTypePath: "void" };
  const def: ir.Proc = {
    type: "Proc",
    attributes: {},
    name,
    inputType: defToType({} as Resource, method.input, ""),
    outputType: method.output
      ? defToType({} as Resource, method.output, "")
      : voidType,
  };
  registerDef(typePath, def);
}

// fill missing imports
for (const modulePath of Object.keys(result.modules)) {
  const module = result.modules[modulePath];
  const referencedModules: Record<string, string[]> = {};
  const missingExternalTypePaths = listEveryMissingExternalTypePaths(
    result,
    modulePath,
  );
  for (const typePath of missingExternalTypePaths) {
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
      yield { typePath, typeDef };
    } else {
      yield* iterResources(resource as Resources, `${modulePath}.${name}`);
    }
  }
}
function isUpperCase(str: string) {
  return str[0].toUpperCase() === str[0];
}

interface DefBase {
  attributes: Record<string, string>;
  name: string;
}

function resourceToBdlDefBase(resource: Resource): DefBase {
  const { typePath, typeDef } = resource;
  const name = typePath.split(".").pop()!;
  const def: Pick<ir.Def, "attributes" | "name"> = { attributes: {}, name };
  const description = typeDef.description?.trim();
  if (description) def.attributes.description = description;
  return def;
}

function registerResource(resource: Resource): void {
  const type = resource.typeDef.type;
  const def = resourceToBdlDefTable[type]?.(resource);
  if (def) {
    registerDef(resource.typePath, def);
  } else if (["boolean", "integer", "string", "resourceRef"].includes(type)) {
    registerDef(resource.typePath, primitiveToCustom(resource));
  } else {
    /*
    // print verbose
    console.log("Unknown resource type:", resource.typeDef);
    /*/
    // print simple
    console.log("Unknown resource type:", type);
    //*/
  }
}

function primitiveToCustom(resource: Resource): ir.Custom {
  const originalType = defToType(resource, resource.typeDef, "?");
  return { ...resourceToBdlDefBase(resource), type: "Custom", originalType };
}

function objectToStruct(resource: Resource): ir.Struct {
  const typeDef = resource.typeDef as ObjectTypeDef;
  const fields: ir.StructField[] = [];
  for (const [fieldName, field] of Object.entries(typeDef.properties)) {
    const fieldNameHasHyphen = fieldName.includes("-");
    const name = fieldNameHasHyphen ? fieldName.replace(/-/g, "_") : fieldName;
    const fieldDef: ir.StructField = {
      name,
      attributes: {},
      fieldType: defToType(resource, field, camelToPascal(name)),
      optional: Boolean(field.optional),
    };
    if (field.description) {
      fieldDef.attributes.description = field.description.trim();
    }
    if (fieldDef.fieldType.valueTypePath === "stringLiteral") {
      fieldDef.fieldType.valueTypePath = "string";
      fieldDef.attributes.literal = (field as any).value;
    }
    if (fieldNameHasHyphen) fieldDef.attributes.key = fieldName;
    fields.push(fieldDef);
  }
  return { ...resourceToBdlDefBase(resource), type: "Struct", fields };
}

function errorToStruct(resource: Resource): ir.Struct {
  const typeDef = resource.typeDef as ErrorTypeDef;
  const fields: ir.StructField[] = [];
  for (const [fieldName, field] of Object.entries(typeDef.properties)) {
    const fieldNameHasHyphen = fieldName.includes("-");
    const name = fieldNameHasHyphen ? fieldName.replace(/-/g, "_") : fieldName;
    const fieldDef: ir.StructField = {
      name,
      attributes: {},
      fieldType: defToType(resource, field, camelToPascal(name)),
      optional: Boolean(field.optional),
    };
    if (field.description) {
      fieldDef.attributes.description = field.description.trim();
    }
    if (fieldNameHasHyphen) fieldDef.attributes.key = fieldName;
    fields.push(fieldDef);
  }
  const def: ir.Def = {
    ...resourceToBdlDefBase(resource),
    type: "Struct",
    fields,
  };
  if (typeDef.transactionType) {
    def.attributes.transactionType = typeDef.transactionType;
  }
  return def;
}

function enumToEnum(resource: Resource): ir.Enum {
  const typeDef = resource.typeDef as EnumTypeDef;
  const items: ir.EnumItem[] = [];
  const knownEnumName: Record<string, string> = {
    카드: "CARD",
    계좌: "BANK_ACCOUNT",
  };
  for (const [variantName, variant] of Object.entries(typeDef.variants)) {
    const isKnown = variantName in knownEnumName;
    const isNumberStart = /^\d/.test(variantName);
    const item: ir.EnumItem = {
      name: isKnown
        ? knownEnumName[variantName]
        : isNumberStart
        ? "_" + variantName
        : variantName,
      attributes: {},
    };
    if (variant.description) {
      item.attributes.description = variant.description.trim();
    }
    if (isKnown || isNumberStart) item.attributes.value = variantName;
    items.push(item);
  }
  return { ...resourceToBdlDefBase(resource), type: "Enum", items };
}

function oneOfToOneof(resource: Resource): ir.Oneof {
  const typeDef = resource.typeDef as OneOfTypeDef;
  const items: ir.OneofItem[] = [];
  for (const [itemName, item] of Object.entries(typeDef.properties)) {
    const oneofItem: ir.OneofItem = {
      attributes: { key: itemName },
      itemType: defToType(resource, item, camelToPascal(itemName)),
    };
    if (item.description) {
      oneofItem.attributes.description = item.description.trim();
    }
    items.push(oneofItem);
  }
  return { ...resourceToBdlDefBase(resource), type: "Oneof", items };
}

function unionToOneof(resource: Resource): ir.Oneof {
  const typeDef = resource.typeDef as UnionTypeDef;
  const items: ir.OneofItem[] = [];
  const name = resource.typePath.split(".").pop()!;
  let i = 0;
  for (const item of typeDef.types) {
    const oneofItem: ir.OneofItem = {
      attributes: {},
      itemType: defToType(resource, item, `${name}Item${++i}`),
    };
    if (item.description) {
      oneofItem.attributes.description = item.description.trim();
    }
    items.push(oneofItem);
  }
  return { ...resourceToBdlDefBase(resource), type: "Oneof", items };
}

function discriminatedUnionToUnion(resource: Resource): ir.Union {
  const typeDef = resource.typeDef as DiscriminatedUnionTypeDef;
  const items: ir.UnionItem[] = [];
  for (const [name, type] of Object.entries(typeDef.types)) {
    const unionItem: ir.UnionItem = { attributes: {}, name, fields: [] };
    const objectTypeDef = type as ObjectTypeDef;
    const properties = objectTypeDef.properties || {};
    for (const [fieldName, field] of Object.entries(properties)) {
      const fieldNameHasHyphen = fieldName.includes("-");
      const name = fieldNameHasHyphen
        ? fieldName.replace(/-/g, "_")
        : fieldName;
      const fieldDef: ir.StructField = {
        name,
        attributes: {},
        fieldType: defToType(resource, field, camelToPascal(name)),
        optional: Boolean(field.optional),
      };
      if (field.description) {
        fieldDef.attributes.description = field.description.trim();
      }
      if (fieldNameHasHyphen) fieldDef.attributes.key = fieldName;
      unionItem.fields.push(fieldDef);
    }
    if (type.description) {
      unionItem.attributes.description = type.description.trim();
    }
    items.push(unionItem);
  }
  const def: ir.Def = {
    ...resourceToBdlDefBase(resource),
    type: "Union",
    items,
  };
  def.attributes.discriminator = typeDef.discriminator;
  return def;
}

function intersectionToUnion(resource: Resource): ir.Union {
  const typeDef = resource.typeDef as IntersectionTypeDef;
  if (typeDef.types.length !== 2) {
    throw new Error("Intersection must have 2 types");
  }
  if (typeDef.types[0].type !== "object") {
    throw new Error("First type of intersection must be object");
  }
  if (typeDef.types[1].type !== "discriminatedUnion") {
    throw new Error("Second type of intersection must be discriminatedUnion");
  }
  const name = resource.typePath.split(".").pop()!;
  defToType(resource, typeDef.types[0], `${name}Base`);
  const union = discriminatedUnionToUnion({
    ...resource,
    typeDef: typeDef.types[1],
  });
  union.attributes.extends = `${resource.typePath}Base`;
  return union;
}

function defToType(
  resource: Resource,
  def: TypeDef | FieldDef,
  newTypeName: string,
): ir.Type {
  if (def.type === "resourceRef") {
    const valueTypePath = refToTypePath((def as ResourceRefFieldDef).$ref);
    return { type: "Plain", valueTypePath };
  }
  if (def.type === "array") {
    const type = defToType(resource, (def as ArrayFieldDef).items, newTypeName);
    return { type: "Array", valueTypePath: type.valueTypePath };
  }
  if (isPrimitiveType(def.type)) {
    return { type: "Plain", valueTypePath: def.type };
  }
  const resourceModulePath = typePathToModulePath(resource.typePath);
  const typePath = newTypePath(`${resourceModulePath}.${newTypeName}`);
  registerResource({ typePath, typeDef: def });
  return { type: "Plain", valueTypePath: typePath };
}

function refToTypePath(ref: string): string {
  if (!ref.includes("/")) return ref;
  return `${modulePathPrefix}.${
    ref.replace(/^#\/resources\//, "").replaceAll("/", ".")
  }`;
}

function typePathToModulePath(typePath: string): string {
  const fragments = typePath.split(".");
  const modulePath = fragments.slice(0, -1).join(".");
  return modulePath;
}

function camelToPascal(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const __dirname = dirname(fromFileUrl(import.meta.url));
await writeIrToBdlFiles({
  ir: result,
  outputDirectory: resolve(__dirname, "../generated"),
  stripComponents: 1,
});

interface BrowserSdk {
  resources: Resources;
  methods: Methods;
}

interface Resources {
  [key: string]: TypeDef | Resources;
}

interface Methods {
  [key: string]: Method;
}

interface Method {
  input: ResourceRefFieldDef;
  output?: ResourceRefFieldDef;
  callbacks?: {
    [key: string]: ResourceRefFieldDef;
  };
}

type TypeDef =
  | ObjectTypeDef
  | ErrorTypeDef
  | EnumTypeDef
  | OneOfTypeDef
  | UnionTypeDef
  | DiscriminatedUnionTypeDef
  | IntersectionTypeDef
  | ResourceRefTypeDef;

interface TypeDefBase {
  type: string;
  description?: string;
}

interface ObjectTypeDef extends TypeDefBase {
  type: "object";
  properties: Record<string, FieldDef>;
}

interface ErrorTypeDef extends TypeDefBase {
  type: "error";
  transactionType?: string;
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

interface DiscriminatedUnionTypeDef extends TypeDefBase {
  type: "discriminatedUnion";
  discriminator: string;
  types: TypeDef[];
}

interface IntersectionTypeDef extends TypeDefBase {
  type: "intersection";
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
