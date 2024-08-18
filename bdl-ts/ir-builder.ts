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
  const ir: ir.BdlIr = {
    modules: {},
    defs: {},
  };
  for await (const moduleFile of gather(config)) {
    const { fileUrl, text, modulePath, ast } = moduleFile;
    asts[modulePath] = ast;
    const attributes = buildAttributes(text, ast.attributes);
    const imports = ast.statements
      .filter(isImport)
      .map((importNode) => buildImport(text, importNode));
    const module: ir.Module = {
      fileUrl,
      attributes,
      defPaths: [], // TODO
      imports,
    };
    ir.modules[modulePath] = module;
  }
  return { asts, ir };
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
