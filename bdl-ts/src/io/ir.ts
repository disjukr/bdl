import { ensureDir } from "jsr:@std/fs@1";
import { dirname, resolve } from "jsr:@std/path@1";
import type { BdlConfig } from "../generated/config.ts";
import type * as ir from "../generated/ir.ts";
import { buildBdlIr, type BuildBdlIrResult } from "../ir-builder.ts";
import { moduleToString } from "../ir-stringifier.ts";
import {
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
  const { config, standard, omitFileUrl } = options;
  const { configDirectory, configYml } = await loadBdlConfig(config);
  return buildIrWithConfigObject({
    configDirectory,
    configYml,
    standard,
    omitFileUrl,
  });
}

export interface BuildIrWithConfigObjectOptions {
  configDirectory: string;
  configYml: BdlConfig;
  standard: string;
  omitFileUrl?: boolean;
}
export async function buildIrWithConfigObject(
  options: BuildIrWithConfigObjectOptions,
): Promise<BuildBdlIrResult> {
  const { configDirectory, configYml, standard, omitFileUrl } = options;
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
    filterModule: (config) => config.attributes.standard === standard,
  });
  if (omitFileUrl) {
    for (const module of Object.values(buildResult.ir.modules)) {
      delete module.fileUrl;
    }
  }
  return buildResult;
}

interface WriteIrToBdlFilesConfig {
  ir: ir.BdlIr;
  outputDirectory: string;
  stripComponents?: number;
}
export async function writeIrToBdlFiles(
  config: WriteIrToBdlFilesConfig,
): Promise<void> {
  const { ir, outputDirectory, stripComponents = 0 } = config;
  for (const modulePath of Object.keys(ir.modules)) {
    const filePath = resolve(
      outputDirectory,
      modulePath.split(".").slice(stripComponents).join("/") + ".bdl",
    );
    await ensureDir(dirname(filePath));
    await Deno.writeTextFile(filePath, moduleToString(ir, modulePath));
  }
}
