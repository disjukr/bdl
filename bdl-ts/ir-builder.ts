import {
  getAttributeContent,
  getImportPaths,
  isImport,
  pathItemsToString,
  span,
} from "./ast-utils";
import * as ast from "./model/ast";
import * as ir from "./model/ir";
import parseBdl from "./parser/bdl-parser";

export interface ResolveModuleFileResult {
  fileUrl?: string;
  text: string;
}
export type ResolveModuleFile = (
  modulePath: string
) => Promise<ResolveModuleFileResult>;

export interface BuildBdlIrConfig {
  entryModulePaths: string[];
  resolveModuleFile: ResolveModuleFile;
}
export interface BuildBdlIrResult {
  asts: Record<string, ast.BdlAst>;
  ir: ir.BdlIr;
}
export async function buildBdlIr(
  config: BuildBdlIrConfig
): Promise<BuildBdlIrResult> {
  const asts: Record<string, ast.BdlAst> = {};
  const ir: ir.BdlIr = { modules: {}, defs: {} };
  for await (const moduleFile of gather(config)) {
    const { fileUrl, text, modulePath, ast } = moduleFile;
    asts[modulePath] = ast;
    const attributes = buildAttributes(text, ast.attributes);
    const defStatements = ast.statements.filter(
      (s): s is ast.ModuleLevelStatement & { name: ast.Span } => "name" in s
    );
    const localDefNames: Set<string> = new Set(
      defStatements.map((statement) => span(text, statement.name))
    );
    const imports = ast.statements
      .filter(isImport)
      .map((importNode) => buildImport(text, importNode));
    const importedNames: Record<string, string> = {};
    for (const importStatement of imports) {
      for (const importItem of importStatement.items) {
        const typePath = `${importStatement.modulePath}.${importItem.name}`;
        if (importItem.as) importedNames[importItem.as] = typePath;
        else importedNames[importItem.name] = typePath;
      }
    }
    const typeNameToPath = (typeName: string) => {
      if (localDefNames.has(typeName)) return `${modulePath}.${typeName}`;
      if (typeName in importedNames) return importedNames[typeName];
      return typeName; // primitive types or unknown types
    };
    const defPaths: string[] = [];
    for (const statement of defStatements) {
      const def = buildDef(text, statement, typeNameToPath);
      if (!def) continue;
      const defPath = `${modulePath}.${def.name}`;
      defPaths.push(defPath);
      ir.defs[defPath] = def;
    }
    const module: ir.Module = { fileUrl, attributes, defPaths, imports };
    ir.modules[modulePath] = module;
  }
  return { asts, ir };
}

function buildDef(
  text: string,
  statement: ast.ModuleLevelStatement & { name: ast.Span },
  typeNameToPath: (typeName: string) => string
): ir.Def | undefined {
  const buildDefBody = buildDefBodyFns[statement.type];
  if (!buildDefBody) return;
  const attributes = buildAttributes(text, statement.attributes);
  const name = span(text, statement.name);
  const body = buildDefBody(text, statement, typeNameToPath);
  return { attributes, name, body };
}

const buildDefBodyFns: Record<
  ast.ModuleLevelStatement["type"],
  | ((
      text: string,
      statement: any,
      typeNameToPath: (typeName: string) => string
    ) => ir.DefBody)
  | undefined
> = {
  Enum: buildEnum,
  Import: undefined,
  Rpc: buildRpc,
  Scalar: buildScalar,
  Socket: undefined, // TODO
  Struct: buildStruct,
  Union: buildUnion,
};

function buildEnum(text: string, statement: ast.Enum): ir.Enum {
  return {
    type: "Enum",
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
      name: span(text, item.name),
      value: JSON.parse(span(text, item.value)),
    })),
  };
}

