import {
  getAttributeContent,
  getImportPaths,
  isImport,
  pathItemsToString,
  span,
} from "./ast/misc.ts";
import type * as ast from "./generated/ast.ts";
import type * as ir from "./generated/ir.ts";
import parseBdl from "./parser/bdl-parser.ts";

export interface ModuleFile {
  fileUrl?: string;
  text: string;
}
export type ResolveModuleFile = (
  modulePath: string,
) => Promise<ModuleFile>;

export interface FilterModuleParams {
  modulePath: string;
  attributes: Record<string, string>;
}

export interface BuildBdlIrConfig {
  entryModulePaths: string[];
  resolveModuleFile: ResolveModuleFile;
  filterModule?: (params: FilterModuleParams) => boolean;
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
    const { text, modulePath, ast } = moduleFile;
    asts[modulePath] = ast;
    const attributes = buildAttributes(text, ast.attributes);
    if (config.filterModule) {
      const filterModuleParams: FilterModuleParams = { modulePath, attributes };
      if (!config.filterModule(filterModuleParams)) continue;
    }
    ir.modules[modulePath] = buildModule(
      moduleFile,
      (defPath, def) => (ir.defs[defPath] = def),
    );
  }
  return { asts, ir };
}

export interface ParsedModuleFile extends ModuleFile {
  modulePath: string;
  ast: ast.BdlAst;
}
export function buildModule(
  moduleFile: ParsedModuleFile,
  emitDef: (defPath: string, def: ir.Def) => void,
): ir.Module {
  const { fileUrl, text, modulePath, ast } = moduleFile;
  const attributes = buildAttributes(text, ast.attributes);
  const imports = buildImports(text, ast);
  const defStatements = getDefStatements(ast);
  const localDefNames = getLocalDefNames(text, defStatements);
  const typeNameToPath = getTypeNameToPathFn(
    modulePath,
    imports,
    localDefNames,
  );
  const defPaths: string[] = [];
  for (const statement of defStatements) {
    const def = buildDef(text, statement, typeNameToPath);
    if (!def) continue;
    const defPath = `${modulePath}.${def.name}`;
    defPaths.push(defPath);
    emitDef(defPath, def);
  }
  return { fileUrl, attributes, defPaths, imports };
}

export type TypeNameToPathFn = (typeName: string) => string;
export function getTypeNameToPathFn(
  modulePath: string,
  imports: ir.Import[],
  localDefNames: Set<string>,
): TypeNameToPathFn {
  const importedNames: Record<string, string> = {};
  for (const importStatement of imports) {
    for (const importItem of importStatement.items) {
      const typePath = `${importStatement.modulePath}.${importItem.name}`;
      if (importItem.as) importedNames[importItem.as] = typePath;
      else importedNames[importItem.name] = typePath;
    }
  }
  return function typeNameToPath(typeName) {
    if (localDefNames.has(typeName)) return `${modulePath}.${typeName}`;
    if (typeName in importedNames) return importedNames[typeName];
    return typeName; // primitive types or unknown types
  };
}
export function getLocalDefNames(
  text: string,
  defStatements: DefStatement[],
): Set<string> {
  return new Set(defStatements.map((statement) => span(text, statement.name)));
}
export type DefStatement = ast.ModuleLevelStatement & { name: ast.Span };
export function getDefStatements(ast: ast.BdlAst): DefStatement[] {
  return ast.statements.filter((s): s is DefStatement => "name" in s);
}

export function buildImports(text: string, ast: ast.BdlAst): ir.Import[] {
  return ast.statements
    .filter(isImport)
    .map((importNode) => buildImport(text, importNode));
}

function buildDef(
  text: string,
  statement: ast.ModuleLevelStatement & { name: ast.Span },
  typeNameToPath: TypeNameToPathFn,
): ir.Def | undefined {
  const buildDefBody = buildDefFns[statement.type];
  if (!buildDefBody) return;
  const attributes = buildAttributes(text, statement.attributes);
  const name = span(text, statement.name);
  const body = buildDefBody(text, statement, typeNameToPath);
  return { attributes, name, ...body } as ir.Def;
}

const buildDefFns: Record<
  ast.ModuleLevelStatement["type"],
  | ((
    text: string,
    statement: any,
    typeNameToPath: TypeNameToPathFn,
  ) => Omit<ir.Def, "attributes" | "name">)
  | undefined
> = {
  Custom: buildCustom,
  Enum: buildEnum,
  Import: undefined,
  Oneof: buildOneof,
  Proc: buildProc,
  Struct: buildStruct,
  Union: buildUnion,
};

function buildCustom(
  text: string,
  statement: ast.Custom,
  typeNameToPath: TypeNameToPathFn,
): Omit<ir.Custom, "attributes" | "name"> {
  return {
    type: "Custom",
    originalType: buildType(text, statement.originalType, typeNameToPath),
  };
}

function buildEnum(
  text: string,
  statement: ast.Enum,
): Omit<ir.Enum, "attributes" | "name"> {
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
  typeNameToPath: TypeNameToPathFn,
): Omit<ir.Oneof, "attributes" | "name"> {
  return {
    type: "Oneof",
    items: statement.items.map((item) => ({
      attributes: buildAttributes(text, item.attributes),
      itemType: buildType(text, item.itemType, typeNameToPath),
    })),
  };
}

function buildProc(
  text: string,
  statement: ast.Proc,
  typeNameToPath: TypeNameToPathFn,
): Omit<ir.Proc, "attributes" | "name"> {
  return {
    type: "Proc",
    inputType: buildType(text, statement.inputType, typeNameToPath),
    outputType: buildType(text, statement.outputType, typeNameToPath),
    errorType: statement.error &&
      buildType(text, statement.error.errorType, typeNameToPath),
  };
}

function buildStruct(
  text: string,
  statement: ast.Struct,
  typeNameToPath: TypeNameToPathFn,
): Omit<ir.Struct, "attributes" | "name"> {
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
  typeNameToPath: TypeNameToPathFn,
): ir.StructField {
  return {
    attributes: buildAttributes(text, field.attributes),
    name: span(text, field.name),
    fieldType: buildType(text, field.fieldType, typeNameToPath),
    optional: Boolean(field.question),
  };
}

function buildUnion(
  text: string,
  statement: ast.Union,
  typeNameToPath: TypeNameToPathFn,
): Omit<ir.Union, "attributes" | "name"> {
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
  typeNameToPath: TypeNameToPathFn,
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
    result[span(text, attribute.name)] = getAttributeContent(text, attribute);
  }
  return result;
}

interface GatherConfig extends BuildBdlIrConfig {}
async function* gather(config: GatherConfig): AsyncGenerator<ParsedModuleFile> {
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
