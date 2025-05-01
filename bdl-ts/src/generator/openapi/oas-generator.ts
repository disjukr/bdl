import { parse as parseYml } from "jsr:@std/yaml@1";
import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export type OasSchema = oas.Oas3_1Definition;
type OasPaths = oas.Oas3Paths<oas.Oas3_1Schema>;
type OasPathItem = oas.Oas3PathItem<oas.Oas3_1Schema>;
type OasOperation = oas.Oas3Operation<oas.Oas3_1Schema>;
type OasMediaType = oas.Oas3MediaType<oas.Oas3_1Schema>;
interface OasComponentSchemas {
  [name: string]: oas.Referenced<oas.Oas3_1Schema>;
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
    openapi: "3.1.0",
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
        case "Enum":
          genEnum(ctx);
          break;
        case "Proc":
          genProc(ctx);
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

function genEnum(ctx: GenContext) {
  const { input: { def, defPath }, output: { schemas } } = ctx;
  const enumDef = def as ir.Enum;
  const oasSchema: oas.Oas3_1Schema =
    schemas[getComponentSchemaName(ctx, defPath)] = {};
  if (enumDef.attributes.summary) oasSchema.title = enumDef.attributes.summary;
  if (enumDef.attributes.description) {
    oasSchema.description = enumDef.attributes.description;
  }
  oasSchema.type = "string";
  oasSchema.enum = enumDef.items.map((item) => {
    if (item.attributes.value) return item.attributes.value;
    return item.name;
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
    if (proc.attributes.summary) {
      operation.summary = proc.attributes.summary;
    }
    if (proc.attributes.description) {
      operation.description = proc.attributes.description;
    }
    operation.operationId = getOperationId(ctx, defPath);
    if (proc.inputType.valueTypePath !== "void") {
      const mediaType: OasMediaType = {
        // TODO: handle array & dictionary
        schema: getRef(ctx, proc.inputType.valueTypePath),
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

function pascalToCamelCase(str: string): string {
  return str[0].toLowerCase() + str.slice(1);
}

function getOperationId(ctx: GenContext, typePath: string) {
  return ctx.state.bdlTypePathToOasOperationIdTable[typePath];
}

function getRef(ctx: GenContext, typePath: string): oas.OasRef {
  return {
    $ref: `#/components/schemas/${getComponentSchemaName(ctx, typePath)}`,
  };
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
  const uniqueNameBaker = createUniqueNameBaker(
    (def: ir.Def) => def.name,
  );
  for (const [defPath, def] of Object.entries(ir.defs)) {
    if (def.type === "Proc") continue;
    state.bdlTypePathToOasComponentSchemaNameTable[defPath] = uniqueNameBaker
      .bake(def);
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
