import { dirname, fromFileUrl, resolve } from "jsr:@std/path";
import { buildBdlIr } from "../src/ir-builder.ts";
import type * as bdlIr from "../src/generated/ir.ts";

const __filename = fromFileUrl(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../..");

const { ir } = await buildBdlIr({
  entryModulePaths: [
    "bdl.ast",
    "bdl.config",
    "bdl.cst",
    "bdl.ir",
    "bdl.ir_diff",
    "bdl.ir_ref",
    "bdl.standard",
  ],
  async resolveModuleFile(modulePath) {
    return {
      text: await Deno.readTextFile(
        resolve(repoRoot, modulePath.split(".").join("/") + ".bdl"),
      ),
    };
  },
});

for (const [modulePath, module] of Object.entries(ir.modules)) {
  const result: string[] = [];
  const usedTypes = new Set<string>();
  const mappings = new Set<bdlIr.Def>();
  for (const importStmt of module.imports) {
    const [_bdl, ...importFragments] = importStmt.modulePath.split(".");
    const items = importStmt.items.map((item) => item.name);
    const from = importFragments
      .map((fragment) => fragment.replaceAll("_", "-"))
      .join("/") + ".ts";
    result.push(`import type {${items}} from "./${from}";`);
  }
  if (module.imports.length) result.push("\n\n");
  for (const defPath of module.defPaths) {
    const def = ir.defs[defPath];
    if (def.type !== "Oneof") continue;
    if (def.attributes.discriminator !== "type") continue;
    for (const item of def.items) {
      const itemDef = ir.defs[item.itemType.valueTypePath];
      mappings.add(itemDef);
    }
  }
  for (const defPath of module.defPaths) {
    const def = ir.defs[defPath];
    switch (def.type) {
      case "Custom": {
        const type = typeToTs(def.originalType);
        result.push(`export type ${def.name} = ${type};\n\n`);
        continue;
      }
      case "Enum": {
        result.push(`export type ${def.name} = `);
        for (const item of def.items) {
          if (item.attributes.value) {
            result.push(`|"${item.attributes.value}"\n`);
          } else {
            result.push(`|"${item.name}"\n`);
          }
        }
        result.push(";\n\n");
        continue;
      }
      case "Oneof": {
        result.push(`export type ${def.name} = `);
        for (const item of def.items) {
          result.push(`|${typeToTs(item.itemType)}\n`);
        }
        result.push(";\n\n");
        continue;
      }
      case "Struct": {
        result.push(`export interface ${def.name} {`);
        if (mappings.has(def)) result.push(`type: "${def.name}";`);
        for (const field of def.fields) result.push(fieldToTs(field));
        result.push("}\n\n");
        continue;
      }
      case "Union": {
        result.push(`export type ${def.name} = `);
        for (const item of def.items) result.push(`|${item.name}`);
        result.push(";\n\n");
        for (const item of def.items) {
          if (usedTypes.has(item.name)) continue;
          else usedTypes.add(item.name);
          result.push(`export interface ${item.name} {`);
          result.push(`type: "${item.name}";`);
          for (const field of item.fields) result.push(fieldToTs(field));
          result.push("}\n\n");
        }
        continue;
      }
    }
  }
  const modulePathFragments = modulePath.split(".")
    .map((fragment) => fragment.replaceAll("_", "-"));
  modulePathFragments.shift();
  await Deno.writeTextFile(
    resolve(
      repoRoot,
      "bdl-ts/src/generated",
      modulePathFragments.join("/") + ".ts",
    ),
    result.join(""),
  );
}
await new Deno.Command(
  Deno.execPath(),
  { args: ["fmt", "src/generated"] },
).output();

function fieldToTs(field: bdlIr.StructField): string {
  const name = field.name;
  const optional = field.optional ? "?" : "";
  const type = typeToTs(field.fieldType);
  return (`${name}${optional}: ${type};`);
}

function typePathToName(typePath: string): string {
  const name = typePath.split(".").at(-1) || "";
  return name === "int32" ? "number" : name;
}

function typeToTs(type: bdlIr.Type): string {
  switch (type.type) {
    case "Plain":
      return typePathToName(type.valueTypePath);
    case "Array":
      return `${typePathToName(type.valueTypePath)}[]`;
    case "Dictionary": {
      const key = typePathToName(type.keyTypePath);
      const value = typePathToName(type.valueTypePath);
      return `Record<${key}, ${value}>`;
    }
  }
}
