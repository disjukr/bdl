import type * as ir from "../../generated/ir.ts";

export type Files = Record<
  /* file path */ string,
  /* typescript code */ string
>;

export interface GenerateTsConfig {
  ir: ir.BdlIr;
}
export interface GenerateTsResult {
  files: Files;
}
export function generateTs(config: GenerateTsConfig): GenerateTsResult {
  const result: GenerateTsResult = { files: {} };
  for (const [modulePath, module] of Object.entries(config.ir.modules)) {
    const ctx: GenContext = { ir: config.ir, modulePath, fragments: [] };
    genModule(module, ctx);
    result.files[modulePathToFilePath(modulePath)] = ctx.fragments.map(
      (fragment) => (typeof fragment === "function") ? fragment() : fragment,
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
      case "Custom":
        genCustom(def, ctx);
        break;
    }
  }
}

function genCustom(def: ir.Def, ctx: GenContext) {
  // const custom = def.body as ir.Custom;
  // TODO
  ctx.fragments.push(`export type ${def.name} = `);
}

function modulePathToFilePath(modulePath: string) {
  return `${modulePath.replaceAll(".", "/")}.ts`;
}
