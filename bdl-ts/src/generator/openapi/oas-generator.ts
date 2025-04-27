import { parse as parseYml } from "jsr:@std/yaml@1";
import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export type Files = Record<
  /* file path excluding extension */ string,
  /* openapi schema */ any
>;

export interface GenerateOasConfig {
  ir: ir.BdlIr;
  fileExtension: string;
  base?: Partial<oas.Oas3_1Definition>;
}
export interface GenerateOasResult {
  files: Files;
}

export class GenerateOasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateOasError";
  }
}

export function generateOas(config: GenerateOasConfig): GenerateOasResult {
  const result: GenerateOasResult = { files: {} };
  const { ir, base, fileExtension } = config;
  const root: oas.Oas3_1Definition = {
    openapi: "3.1.0",
    info: { title: "BDL API", version: "0.1.0" },
    ...structuredClone(base),
  };
  root.paths ||= {};
  root.components ||= {};
  root.components.schemas ||= {};
  result.files["openapi" + fileExtension] = root;
  for (const [modulePath, module] of Object.entries(ir.modules)) {
    for (const defPath of module.defPaths) {
      const def = ir.defs[defPath];
      const ctx = { config, module, modulePath, defPath, def, root, result };
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
  defPath: string;
  def: ir.Def;
  root: oas.Oas3_1Definition;
  result: GenerateOasResult;
}

function genProc(ctx: GenContext) {
  const { defPath, def, root } = ctx;
  if (!def.attributes.http) return;
  const proc = def as ir.Proc;
  try {
    const [_, httpMethod, httpPath] = /^(\w+)\s+(.+)$/.exec(
      proc.attributes.http.trim(),
    )!;
    const path = (root.paths![httpPath] ||= {}) as oas.Oas3PathItem;
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

function genEnum(ctx: GenContext) {
  const { config, modulePath, def, result } = ctx;
  const { fileExtension } = config;
  const enumDef = def as ir.Enum;
  const moduleFilePath = getModuleFilePath(modulePath, fileExtension);
  const oasSchema: oas.Oas3_1Schema =
    (result.files[moduleFilePath] ||= {})[enumDef.name] = {};
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

function relativeModuleFilePath(
  fromModulePath: string,
  toModulePath: string,
  fileExtension: string,
): string {
  const fromParts = fromModulePath.split(".");
  const toParts = toModulePath.split(".");
  let commonLength = 0;
  const l = Math.min(fromParts.length, toParts.length);
  for (let i = 0; i < l; ++i) {
    if (fromParts[i] !== toParts[i]) break;
    ++commonLength;
  }
  const relativeParts = [
    ...Array(fromParts.length - commonLength).fill(".."),
    ...toParts.slice(commonLength),
  ];
  return relativeParts.join("/") + fileExtension;
}

function getModuleFilePath(modulePath: string, fileExtension: string): string {
  return modulePath.replaceAll(".", "/") + fileExtension;
}

function getRefFromTypePath(
  here: string,
  typePath: string,
  fileExtension: string,
): string {
  const modulePath = typePath.split(".").slice(0, -1).join(".");
  const typeName = typePath.split(".").slice(-1)[0];
  const relativePath = relativeModuleFilePath(here, modulePath, fileExtension);
  return `${relativePath}#/${typeName}`;
}

function pascalToCamelCase(str: string): string {
  return str[0].toLowerCase() + str.slice(1);
}
