import { dirname, resolve } from "jsr:@std/path@1";
import { buildBdlIr, type BuildBdlIrResult } from "../ir-builder.ts";
import {
  findBdlConfigPath,
  gatherEntryModulePaths,
  getResolveModuleFileFn,
  loadBdlConfig,
} from "./config.ts";

export interface BuildIrOptions {
  config?: string;
  standard: string;
  omitFileUrl?: boolean;
}
export async function buildIr(
  options: BuildIrOptions,
): Promise<BuildBdlIrResult> {
  const configPath = resolve(options.config || await findBdlConfigPath());
  const configDirectory = dirname(configPath);
  const configYml = await loadBdlConfig(configPath);
  const entryModulePaths = await gatherEntryModulePaths(
    configDirectory,
    configYml.paths,
  );
  const resolveModuleFile = getResolveModuleFileFn(
    configYml,
    configDirectory,
  );
  const buildResult = await buildBdlIr({
    entryModulePaths,
    resolveModuleFile,
    filterModule: (config) => config.attributes.standard === options.standard,
  });
  if (options.omitFileUrl) {
    for (const module of Object.values(buildResult.ir.modules)) {
      delete module.fileUrl;
    }
  }
  return buildResult;
}
