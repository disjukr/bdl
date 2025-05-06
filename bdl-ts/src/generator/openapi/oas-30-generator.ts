import { parse as parseYml } from "jsr:@std/yaml@1";
import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export type OasSchema = oas.Oas3Definition;
type OasPaths = oas.Oas3Paths<oas.Oas3Schema>;
type OasPathItem = oas.Oas3PathItem<oas.Oas3Schema>;
type OasOperation = oas.Oas3Operation<oas.Oas3Schema>;
type OasMediaType = oas.Oas3MediaType<oas.Oas3Schema>;
interface OasComponentSchemas {
  [name: string]: oas.Referenced<oas.Oas3Schema>;
}

export interface GenerateOasConfig {
  ir: ir.BdlIr;
  base?: Partial<OasSchema>;
}
export interface GenerateOasResult {
  schema: OasSchema;
}

export class GenerateOasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateOasError";
  }
}

export function generateOas(config: GenerateOasConfig): GenerateOasResult {
  const { ir, base } = config;
  const schema: OasSchema = {
    // As of May 2025, since CF API Shield does not yet support OAS 3.1, use 3.0 instead.
    // https://developers.cloudflare.com/api-shield/security/schema-validation/#limitations
    openapi: "3.0.3",
    info: { title: "BDL API", version: "0.1.0" },
    ...structuredClone(base),
  };
  const paths = schema.paths ||= {};
  schema.components ||= {};
  const schemas = schema.components.schemas ||= {};
  const result: GenerateOasResult = { schema };
  const state: GenContextState = {
    bdlTypePathToOasOperationIdTable: {},
    bdlTypePathToOasComponentSchemaNameTable: {},
  };
  bakeOperationIds(ir, state);
  bakeComponentSchemaNames(ir, state);
  for (const [modulePath, module] of Object.entries(ir.modules)) {
    for (const defPath of module.defPaths) {
      const def = ir.defs[defPath];
      const ctx: GenContext = {
        input: { config, module, modulePath, def, defPath },
        output: { paths, schemas },
        state,
      };
      switch (def.type) {
        case "Custom":
          genCustom(ctx);
          break;
        case "Enum":
          genEnum(ctx);
          break;
        case "Oneof":
          genOneof(ctx);
          break;
        case "Proc":
          genProc(ctx);
          break;
        case "Struct":
          genStruct(ctx);
          break;
        case "Union":
          genUnion(ctx);
          break;
      }
    }
  }
  return result;
}

interface GenContext {
  input: GenContextInput;
  output: GenContextOutput;
  state: GenContextState;
}

interface GenContextInput {
  config: GenerateOasConfig;
  module: ir.Module;
  modulePath: string;
  def: ir.Def;
  defPath: string;
}

interface GenContextOutput {
  paths: OasPaths;
  schemas: OasComponentSchemas;
}

interface GenContextState {
  bdlTypePathToOasOperationIdTable: Record<string, string>;
  bdlTypePathToOasComponentSchemaNameTable: Record<string, string>;
}

function genCustom(ctx: GenContext) {
  const { input: { def, defPath }, output: { schemas } } = ctx;
  const custom = def as ir.Custom;
  const name = getComponentSchemaName(ctx, defPath);
  const oasSchema: oas.Oas3Schema = schemas[name] = convertType(
    ctx,
    custom.originalType,
  );
  if (custom.attributes.title) oasSchema.title = custom.attributes.title;
  if (custom.attributes.description) {
    oasSchema.description = custom.attributes.description;
  }
}

function genEnum(ctx: GenContext) {
  const { input: { def, defPath }, output: { schemas } } = ctx;
  const enumDef = def as ir.Enum;
  const name = getComponentSchemaName(ctx, defPath);
  const oasSchema: oas.Oas3Schema = schemas[name] = {};
  if (enumDef.attributes.title) oasSchema.title = enumDef.attributes.title;
  if (enumDef.attributes.description) {
    oasSchema.description = enumDef.attributes.description;
  }
  oasSchema.type = "string";
  oasSchema.enum = enumDef.items.map((item) => {
    if (item.attributes.value) return item.attributes.value;
    return item.name;
  });
}

