import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export type Files = Record<
  /* file path excluding extension */ string,
  /* openapi schema */ Partial<oas.Oas3_1Definition>
>;

export interface GenerateOasConfig {
  ir: ir.BdlIr;
  fileExtension: string;
  base?: Partial<oas.Oas3_1Definition>;
}
export interface GenerateOasResult {
  files: Files;
}

export function generateOas(config: GenerateOasConfig): GenerateOasResult {
  const result: GenerateOasResult = { files: {} };
  const { ir, base } = config;
  const root: oas.Oas3_1Definition = {
    openapi: "3.1.0",
    ...structuredClone(base),
  };
  result.files["openapi"] = root;
  for (const [modulePath, module] of Object.entries(ir.modules)) {
    for (const defPath of module.defPaths) {
      const def = ir.defs[defPath];
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
