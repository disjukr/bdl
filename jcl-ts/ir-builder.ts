import { JclAst } from "./model/ast";
import { JclIr } from "./model/ir";

export interface ResolveModuleFileResult {
  fileUrl?: string;
  text: string;
}
export type ResolveModuleFile = (
  modulePath: string
) => Promise<ResolveModuleFileResult>;

export interface BuildConfig {
  entryModulePaths: string[];
  resolveModuleFile: ResolveModuleFile;
}
export interface BuildResult {
  asts: Record<string, JclAst>;
  ir: JclIr;
}
export async function build(config: BuildConfig): Promise<BuildResult> {
  const asts: Record<string, JclAst> = {};
  const ir: JclIr = {
    modules: {},
    defs: {},
  };
  // TODO
  return { asts, ir };
}
