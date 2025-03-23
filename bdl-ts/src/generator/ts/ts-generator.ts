import { dirname, relative } from "jsr:@std/path";
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
  const { ir } = config;
  for (const [modulePath, module] of Object.entries(ir.modules)) {
    const moduleFilePath = modulePathToFilePath(modulePath);
    const fragments: Fragments = [];
    const ctx: GenContext = { ir, modulePath, moduleFilePath, fragments };
    genModule(module, ctx);
    result.files[moduleFilePath] = ctx.fragments.map(
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
  moduleFilePath: string;
  fragments: Fragments;
}
type Fragment = false | null | undefined | string;
type Fragments = (Fragment | (() => Fragment))[];

function genModule(module: ir.Module, ctx: GenContext) {
  let shouldImportDataSchema = false;
  let shouldImportFetchProc = false;
  ctx.fragments.push(
    () => (
      shouldImportDataSchema &&
      `import * as $d from "@disjukr/bdl-runtime/data-schema";\n`
    ),
    () => (
      shouldImportFetchProc &&
      `import * as $f from "@disjukr/bdl-runtime/fetch-proc";\n`
    ),
  );
  const moduleDirectory = dirname(ctx.moduleFilePath);
  for (const i of module.imports) {
    const targetModuleFilePath = modulePathToFilePath(i.modulePath);
    ctx.fragments.push(
      `import type { ${
        i.items.map((item) => {
          if (item.as) return `${item.name} as ${item.as}`;
          return item.name;
        }).join(", ")
      } } from "./${relative(moduleDirectory, targetModuleFilePath)}";\n`,
    );
  }
  ctx.fragments.push(
    () => (Boolean(
      shouldImportDataSchema ||
        shouldImportFetchProc ||
        module.imports.length,
    ) && "\n"),
  );
  for (const defPath of module.defPaths) {
    const def = ctx.ir.defs[defPath];
    const defCtx: GenDefContext = { defPath, def, ...ctx };
    if (def.body.type === "Proc") shouldImportFetchProc = true;
    else shouldImportDataSchema = true;
    switch (def.body.type) {
      case "Custom":
        genCustom(defCtx);
        break;
      case "Enum":
        genEnum(defCtx);
        break;
      case "Oneof":
        genOneof(defCtx);
        break;
      case "Proc":
        genProc(defCtx);
        break;
      case "Struct":
        genStruct(defCtx);
        break;
      case "Union":
        genUnion(defCtx);
        break;
    }
  }
}

interface GenDefContext extends GenContext {
  defPath: string;
  def: ir.Def;
}

function genCustom(ctx: GenDefContext) {
  const { def, defPath } = ctx;
  const custom = def.body as ir.Custom;
  ctx.fragments.push(
    `export type ${def.name} = ${typeToTsType(custom.originalType)};\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = $d.defineCustom("${defPath}");\n\n`,
  );
}

function genEnum(ctx: GenDefContext) {
  const { def, defPath } = ctx;
  const { items } = def.body as ir.Enum;
  ctx.fragments.push(
    `export type ${def.name} =\n${
      items.map((item) => {
        const { value } = item.attributes;
        return `  | ${JSON.stringify(value ? value : item.name)}\n`;
      }).join("")
    }  ;\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = $d.defineEnum(\n  "${defPath}",\n  new Set([\n${
      items.map((item) => {
        const { value } = item.attributes;
        return `    ${JSON.stringify(value ? value : item.name)},\n`;
      }).join("")
    }  ]),\n);\n\n`,
  );
}

function genOneof(ctx: GenDefContext) {
  const { def, defPath } = ctx;
  const oneof = def.body as ir.Oneof;
  ctx.fragments.push(
    `export type ${def.name} =\n${
      oneof.items.map((item) => {
        return `  | ${typeToTsType(item.itemType)}\n`;
      }).join("")
    }  ;\n`,
  );
  ctx.fragments.push(
    `export const ${def.name} = $d.defineOneof<${def.name}>(\n  "${defPath}",\n  [${
      oneof.items.map((item) => {
        return `\n    ${typeToTsValue(item.itemType)},`;
      }).join("")
    }\n  ],\n);\n\n`,
  );
}

function genProc(ctx: GenDefContext) {
  const { def } = ctx;
  const proc = def.body as ir.Proc;
  ctx.fragments.push(
    `export const ${pascalToCamelCase(def.name)} = $f.defineFetchProc<${
      typeToTsType(proc.inputType)
    }, ${typeToTsType(proc.outputType)}>({\n  method: "${
      def.attributes.method || "GET"
    }",\n  pathname: [/* TODO */],\n  pathParams: [/* TODO */],\n  searchParams: [/* TODO */],\n  reqType: ${
      typeToTsValue(proc.inputType)
    },\n  resTypes: {/* TODO */},\n});\n\n`,
  );
}

function genStruct(ctx: GenDefContext) {
  const { def, defPath } = ctx;
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

function genUnion(ctx: GenDefContext) {
  const { def, defPath } = ctx;
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

function typeToTsType(
  type: ir.Type,
  typePathToTsTypeFn: (typePath: string) => string = typePathToTsType,
): string {
  switch (type.type) {
    case "Plain":
      return typePathToTsTypeFn(type.valueTypePath);
    case "Array":
      return `${typePathToTsTypeFn(type.valueTypePath)}[]`;
    case "Dictionary":
      // TODO: non-string key
      return `Record<${typePathToTsTypeFn(type.keyTypePath)}, ${
        typePathToTsTypeFn(type.valueTypePath)
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
  return isPrimitiveType(typePath)
    ? primitiveToTsType(typePath)
    : typePath.split(".").slice(-1)[0];
}

function primitiveToTsType(primitive: string): string {
  return primitiveTypeMap[primitive] || "unknown";
}

function isPrimitiveType(typePath: string): boolean {
  return !typePath.includes(".");
}

function modulePathToFilePath(modulePath: string) {
  return `${modulePath.replaceAll(".", "/")}.ts`;
}

function pascalToCamelCase(pascalCase: string) {
  return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
}