function genOneof(ctx: GenContext) {
  const { input: { def, defPath }, output: { schemas } } = ctx;
  const oneof = def as ir.Oneof;
  const name = getComponentSchemaName(ctx, defPath);
  const oasSchema: oas.Oas3Schema = schemas[name] = {};
  if (oneof.attributes.title) oasSchema.title = oneof.attributes.title;
  if (oneof.attributes.description) {
    oasSchema.description = oneof.attributes.description;
  }
  oasSchema.oneOf = oneof.items.map((item) => {
    const itemSchema = convertType(ctx, item.itemType);
    if (item.attributes.title) itemSchema.title = item.attributes.title;
    if (item.attributes.description) {
      itemSchema.description = item.attributes.description;
    }
    return itemSchema;
  });
}

function genProc(ctx: GenContext) {
  const { input: { def, defPath }, output: { paths } } = ctx;
  if (!def.attributes.http) return;
  const proc = def as ir.Proc;
  try {
    const [_, httpMethod, httpPath] = /^(\w+)\s+(.+)$/.exec(
      proc.attributes.http.trim(),
    )!;
    const path = (paths[httpPath] ||= {}) as OasPathItem;
    const operation = {} as OasOperation;
    if (proc.attributes.summary) operation.summary = proc.attributes.summary;
    if (proc.attributes.description) {
      operation.description = proc.attributes.description;
    }
    operation.operationId = getOperationId(ctx, defPath);
    if (proc.inputType.valueTypePath !== "void") {
      const mediaType: OasMediaType = {
        schema: convertType(ctx, proc.inputType),
      };
      if (proc.attributes.example) {
        mediaType.example = parseYml(proc.attributes.example);
      }
      operation.requestBody = {
        content: { "application/json": mediaType },
      };
    }
    operation.responses = {};
    path[httpMethod.toLowerCase() as "get"] = operation;
  } catch {
    throw new GenerateOasError(`Invalid Proc: ${defPath}`);
  }
}

function genStruct(ctx: GenContext) {
  const { input: { def, defPath }, output: { schemas } } = ctx;
  const struct = def as ir.Struct;
  const name = getComponentSchemaName(ctx, defPath);
  const oasSchema: oas.Oas3Schema = schemas[name] = {};
  if (struct.attributes.title) oasSchema.title = struct.attributes.title;
  if (struct.attributes.description) {
    oasSchema.description = struct.attributes.description;
  }
  Object.assign(oasSchema, convertFieldsToOasObject(ctx, struct.fields));
}

function genUnion(ctx: GenContext) {
  const { input: { def, defPath }, output: { schemas } } = ctx;
  const union = def as ir.Union;
  const unionName = getComponentSchemaName(ctx, defPath);
  const oasSchema: oas.Oas3Schema = schemas[unionName] = {};
  if (union.attributes.title) oasSchema.title = union.attributes.title;
  if (union.attributes.description) {
    oasSchema.description = union.attributes.description;
  }
  oasSchema.type = "object";
  oasSchema.oneOf = [];
  for (const item of union.items) {
    const itemPath = `${defPath}::${item.name}`;
    const itemName = getComponentSchemaName(ctx, itemPath);
    const itemSchema: oas.Oas3Schema = schemas[itemName] = {};
    if (item.attributes.title) itemSchema.title = item.attributes.title;
    if (item.attributes.description) {
      itemSchema.description = item.attributes.description;
    }
    Object.assign(itemSchema, convertFieldsToOasObject(ctx, item.fields));
    oasSchema.oneOf.push(itemSchema);
  }
  oasSchema.discriminator = {
    propertyName: union.attributes.discriminator || "type",
    mapping: Object.fromEntries(
      union.items.map((item) => {
        const itemPath = `${defPath}::${item.name}`;
        const itemName = getComponentSchemaName(ctx, itemPath);
        const mappingKey = item.attributes.mapping || item.name;
        return [mappingKey, `#/components/schemas/${itemName}`];
      }),
    ),
  };
}

function convertFieldsToOasObject(
  ctx: GenContext,
  fields: ir.StructField[],
): oas.Oas3Schema {
  const oasSchema: oas.Oas3Schema = {};
  oasSchema.type = "object";
  const required = fields.filter((field) => !field.optional);
  if (required.length) oasSchema.required = required.map((field) => field.name);
  oasSchema.properties = {};
  for (const field of fields) {
    const property = convertType(ctx, field.fieldType);
    if (field.attributes.title) property.title = field.attributes.title;
    if (field.attributes.description) {
      property.description = field.attributes.description;
    }
    oasSchema.properties[field.name] = property;
  }
  return oasSchema;
}

