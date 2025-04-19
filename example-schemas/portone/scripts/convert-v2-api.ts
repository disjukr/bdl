import { dirname, fromFileUrl } from "jsr:@std/path@1";
import { parse as parseYml, stringify as stringifyYml } from "jsr:@std/yaml";
import { resolve } from "jsr:@std/path/resolve";
import * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import * as ir from "@disjukr/bdl/ir";
import { listEveryMissingExternalTypePaths } from "@disjukr/bdl/ir-analyzer";
import { writeIrToBdlFiles } from "@disjukr/bdl/io/ir";

const v2ApiYaml = await Deno.readTextFile(
  new URL("../tmp/v2.openapi.yml", import.meta.url),
);
const v2Api = parseYml(v2ApiYaml) as oas.Oas3_1Definition;
const modulePathPrefix = `portone.v2.api`;
const result: ir.BdlIr = { modules: {}, defs: {} };
const voidType: ir.Type = { type: "Plain", valueTypePath: "void" };

const oasSchemas = v2Api.components?.schemas ?? {};
for (const [name, oasSchema_] of Object.entries(oasSchemas)) {
  const oasSchema = oasSchema_ as oas.Oas3_1Schema;
  const kind = which(oasSchema);
  if (kind === "unknown") console.log("unknown", name);
  if (kind === "tagged-oneof") buildTaggedOneof(name, oasSchema);
  if (kind === "dictionary") buildDictionary(name, oasSchema);
  if (kind === "struct") buildStruct(name, oasSchema);
  if (kind === "enum") buildEnum(name, oasSchema);
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
    attributes: { standard: "portone-rest-api" },
    defPaths: [],
    imports: [],
  };
  module.defPaths.push(defPath);
}

// fill missing imports
for (const modulePath of Object.keys(result.modules)) {
  const module = result.modules[modulePath];
  const usedNames = new Set<string>(
    module.defPaths.map((defPath) => defPath.split(".").pop()!),
  );
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
      items: typeNames.map((name) => {
        if (!usedNames.has(name)) return { name };
        let attempt = 1;
        while (usedNames.has(`${name}${attempt}`)) ++attempt;
        usedNames.add(`${name}${attempt}`);
        return { name, as: `${name}${attempt}` };
      }),
    });
  }
}

const __dirname = dirname(fromFileUrl(import.meta.url));
await writeIrToBdlFiles({
  ir: result,
  outputDirectory: resolve(__dirname, "../generated"),
  stripComponents: 1,
});

type OasSchemaKind =
  | "tagged-oneof"
  | "dictionary"
  | "struct"
  | "enum"
  | "unknown";
function which(oasSchema: oas.Oas3_1Schema): OasSchemaKind {
  if ("discriminator" in oasSchema) return "tagged-oneof";
  if (oasSchema.type === "object") {
    if (oasSchema.additionalProperties) return "dictionary";
    return "struct";
  }
  if (oasSchema.type === "string" && oasSchema.enum) return "enum";
  return "unknown";
}

function buildTaggedOneof(
  name: string,
  oasSchema: oas.Oas3_1Schema,
): void {
  const def: ir.Oneof = { type: "Oneof", attributes: {}, name, items: [] };
  if ("x-portone-title" in oasSchema) {
    def.attributes.description = oasSchema["x-portone-title"] as string;
  } else if ("title" in oasSchema) {
    def.attributes.description = oasSchema.title as string;
  } else if ("description" in oasSchema) {
    def.attributes.description = oasSchema.description as string;
  }
  const oasDiscriminator = oasSchema.discriminator || { propertyName: "type" };
  const oasDiscriminatorMapping = oasDiscriminator.mapping || {};
  const portoneDiscriminator = (oasSchema as any)["x-portone-discriminator"];
  def.attributes.discriminator = oasDiscriminator.propertyName;
  for (const [mapping, ref] of Object.entries(oasDiscriminatorMapping)) {
    const item: ir.OneofItem = {
      attributes: {},
      itemType: { type: "Plain", valueTypePath: schemaRefToTypePath(ref) },
    };
    def.items.push(item);
    if (portoneDiscriminator) {
      const portoneMapping = portoneDiscriminator[mapping];
      const title = portoneMapping.title;
      if (title) item.attributes.description = title;
    }
    item.attributes.mapping = mapping;
  }
  result.defs[typeNameToDefPath(name)] = def;
}

