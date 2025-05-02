import { dirname, fromFileUrl } from "jsr:@std/path@1";
import { parse as parseYml } from "jsr:@std/yaml";
import * as oas from "npm:@redocly/openapi-core@1.34.1/lib/typings/openapi";
import * as ir from "@disjukr/bdl/ir";
import { writeIrToBdlFiles } from "@disjukr/bdl/io/ir";
import { resolve } from "jsr:@std/path/resolve";
import { listEveryMissingExternalTypePaths } from "../../../bdl-ts/src/ir-analyzer.ts";

const petstoreApiYaml = await Deno.readTextFile(
  new URL("../tmp/openapi.yaml", import.meta.url),
);
const petstoreApi = parseYml(petstoreApiYaml) as oas.Oas3_1Definition;
const modulePathPrefix = `swagger.petstore`;
const result: ir.BdlIr = { modules: {}, defs: {} };
const voidType: ir.Type = { type: "Plain", valueTypePath: "void" };

const registeredDefs = new Set<string>();
function registerDef(defPath: string, def: ir.Def) {
  if (registeredDefs.has(defPath)) {
    console.log(`Def conflict detected: ${defPath}`);
    return;
  }
  registeredDefs.add(defPath);
  result.defs[defPath] = def;
  const modulePath = defPath.split(".").slice(0, -1).join(".");
  const module = result.modules[modulePath] ??= {
    attributes: { standard: "swagger-petstore" },
    defPaths: [],
    imports: [],
  };
  module.defPaths.push(defPath);
}

const oasSchemas = petstoreApi.components?.schemas ?? {};
for (const [name, oasSchema_] of Object.entries(oasSchemas)) {
  const oasSchema = oasSchema_ as oas.Oas3_1Schema;
  const kind = which(oasSchema);
  if (kind === "struct") buildStruct(name, oasSchema);
}

for (const [httpPath, pathItem] of Object.entries(petstoreApi.paths || {})) {
  for (const [httpMethod, operation] of Object.entries(pathItem)) {
    buildOperation(httpPath, httpMethod, operation);
  }
}

