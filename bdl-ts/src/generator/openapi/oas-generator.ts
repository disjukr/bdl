import { parse as parseYml } from "jsr:@std/yaml@1";
import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export interface GenerateOasConfig {
  ir: ir.BdlIr;
  base?: Partial<oas.Oas3_1Definition>;
}
export interface GenerateOasResult {
  schema: oas.Oas3_1Definition;
}

export class GenerateOasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateOasError";
  }
}

export function generateOas(config: GenerateOasConfig): GenerateOasResult {
  const { ir, base } = config;
  const schema: oas.Oas3_1Definition = {
    openapi: "3.1.0",
    info: { title: "BDL API", version: "0.1.0" },
    ...structuredClone(base),
  };
  const paths = schema.paths ||= {};
  schema.components ||= {};
  const schemas = schema.components.schemas ||= {};
  const result: GenerateOasResult = { schema };
  for (const [modulePath, module] of Object.entries(ir.modules)) {
    for (const defPath of module.defPaths) {
      const def = ir.defs[defPath];
      const ctx = { config, module, modulePath, def, defPath, paths, schemas };
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
  config: GenerateOasConfig;
  module: ir.Module;
  modulePath: string;
  def: ir.Def;
  defPath: string;
  paths: oas.Oas3Paths<oas.Oas3_1Schema>;
  schemas: { [name: string]: oas.Referenced<oas.Oas3_1Schema> };
}

function genEnum(ctx: GenContext) {
  const { def, schemas } = ctx;
  const enumDef = def as ir.Enum;
  const oasSchema: oas.Oas3_1Schema = schemas[enumDef.name] = {};
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
  const { defPath, def, paths } = ctx;
  if (!def.attributes.http) return;
  const proc = def as ir.Proc;
  try {
    const [_, httpMethod, httpPath] = /^(\w+)\s+(.+)$/.exec(
      proc.attributes.http.trim(),
    )!;
    const path = (paths[httpPath] ||= {}) as oas.Oas3PathItem;
    const operation = {} as oas.Oas3Operation;
    if (proc.attributes.summary) {
      operation.summary = proc.attributes.summary;
    }
    if (proc.attributes.description) {
      operation.description = proc.attributes.description;
    }
    operation.operationId = pascalToCamelCase(proc.name);
    if (proc.inputType.valueTypePath !== "void") {
      const mediaType: oas.Oas3MediaType = {
        schema: {
          // TODO: handle array & dictionary
          $ref: "#/components/schemas/" +
            proc.inputType.valueTypePath.split(".").pop(),
        },
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