function buildStruct(name: string, oasSchema: oas.Oas3_1Schema): void {
  const def: ir.Struct = { type: "Struct", attributes: {}, name, fields: [] };
  if ("x-portone-description" in oasSchema) {
    def.attributes.description = oasSchema["x-portone-description"] as string;
  } else if ("x-portone-title" in oasSchema) {
    def.attributes.description = oasSchema["x-portone-title"] as string;
  }
  const oasProperties = oasSchema.properties ?? {};
  for (const [fieldName, oasProperty] of Object.entries(oasProperties)) {
    const field: ir.StructField = {
      attributes: {},
      name: fieldName,
      fieldType: getFieldType(oasProperty),
      optional: !oasSchema.required?.includes(fieldName),
    };
    if ("title" in oasProperty) {
      field.attributes.description = oasProperty.title as string;
    }
    def.fields.push(field);
  }
  result.defs[typeNameToDefPath(name)] = def;
}

function buildDictionary(name: string, oasSchema: oas.Oas3_1Schema): void {
  const def: ir.Custom = {
    type: "Custom",
    attributes: {},
    name,
    originalType: voidType,
  };
  def.originalType = {
    type: "Dictionary",
    keyTypePath: "string",
    valueTypePath:
      getFieldType(oasSchema.additionalProperties as oas.Oas3_1Schema)
        .valueTypePath,
  };
  result.defs[typeNameToDefPath(name)] = def;
}

function getFieldType(
  oasProperty: oas.Referenced<oas.Oas3_1Schema>,
): ir.Type {
  if (oasProperty.$ref) {
    const typePath = schemaRefToTypePath(oasProperty.$ref);
    return { type: "Plain", valueTypePath: typePath };
  }
  if (!("type" in oasProperty)) {
    return { type: "Plain", valueTypePath: "unknown" };
  }
  if (oasProperty.type === "array") {
    const items = oasProperty.items as oas.Referenced<oas.Oas3_1Schema>;
    const itemType = getFieldType(items);
    return { type: "Array", valueTypePath: itemType.valueTypePath };
  }
  if (oasProperty.type === "string") {
    if (oasProperty.format) {
      if (["date", "date-time"].includes(oasProperty.format)) {
        return {
          type: "Plain",
          valueTypePath: oasProperty.format.replace("-", ""),
        };
      } else {
        console.log("unexpected string format", oasProperty.format);
      }
    }
    return { type: "Plain", valueTypePath: "string" };
  }
  if (oasProperty.type === "integer") {
    const valueTypePath = oasProperty.format || "integer";
    return { type: "Plain", valueTypePath };
  }
  if (oasProperty.type === "number") {
    const valueTypePath =
      (oasProperty.format === "double" ? "float64" : oasProperty.format) ||
      "float64";
    return { type: "Plain", valueTypePath };
  }
  if (oasProperty.type === "boolean") {
    return { type: "Plain", valueTypePath: "boolean" };
  }
  if (oasProperty.type === "object") {
    if ("properties" in oasProperty) {
      console.log("unexpected object property", oasProperty);
    }
    return { type: "Plain", valueTypePath: "object" };
  }
  console.log("unexpected property type");
  return { type: "Plain", valueTypePath: "unknown" };
}

function buildEnum(name: string, oasSchema: oas.Oas3_1Schema): void {
  const def: ir.Enum = { type: "Enum", attributes: {}, name, items: [] };
  if ("x-portone-title" in oasSchema) {
    def.attributes.description = oasSchema["x-portone-title"] as string;
  }
  for (const enumText of oasSchema.enum ?? []) {
    const name = enumText as string;
    const item: ir.EnumItem = { attributes: {}, name };
    def.items.push(item);
    if ("x-portone-enum" in oasSchema) {
      const portoneEnum = (oasSchema as any)["x-portone-enum"];
      const portoneItem = portoneEnum[name];
      if (portoneItem?.title) {
        item.attributes.description = portoneItem.title;
      }
    }
  }
  result.defs[typeNameToDefPath(name)] = def;
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
    inputType: voidType,
    outputType: voidType,
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
  Object.assign(proc, {
    inputType: buildOperationInput(modulePath, name, operation),
    ...buildOperationOutputAndError(modulePath, name, operation),
  });
}