// fill missing modules
for (const defPath of Object.keys(result.defs)) {
  const modulePath = defPath.split(".").slice(0, -1).join(".");
  const module = result.modules[modulePath] ??= {
    attributes: { standard: "swagger-petstore" },
    defPaths: [],
    imports: [],
  };
  if (!module.defPaths.includes(defPath)) module.defPaths.push(defPath);
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

function buildStruct(name: string, oasSchema: oas.Oas3_1Schema): void {
  const def: ir.Struct = { type: "Struct", attributes: {}, name, fields: [] };
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
    if ("example" in oasProperty) {
      field.attributes.example = JSON.stringify(oasProperty.example);
    }
    if ("description" in oasProperty) {
      field.attributes.description = oasProperty.description as string;
    }
    if ("enum" in oasProperty && oasProperty.enum) {
      const enumName = `${name}${camelToPascal(fieldName)}`;
      const enumTypePath = typeNameToDefPath(enumName);
      registerDef(enumTypePath, {
        type: "Enum",
        attributes: {},
        name: enumName,
        items: (oasProperty.enum as string[]).map((name) => ({
          attributes: {},
          name,
        })),
      });
      def.fields.push({
        ...field,
        fieldType: { type: "Plain", valueTypePath: enumTypePath },
      });
      continue;
    }
    def.fields.push(field);
  }
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
    if (oasProperty.enum) {
      const matchedEnum = Object.entries(result.defs).filter(([, def]) =>
        def.type === "Enum"
      ).find(([, value]) => {
        const items = (value as ir.Enum).items.map(({ name }) => name);
        return (oasProperty.enum as string[]).every((item) =>
          items.includes(item)
        );
      });
      if (matchedEnum) return { type: "Plain", valueTypePath: matchedEnum[0] };
    }
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

function buildOperation(
  httpPath: string,
  httpMethod: string,
  operation: oas.Oas3Operation,
): void {
  const name = camelToPascal(operation.operationId || "");
  const modulePath = tagToModulePath(operation.tags?.[0] || "data");
  const defPath = `${modulePath}.${name}`;
  const proc: ir.Proc = {
    type: "Proc",
    attributes: {},
    name,
    inputType: voidType,
    outputType: voidType,
  };
  proc.attributes.http = `${httpMethod.toUpperCase()} ${httpPath}`;
  if (operation.security) {
    const items: string[] = [];
    for (const requirement of operation.security) {
      for (const [key, value] of Object.entries(requirement)) {
        if (value.length) items.push(`${key}: ${value.join(", ")}`);
        else items.push(key);
      }
    }
    proc.attributes.security = items.join("\n");
  }
  if (operation.tags) proc.attributes.tags = operation.tags.join(", ");
  if (operation.summary) proc.attributes.summary = operation.summary;
  if (operation.description) {
    proc.attributes.description = operation.description;
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
    if ("$ref" in schema) {
      return {
        type: "Plain",
        valueTypePath: schemaRefToTypePath(schema.$ref!),
      };
    }
    const nonRefSchema = schema as oas.Oas3_1Schema;
    if (which(nonRefSchema) === "struct") {
      const requestBodyTypeName = `${operationName}Body`;
      buildStruct(requestBodyTypeName, schema as oas.Oas3_1Schema);
      return { type: "Plain", valueTypePath: requestBodyTypeName };
    }
    return getFieldType(nonRefSchema);
  }
  if (!schema && operation.parameters) {
    const fields = getStructFields(operation.parameters);
    const def: ir.Struct = { type: "Struct", attributes: {}, name, fields };
    result.defs[defPath] = def;
    return { type: "Plain", valueTypePath: defPath };
  }
  if (schema && operation.parameters) {
    const originalTypePath = schemaRefToTypePath(schema.$ref!);
    const originalDef = result.defs[originalTypePath] as ir.Struct;
    if (originalDef.type !== "Struct") {
      throw new Error(`expected struct for ${originalTypePath}`);
    }
    const fields = getStructFields(operation.parameters);
    const def: ir.Struct = { ...originalDef, fields };
    def.name = name;
    def.fields.push(...originalDef.fields);
    result.defs[defPath] = def;
    return { type: "Plain", valueTypePath: defPath };
  }
  return voidType;
}

function getStructFields(
  parameters: oas.Referenced<oas.Oas3Parameter>[],
): ir.StructField[] {
  const fields: ir.StructField[] = [];
  for (const parameter_ of parameters) {
    const parameter = parameter_ as oas.Oas3Parameter;
    const field: ir.StructField = {
      attributes: { in: parameter.in as string },
      name: parameter.name,
      fieldType: voidType,
      optional: true,
    };
    if (parameter.required) field.optional = false;
    if (parameter.schema) {
      field.fieldType = getFieldType(parameter.schema as oas.Oas3_1Schema);
    }
    if (parameter.description) {
      field.attributes.description = parameter.description as string;
    }
    fields.push(field);
  }
  return fields;
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
    const itemType: ir.Type = (() => {
      if (!schema) return voidType;
      if ("$ref" in schema) {
        return {
          type: "Plain",
          valueTypePath: schemaRefToTypePath(schema.$ref!),
        };
      }
      const nonRefSchema = schema as oas.Oas3_1Schema;
      if (which(nonRefSchema) === "dictionary") {
        return {
          type: "Dictionary",
          keyTypePath: "string",
          valueTypePath:
            getFieldType(schema.additionalProperties as oas.Oas3_1Schema)
              .valueTypePath,
        };
      }
      return getFieldType(nonRefSchema);
    })();
    const item: ir.OneofItem = { attributes: { status }, itemType };
    if (response.description) {
      item.attributes.description = response.description;
    }
    if (response.headers) {
      console.log("headers in responses are not implemented yet");
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
    const itemType: ir.Type = (() => {
      if (!schema) return voidType;
      return {
        type: "Plain",
        valueTypePath: schemaRefToTypePath(schema.$ref!),
      };
    })();
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
  return statusCode.startsWith("4") || statusCode.startsWith("5") ||
    statusCode === "default";
}

function camelToPascal(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function tagToModulePath(tag: string): string {
  return `${modulePathPrefix}.${tag}`;
}

function schemaRefToTypePath(ref: string): string {
  const typeName = ref.split("/").pop()!;
  return typeNameToDefPath(typeName);
}

function typeNameToDefPath(typeName: string): string {
  return `${modulePathPrefix}.entity.${typeName}`;
}
