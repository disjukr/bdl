import type * as ir from "../../generated/ir.ts";

export interface GenerateTsConfig {
  ir: ir.BdlIr;
}
export interface GenerateTsResult {
  files: Record<string, string>;
}
export function generateTs(config: GenerateTsConfig): GenerateTsResult {
  const result: GenerateTsResult = { files: {} };
  for (const [modulePath, module] of Object.entries(config.ir.modules)) {
    const ctx: GenContext = { ir: config.ir, modulePath, fragments: [] };
    genModule(module, ctx);
    result.files[modulePath] = ctx.fragments.map((fragment) =>
      (typeof fragment === "function") ? fragment() : fragment
    ).filter(Boolean).join("");
  }
  return result;
}

interface GenContext {
  ir: ir.BdlIr;
  modulePath: string;
  fragments: (false | null | undefined | string | (() => string))[];
}

function genModule(module: ir.Module, ctx: GenContext) {
  ctx.fragments.push(`import * ds from "@disjukr/bdl-runtime/data-schema";\n`);
  for (const defPath of module.defPaths) {
    const def = ctx.ir.defs[defPath];
    switch (def.body.type) {
      default:
        continue; // TODO
      case "Scalar":
        genScalar(def, ctx);
        break;
    }
  }
}

function genScalar(def: ir.Def, ctx: GenContext) {
  // const scalar = def.body as ir.Scalar;
  // TODO
  ctx.fragments.push(`export type ${def.name} = `);
}
