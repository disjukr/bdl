import { getImportPaths } from "./ast-utils";
import { JclAst } from "./model/ast";
import { JclIr } from "./model/ir";
import parseJcl from "./parser/jcl-parser";

export interface ResolveModuleFileResult {
  fileUrl?: string;
  text: string;
}
export type ResolveModuleFile = (
  modulePath: string
) => Promise<ResolveModuleFileResult>;

export interface BuildJclIrConfig {
  entryModulePaths: string[];
  resolveModuleFile: ResolveModuleFile;
}
export interface BuildJclIrResult {
  asts: Record<string, JclAst>;
  ir: JclIr;
}
export async function buildJclIr(
  config: BuildJclIrConfig
): Promise<BuildJclIrResult> {
  const asts: Record<string, JclAst> = {};
  const ir: JclIr = {
    modules: {},
    defs: {},
  };
  // TODO
  return { asts, ir };
}

interface GatherConfig extends BuildJclIrConfig {}
interface ModuleFile extends ResolveModuleFileResult {
  ast: JclAst;
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
    const ast = parseJcl(resolveModuleFileResult.text);
    yield { ...resolveModuleFileResult, ast };
    const importPaths = getImportPaths(resolveModuleFileResult.text, ast);
    queue.push(...importPaths);
  }
}