function buildOperationInput(
  modulePath: string,
  operationName: string,
  operation: oas.Oas3Operation,
): ir.Type {
  const name = `${operationName}Input`;
  const defPath = `${modulePath}.${name}`;
  const schema = pickSchema(operation.requestBody);
  if (schema && !operation.parameters) {
    return { type: "Plain", valueTypePath: schemaRefToTypePath(schema.$ref!) };
  }
  if (!schema && operation.parameters) {
    const def: ir.Struct = { type: "Struct", attributes: {}, name, fields: [] };
    for (const parameter_ of operation.parameters) {
      const parameter = parameter_ as oas.Oas3Parameter;
      const field: ir.StructField = {
        attributes: { in: parameter.in as string },
        name: parameter.name,
        fieldType: voidType,
        optional: true,
      };
      if ("x-portone-title" in parameter) {
        field.attributes.summary = parameter["x-portone-title"] as string;
      }
      if ("x-portone-description" in parameter) {
        field.attributes.description =
          parameter["x-portone-description"] as string;
      }
      if (parameter.required) field.optional = false;
      if (parameter.schema) {
        field.fieldType = getFieldType(parameter.schema as oas.Oas3_1Schema);
      }
      def.fields.push(field);
    }
    result.defs[defPath] = def;
    return { type: "Plain", valueTypePath: defPath };
  }
  if (schema && operation.parameters) {
    // TODO: handle path parameters, query parameters
    return { type: "Plain", valueTypePath: schemaRefToTypePath(schema.$ref!) };
  }
  return voidType;
}

function buildOperationOutputAndError(
  modulePath: string,
  operationName: string,
  operation: oas.Oas3Operation,
): Pick<ir.Proc, "outputType" | "errorType"> {
  const responses = operation.responses;
  if (!responses) return { outputType: voidType };
  const { response, error } = splitResponses(responses);
  const outputType = buildOperationOutput(modulePath, operationName, response);
  const errorType = buildOperationError(modulePath, operationName, error);
  return { outputType, errorType };
}

function buildOperationOutput(
  modulePath: string,
  operationName: string,
  responses: oas.Oas3Responses,
): ir.Type {
  const name = `${operationName}Output`;
  const def: ir.Oneof = { type: "Oneof", attributes: {}, name, items: [] };
  for (const [status, response] of Object.entries(responses)) {
    const schema = pickSchema(response);
    if (!schema) continue;
    const itemType: ir.Type = schema
      ? { type: "Plain", valueTypePath: schemaRefToTypePath(schema.$ref!) }
      : voidType;
    const item: ir.OneofItem = { attributes: { status }, itemType };
    if (response.description) {
      item.attributes.description = response.description;
    }
    const example = pickExample(response);
    if (example) item.attributes.example = JSON.stringify(example);
    def.items.push(item);
  }
  if (def.items.length === 0) return voidType;
  const defPath = `${modulePath}.${name}`;
  result.defs[defPath] = def;
  return { type: "Plain", valueTypePath: defPath };
}

function buildOperationError(
  modulePath: string,
  operationName: string,
  responses: oas.Oas3Responses,
): ir.Type {
  const name = `${operationName}Error`;
  const def: ir.Oneof = { type: "Oneof", attributes: {}, name, items: [] };
  for (const [status, response] of Object.entries(responses)) {
    const schema = pickSchema(response);
    if (!schema) continue;
    const itemType: ir.Type = schema
      ? { type: "Plain", valueTypePath: schemaRefToTypePath(schema.$ref!) }
      : voidType;
    const item: ir.OneofItem = { attributes: { status }, itemType };
    if (response.description) {
      item.attributes.description = response.description;
    }
    const example = pickExample(response);
    if (example) item.attributes.example = JSON.stringify(example);
    def.items.push(item);
  }
  if (def.items.length === 0) return voidType;
  const defPath = `${modulePath}.${name}`;
  result.defs[defPath] = def;
  return { type: "Plain", valueTypePath: defPath };
}

function pickSchema(
  requestBodyOrResponse:
    | oas.Referenced<oas.Oas3RequestBody>
    | oas.Oas3Response
    | undefined,
): oas.Referenced<oas.Oas3Schema> | undefined {
  if (!requestBodyOrResponse) return;
  if ("content" in requestBodyOrResponse) {
    const content = requestBodyOrResponse.content?.["application/json"];
    return content?.schema as oas.Referenced<oas.Oas3Schema>;
  }
}

function pickExample(
  requestBodyOrResponse:
    | oas.Referenced<oas.Oas3RequestBody>
    | oas.Oas3Response
    | undefined,
): oas.Oas3Example | undefined {
  if (!requestBodyOrResponse) return;
  if ("content" in requestBodyOrResponse) {
    const content = requestBodyOrResponse.content?.["application/json"];
    return content?.example as oas.Oas3Example;
  }
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
