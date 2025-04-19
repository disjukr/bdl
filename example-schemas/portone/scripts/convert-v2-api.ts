import { dirname, fromFileUrl } from "jsr:@std/path@1";
import { parse as parseYml, stringify as stringifyYml } from "jsr:@std/yaml";
import { resolve } from "jsr:@std/path/resolve";
import type * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import * as ir from "@disjukr/bdl/ir";
import { listEveryMissingExternalTypePaths } from "@disjukr/bdl/ir-analyzer";
import { writeIrToBdlFiles } from "@disjukr/bdl/io/ir";

const v2ApiYaml = await Deno.readTextFile(
  new URL("../tmp/v2.openapi.yml", import.meta.url),
);
const v2Api = parseYml(v2ApiYaml) as oas.Oas3_1Definition;
const modulePathPrefix = `portone.v2.api`;
const result: ir.BdlIr = { modules: {}, defs: {} };

const oasSchemas = v2Api.components?.schemas ?? {};
for (const [name, oasSchema_] of Object.entries(oasSchemas)) {
  const oasSchema = oasSchema_ as oas.Oas3_1Schema;
  const kind = which(oasSchema);
  if (kind === "unknown") console.log("unknown", name);
  if (kind === "enum") {
    const def: ir.Enum = { type: "Enum", attributes: {}, name, items: [] };
    if ("x-portone-title" in oasSchema) {
      def.attributes.description = oasSchema["x-portone-title"] as string;
    }
    for (const item of oasSchema.enum ?? []) {
      def.items.push({ attributes: {}, name: item as string });
      // TODO: handle enum title
    }
    result.defs[typeNameToDefPath(name)] = def;
  }
}

for (const [httpPath, pathItem] of Object.entries(v2Api.paths || {})) {
  for (const [httpMethod, operation] of Object.entries(pathItem)) {
    buildOperation(httpPath, httpMethod, operation);
  }
}

// fill missing modules
for (const defPath of Object.keys(result.defs)) {
  const modulePath = defPath.split(".").slice(0, -1).join(".");
  const module = result.modules[modulePath] ??= {
    attributes: {},
    defPaths: [],
    imports: [],
  };
  module.defPaths.push(defPath);
}

// fill missing imports
for (const modulePath of Object.keys(result.modules)) {
  const module = result.modules[modulePath];
  const referencedModules: Record<string, string[]> = {};
  const missingExternalTypePaths = listEveryMissingExternalTypePaths(
    result,
    modulePath,
  );
  for (const typePath of missingExternalTypePaths) {
    const isPrimitiveType = !typePath.includes(".");
    if (isPrimitiveType) continue;
    const fragments = typePath.split(".");
    const typeName = fragments.pop()!;
    const modulePath = fragments.join(".");
    (referencedModules[modulePath] ||= []).push(typeName);
  }
  for (const [modulePath, typeNames] of Object.entries(referencedModules)) {
    module.imports.push({
      attributes: {},
      modulePath,
      items: typeNames.map((name) => ({ name })),
    });
  }
}

const __dirname = dirname(fromFileUrl(import.meta.url));
await writeIrToBdlFiles({
  ir: result,
  outputDirectory: resolve(__dirname, "../generated"),
  stripComponents: 1,
});

type OasSchemaKind = "union" | "struct" | "enum" | "unknown";
function which(oasSchema: oas.Oas3_1Schema): OasSchemaKind {
  if ("x-portone-discriminator" in oasSchema) return "union";
  if (oasSchema.type === "object") return "struct";
  if (oasSchema.type === "string" && oasSchema.enum) return "enum";
  return "unknown";
}

function buildOperation(
  httpPath: string,
  httpMethod: string,
  operation: oas.Oas3Operation,
): void {
  const name = camelToPascal(operation.operationId || "");
  const modulePath = portoneCategoryToModulePath(
    (operation as any)["x-portone-category"] as string || "unstable",
  );
  const defPath = `${modulePath}.${name}`;
  const proc: ir.Proc = {
    type: "Proc",
    attributes: {},
    name,
    inputType: { type: "Plain", valueTypePath: "unknown" },
    outputType: { type: "Plain", valueTypePath: "unknown" },
  };
  proc.attributes.http = `${httpMethod.toUpperCase()} ${httpPath}`;
  if ("x-portone-title" in operation) {
    proc.attributes.summary = operation["x-portone-title"] as string;
  }
  if ("x-portone-description" in operation) {
    proc.attributes.description = operation["x-portone-description"] as string;
  }
  if ("security" in operation) {
    proc.attributes.security = stringifyYml(operation.security).trim();
  }
  result.defs[defPath] = proc;
}

interface SplitResponsesResult {
  response: oas.Oas3Responses;
  error: oas.Oas3Responses;
}
function splitResponses(responses: oas.Oas3Responses): SplitResponsesResult {
  const result: SplitResponsesResult = { response: {}, error: {} };
  for (const [statusCode, response] of Object.entries(responses)) {
    if (isErrorStatusCode(statusCode)) {
      result.error[statusCode] = response;
    } else {
      result.response[statusCode] = response;
    }
  }
  return result;
}
function isErrorStatusCode(statusCode: string): boolean {
  return statusCode.startsWith("4") || statusCode.startsWith("5");
}

function camelToPascal(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function portoneCategoryToModulePath(category: string): string {
  return `${modulePathPrefix}.${category}`;
}

function schemaRefToTypePath(ref: string): string {
  const typeName = ref.split("/").pop()!;
  return typeNameToDefPath(typeName);
}

function typeNameToDefPath(typeName: string): string {
  return `${modulePathPrefix}.data.${typeName}`;
}