function convertType(
  ctx: GenContext,
  type: ir.Type,
): oas.Oas3Schema {
  switch (type.type) {
    case "Array":
      return convertArrayType(ctx, type.valueTypePath);
    case "Dictionary":
      return convertDictionaryType(ctx, type.valueTypePath);
    case "Plain":
      return convertPlainType(ctx, type.valueTypePath);
  }
}

function convertDictionaryType(
  ctx: GenContext,
  valueTypePath: string,
): oas.Oas3Schema {
  const value = convertPlainType(ctx, valueTypePath);
  return { type: "object", additionalProperties: value };
}

function convertArrayType(
  ctx: GenContext,
  valueTypePath: string,
): oas.Oas3Schema {
  const items = convertPlainType(ctx, valueTypePath);
  return { type: "array", items };
}

function convertPlainType(
  ctx: GenContext,
  valueTypePath: string,
): oas.Oas3Schema {
  const isPrimitiveType = !valueTypePath.includes(".");
  if (isPrimitiveType) return convertPrimitive(valueTypePath);
  const name = getComponentSchemaName(ctx, valueTypePath);
  return { $ref: `#/components/schemas/${name}` };
}

function convertPrimitive(typePath: string): oas.Oas3Schema {
  switch (typePath) {
    case "boolean":
      return { type: "boolean" };
    case "int32":
      return { type: "integer", format: "int32" };
    case "int64":
      return { type: "integer", format: "int64" };
    case "integer":
      return { type: "integer" };
    case "float64":
      return { type: "number", format: "double" };
    case "string":
      return { type: "string" };
    case "bytes":
      return { type: "string", format: "byte" };
    case "object":
      return { type: "object", additionalProperties: true };
    default:
      throw new GenerateOasError(`Unknown primitive type: ${typePath}`);
  }
}

function pascalToCamelCase(str: string): string {
  return str[0].toLowerCase() + str.slice(1);
}

function getOperationId(ctx: GenContext, typePath: string) {
  return ctx.state.bdlTypePathToOasOperationIdTable[typePath];
}

function getComponentSchemaName(ctx: GenContext, typePath: string) {
  return ctx.state.bdlTypePathToOasComponentSchemaNameTable[typePath];
}

function bakeOperationIds(ir: ir.BdlIr, state: GenContextState) {
  const uniqueNameBaker = createUniqueNameBaker(
    (proc: ir.Proc) => pascalToCamelCase(proc.name),
  );
  for (const [defPath, def] of Object.entries(ir.defs)) {
    if (def.type !== "Proc") continue;
    state.bdlTypePathToOasOperationIdTable[defPath] = uniqueNameBaker.bake(def);
  }
}

function bakeComponentSchemaNames(ir: ir.BdlIr, state: GenContextState) {
  const uniqueNameBaker = createUniqueNameBaker((name: string) => name);
  for (const [defPath, def] of Object.entries(ir.defs)) {
    if (def.type === "Proc") continue;
    if (def.type === "Union") {
      const unionName = uniqueNameBaker.bake(def.name);
      state.bdlTypePathToOasComponentSchemaNameTable[defPath] = unionName;
      for (const item of def.items) {
        const itemPath = `${defPath}::${item.name}`;
        const itemName = uniqueNameBaker.bake(`${unionName}${item.name}`);
        state.bdlTypePathToOasComponentSchemaNameTable[itemPath] = itemName;
      }
      continue;
    }
    const name = uniqueNameBaker.bake(def.name);
    state.bdlTypePathToOasComponentSchemaNameTable[defPath] = name;
  }
}

interface UniqueNameBaker<TInput> {
  bake(input: TInput): string;
}
function createUniqueNameBaker<TInput>(
  getName: (input: TInput) => string,
): UniqueNameBaker<TInput> {
  const usedNames = new Set<string>();
  return {
    bake(input: TInput) {
      const name = (() => {
        const name = getName(input);
        if (!usedNames.has(name)) return name;
        let attempt = 1;
        while (usedNames.has(`${name}${attempt}`)) ++attempt;
        return `${name}${attempt}`;
      })();
      usedNames.add(name);
      return name;
    },
  };
}
