import {
  getAttributeContent,
  getImportPaths,
  isImport,
  pathItemsToString,
  span,
} from "./ast-utils.ts";
import type * as ast from "./ast.ts";
import type * as ir from "./ir.ts";
import parseBdl from "./parser/bdl-parser.ts";

export interface ResolveModuleFileResult {
  fileUrl?: string;
  text: string;
}
export type ResolveModuleFile = (
  modulePath: string,
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
  config: BuildBdlIrConfig,
): Promise<BuildBdlIrResult> {
  const asts: Record<string, ast.BdlAst> = {};
  const ir: ir.BdlIr = { modules: {}, defs: {} };
  for await (const moduleFile of gather(config)) {
    const { fileUrl, text, modulePath, ast } = moduleFile;
    asts[modulePath] = ast;
    const attributes = buildAttributes(text, ast.attributes);
    const defStatements = ast.statements.filter(
      (s): s is ast.ModuleLevelStatement & { name: ast.Span } => "name" in s,
    );
    const localDefNames: Set<string> = new Set(
      defStatements.map((statement) => span(text, statement.name)),
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
  typeNameToPath: (typeName: string) => string,
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
    typeNameToPath: (typeName: string) => string,
  ) => ir.DefBody)
  | undefined
> = {
  Enum: buildEnum,
  Import: undefined,
  Oneof: buildOneof,
  Proc: buildProc,
  Scalar: buildScalar,
  Socket: buildSocket,
  Struct: buildStruct,
  Union: buildUnion,
};

function buildEnum(text: string, statement: ast.Enum): ir.Enum {
  return {
    type: "Enum",
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
      name: span(text, item.name),
    })),
  };
}

function buildOneof(
  text: string,
  statement: ast.Oneof,
  typeNameToPath: (typeName: string) => string,
): ir.Oneof {
  return {
    type: "Oneof",
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
      type: buildType(text, item.type, typeNameToPath),
    })),
  };
}

function buildProc(
  text: string,
  statement: ast.Proc,
  typeNameToPath: (typeName: string) => string,
): ir.Proc {
  return {
    type: "Proc",
    inputType: buildType(text, statement.inputType, typeNameToPath),
    outputType: buildType(text, statement.outputType, typeNameToPath),
    errorType: statement.error &&
      buildType(text, statement.error.errorType, typeNameToPath),
  };
}

function buildScalar(
  text: string,
  statement: ast.Scalar,
  typeNameToPath: (typeName: string) => string,
): ir.Scalar {
  return {
    type: "Scalar",
    scalarType: buildType(text, statement.scalarType, typeNameToPath),
  };
}

function buildSocket(
  text: string,
  statement: ast.Socket,
  typeNameToPath: (typeName: string) => string,
): ir.Socket {
  return {
    type: "Socket",
    serverMessageType: buildType(
      text,
      statement.serverMessageType,
      typeNameToPath,
    ),
    clientMessageType: buildType(
      text,
      statement.clientMessageType,
      typeNameToPath,
    ),
  };
}

function buildStruct(
  text: string,
  statement: ast.Struct,
  typeNameToPath: (typeName: string) => string,
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
  typeNameToPath: (typeName: string) => string,
): ir.StructField {
  return {
    attributes: buildAttributes(text, field.attributes),
    name: span(text, field.name),
    itemType: buildType(text, field.itemType, typeNameToPath),
    optional: Boolean(field.question),
  };
}

function buildUnion(
  text: string,
  statement: ast.Union,
  typeNameToPath: (typeName: string) => string,
): ir.Union {
  return {
    type: "Union",
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
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
  typeNameToPath: (typeName: string) => string,
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
  attributes: ast.Attribute[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attribute of attributes) {
    result[span(text, attribute.id)] = getAttributeContent(text, attribute);
  }
  return result;
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