function buildRpc(
  text: string,
  statement: ast.Rpc,
  typeNameToPath: (typeName: string) => string
): ir.Rpc {
  return {
    type: "Rpc",
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
      name: span(text, item.name),
      stream: Boolean(item.keywordStream),
      inputFields: item.inputFields.map((field) =>
        buildStructField(text, field, typeNameToPath)
      ),
      outputType: buildType(text, item.outputType, typeNameToPath),
      errorType:
        item.error && buildType(text, item.error.errorType, typeNameToPath),
    })),
  };
}

function buildScalar(
  text: string,
  statement: ast.Scalar,
  typeNameToPath: (typeName: string) => string
): ir.Scalar {
  return {
    type: "Scalar",
    scalarType: buildType(text, statement.scalarType, typeNameToPath),
  };
}

function buildStruct(
  text: string,
  statement: ast.Struct,
  typeNameToPath: (typeName: string) => string
): ir.Struct {
  return {
    type: "Struct",
    fields: statement.fields.map((field) =>
      buildStructField(text, field, typeNameToPath)
    ),
  };
}

function buildStructField(
  text: string,
  field: ast.StructField,
  typeNameToPath: (typeName: string) => string
): ir.StructField {
  return {
    attributes: buildAttributes(text, field.attributes),
    name: span(text, field.name),
    itemType: buildType(text, field.itemType, typeNameToPath),
    nullPolicy: field.nullPolicySymbol
      ? span(text, field.nullPolicySymbol) === "?"
        ? { type: "Allow" }
        : { type: "Throw" }
      : { type: "UseDefaultValue" },
  };
}

function buildUnion(
  text: string,
  statement: ast.Union,
  typeNameToPath: (typeName: string) => string
): ir.Union {
  return {
    type: "Union",
    discriminatorKey:
      statement.discriminatorKey &&
      JSON.parse(span(text, statement.discriminatorKey)),
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
      jsonKey: item.jsonKey && JSON.parse(span(text, item.jsonKey)),
      name: span(text, item.name),
      fields:
        item.struct?.fields.map((field) =>
          buildStructField(text, field, typeNameToPath)
        ) || [],
    })),
  };
}

function buildType(
  text: string,
  type: ast.TypeExpression,
  typeNameToPath: (typeName: string) => string
): ir.Type {
  const valueTypePath = typeNameToPath(span(text, type.valueType));
  if (!type.container) return { type: "Plain", valueTypePath };
  if (!type.container.keyType) return { type: "Array", valueTypePath };
  const keyTypePath = typeNameToPath(span(text, type.container.keyType));
  return { type: "Dictionary", valueTypePath, keyTypePath };
}

function buildImport(text: string, importNode: ast.Import): ir.Import {
  const attributes = buildAttributes(text, importNode.attributes);
  const modulePath = pathItemsToString(text, importNode.path);
  const items = importNode.items.map((item) => ({
    name: span(text, item.name),
    as: item.alias && span(text, item.alias.name),
  }));
  return { attributes, modulePath, items };
}

function buildAttributes(
  text: string,
  attributes: ast.Attribute[]
): ir.Attribute[] {
  return attributes.map((attribute) => buildAttribute(text, attribute));
}

function buildAttribute(text: string, attribute: ast.Attribute): ir.Attribute {
  return {
    id: span(text, attribute.id),
    content: getAttributeContent(text, attribute),
  };
}

interface GatherConfig extends BuildBdlIrConfig {}
interface ModuleFile extends ResolveModuleFileResult {
  modulePath: string;
  ast: ast.BdlAst;
}
async function* gather(config: GatherConfig): AsyncGenerator<ModuleFile> {
  const { entryModulePaths, resolveModuleFile } = config;
  const queue = [...entryModulePaths];
  const visited: Set<string> = new Set();
  while (queue.length) {
    const modulePath = queue.pop()!;
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);
    const resolveModuleFileResult = await resolveModuleFile(modulePath);
    const ast = parseBdl(resolveModuleFileResult.text);
    yield { ...resolveModuleFileResult, modulePath, ast };
    const importPaths = getImportPaths(resolveModuleFileResult.text, ast);
    queue.push(...importPaths);
  }
}
