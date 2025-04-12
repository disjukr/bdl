import { ensureDir } from "jsr:@std/fs@1";
import { dirname, resolve } from "jsr:@std/path@1";
import type * as ir from "../generated/ir.ts";
import { buildBdlIr, type BuildBdlIrResult } from "../ir-builder.ts";
import { moduleToString } from "../ir-stringifier.ts";
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
