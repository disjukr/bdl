import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import type * as ir from "../../generated/ir.ts";

export type Files = Record<
  /* file path excluding extension */ string,
  /* openapi schema */ Partial<oas.Oas3_1Definition>
>;

export interface GenerateOasConfig {
  ir: ir.BdlIr;
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
  console.log(ir); // TODO
  return result;
}
