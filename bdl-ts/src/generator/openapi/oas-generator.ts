import { parse as parseYml } from "jsr:@std/yaml@1";
import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export type Files = Record<
  /* file path excluding extension */ string,
  /* openapi schema */ Partial<unknown>
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
  const { ir, base } = config;
  const root: oas.Oas3_1Definition = {
    openapi: "3.1.0",
    info: { title: "BDL API", version: "0.1.0" },
    ...structuredClone(base),
  };
  root.paths ||= {};
  root.components ||= {};
  root.components.schemas ||= {};
  result.files["openapi"] = root;
  for (const [modulePath, module] of Object.entries(ir.modules)) {
    for (const defPath of module.defPaths) {
      const def = ir.defs[defPath];
      if (def.type === "Proc") {
        if (!def.attributes.http) continue;
        try {
          const [_, httpMethod, httpPath] = /^(\w+)\s+(.+)$/.exec(
            def.attributes.http.trim(),
          )!;
          const path = (root.paths[httpPath] ||= {}) as oas.Oas3PathItem;
          const operation = {} as oas.Oas3Operation;
          if (def.attributes.summary) {
            operation.summary = def.attributes.summary;
          }
          if (def.attributes.description) {
            operation.description = def.attributes.description;
          }
          operation.operationId = pascalToCamelCase(def.name);
          if (def.inputType.valueTypePath !== "void") {
            const mediaType: oas.Oas3MediaType = {
              schema: {
                // TODO: handle array & dictionary
                $ref: "#/components/schemas/" +
                  def.inputType.valueTypePath.split(".").pop(),
              },
            };
            if (def.attributes.example) {
              mediaType.example = parseYml(def.attributes.example);
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
    }
  }
  return result;
}

function relativeModulePath(
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

function getRefFromTypePath(
  here: string,
  typePath: string,
  fileExtension: string,
): string {
  const modulePath = typePath.split(".").slice(0, -1).join(".");
  const typeName = typePath.split(".").slice(-1)[0];
  const relativePath = relativeModulePath(here, modulePath, fileExtension);
  return `${relativePath}#/${typeName}`;
}

function pascalToCamelCase(str: string): string {
  return str[0].toLowerCase() + str.slice(1);
}
