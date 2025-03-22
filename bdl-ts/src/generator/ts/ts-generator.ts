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

interface GenContext {
  ir: ir.BdlIr;
  modulePath: string;
  fragments: (false | null | undefined | string | (() => string))[];
}

function genModule(module: ir.Module, ctx: GenContext) {
  ctx.fragments.push(
    `import * as $d from "@disjukr/bdl-runtime/data-schema";\n\n`,
  );
  for (const defPath of module.defPaths) {
    const def = ctx.ir.defs[defPath];
    switch (def.body.type) {
      case "Custom":
        genCustom(defPath, def, ctx);
        break;
      case "Enum":
        continue; // TODO
      case "Oneof":
        continue; // TODO
      case "Proc":
        continue; // TODO
      case "Struct":
        genStruct(defPath, def, ctx);
        break;
      case "Union":
        genUnion(defPath, def, ctx);
        break;
    }
  }
}

function genCustom(defPath: string, def: ir.Def, ctx: GenContext) {
  const custom = def.body as ir.Custom;
  ctx.fragments.push(
    `export type ${def.name} = ${typeToTsType(custom.originalType)};\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = $d.defineCustom("${defPath}");\n\n`,
  );
}

function genStruct(defPath: string, def: ir.Def, ctx: GenContext) {
  const struct = def.body as ir.Struct;
  ctx.fragments.push(
    `export interface ${def.name} {${
      struct.fields.map((field) => {
        return `\n  ${field.name}${field.optional ? "?" : ""}: ${
          typeToTsType(field.fieldType)
        };`;
      }).join("")
    }\n}\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = $d.defineStruct<${def.name}>("${defPath}", [${
      struct.fields.map((field) => {
        return `\n  { name: "${field.name}", fieldType: ${
          typeToTsValue(field.fieldType)
        }, optional: ${field.optional} },`;
      }).join("")
    }\n]);\n\n`,
  );
}

function genUnion(defPath: string, def: ir.Def, ctx: GenContext) {
  const union = def.body as ir.Union;
  const discriminator = def.attributes.discriminator || "type";
  ctx.fragments.push(
    `export type ${def.name} =\n${
      Object.values(union.items).map((item) => {
        return `  | ${def.name}.${item.name}\n`;
      }).join("")
    }  ;\n`,
  );
  ctx.fragments.push(
    `export declare namespace ${def.name} {\n${
      Object.values(union.items).map((item) => {
        return `  export interface ${item.name} {\n    ${
          JSON.stringify(discriminator)
        }: "${item.name}";${
          item.fields.map((field) => {
            return `\n    ${field.name}${field.optional ? "?" : ""}: ${
              typeToTsType(field.fieldType)
            };`;
          }).join("")
        }\n  }\n`;
      }).join("")
    }}\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = $d.defineUnion<${def.name}>(\n  "${defPath}",\n  "${discriminator}",\n  {${
      Object.values(union.items).map((item) => {
        return `\n    ${item.name}: [${
          item.fields.map((field) => {
            return `\n      { name: "${field.name}", fieldType: ${
              typeToTsValue(field.fieldType)
            }, optional: ${field.optional} },`;
          }).join("")
        }\n    ],`;
      }).join("")
    }\n  }\n);\n\n`,
  );
}

function typeToTsType(type: ir.Type): string {
  switch (type.type) {
    case "Plain":
      return typePathToTsType(type.valueTypePath);
    case "Array":
      return `${typePathToTsType(type.valueTypePath)}[]`;
    case "Dictionary":
      // TODO: non-string key
      return `Record<${typePathToTsType(type.keyTypePath)}, ${
        typePathToTsType(type.valueTypePath)
      }>`;
  }
}

function typeToTsValue(type: ir.Type): string {
  switch (type.type) {
    case "Plain":
      return `$d.p("${type.valueTypePath}")`;
    case "Array":
      return `$d.a("${type.valueTypePath}")`;
    case "Dictionary":
      return `$d.d("${type.keyTypePath}", "${type.valueTypePath}")`;
  }
}

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
