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
  ctx.fragments.push(
    `import * as ds from "@disjukr/bdl-runtime/data-schema";\n\n`,
  );
  for (const defPath of module.defPaths) {
    const def = ctx.ir.defs[defPath];
    switch (def.body.type) {
      case "Custom":
        genCustom(def, ctx);
        break;
      case "Enum":
        continue; // TODO
      case "Oneof":
        continue; // TODO
      case "Proc":
        continue; // TODO
      case "Struct":
        genStruct(def, ctx);
        break;
      case "Union":
        continue; // TODO
    }
  }
}

function genCustom(def: ir.Def, ctx: GenContext) {
  // const custom = def.body as ir.Custom;
  // TODO
  ctx.fragments.push(`export type ${def.name} = unknown;\n\n`);
}

function genStruct(def: ir.Def, ctx: GenContext) {
  const struct = def.body as ir.Struct;
  ctx.fragments.push(
    `export interface ${def.name} {${
      struct.fields.map((field) => {
        return `\n  ${field.name}: ${
          typePathToTsType(field.fieldType.valueTypePath)
        };`;
      }).join("")
    }\n}\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = ds.createStruct<${def.name}>([${
      struct.fields.map((field) => {
        return `\n  { name: "${field.name}", itemType: ${field.fieldType.valueTypePath}, optional: ${field.optional} },`;
      }).join("")
    }\n]);\n\n`,
  );
}

const primitiveTypeMap: Record<string, string> = {
  boolean: "boolean",
  int32: "number",
  int64: "bigint",
  integer: "bigint",
  float64: "number",
  string: "string",
  bytes: "Uint8Array",
  object: "Record<string, unknown>",
  void: "void",
};

function typePathToTsType(typePath: string): string {
  if (isPrimitiveType(typePath)) {
    return primitiveTypeMap[typePath] || "unknown";
  } else {
    return typePath.split(".").slice(-1)[0];
  }
}

function isPrimitiveType(typePath: string): boolean {
  return !typePath.includes(".");
}

// function modulePathFromTypePath(typePath: string): string {
//   return typePath.split(".").slice(0, -1).join(".");
// }

function modulePathToFilePath(modulePath: string) {
  return `${modulePath.replaceAll(".", "/")}.ts`;
}
