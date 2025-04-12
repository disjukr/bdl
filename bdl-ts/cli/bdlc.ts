import { ensureDir } from "jsr:@std/fs";
import { dirname, resolve } from "jsr:@std/path";
import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import denoJson from "../deno.json" with { type: "json" };
import { buildBdlIr, type BuildBdlIrResult } from "../src/ir-builder.ts";
import {
  findBdlConfigPath,
  gatherEntryModulePaths,
  getResolveModuleFileFn,
  loadBdlConfig,
} from "../src/io/config.ts";
import { generateTs } from "../src/generator/ts/ts-generator.ts";

const irCommand = new Command()
  .description("Print BDL IR")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option("-p, --pretty", "Pretty print the IR")
  .option("--omit-file-url", "Omit fileUrl field from the IR")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const json = options.pretty
      ? JSON.stringify(ir, null, 2)
      : JSON.stringify(ir);
    console.log(json);
  });

const tsCommand = new Command()
  .description("Compile BDL to TypeScript")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option(
    "-o, --out <path:string>",
    "Output directory for the generated files",
    { default: "./out" },
  )
  .option(
    "--file-extension <extension:string>",
    "File extension for the generated files",
    { default: ".ts" },
  )
  .option(
    "--import-path-suffix <suffix:string>",
    "Suffix to append to the import path",
    { default: "" },
  )
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { fileExtension, importPathSuffix } = options;
    const { files } = generateTs({ ir, fileExtension, importPathSuffix });
    const outDirectory = resolve(options.out);
    for (const [filePath, ts] of Object.entries(files)) {
      const outPath = resolve(outDirectory, filePath);
      await ensureDir(dirname(outPath));
      await Deno.writeTextFile(outPath, ts);
    }
  });

await new Command()
  .name("bdlc")
  .usage("<command> [args...]")
  .version(denoJson.version)
  .description("BDL Compiler")
  .action(function () {
    this.showHelp();
  })
  .command("ir", irCommand)
  .command("ts", tsCommand)
  .parse();

interface BuildIrOptions {
  config?: string;
  standard: string;
  omitFileUrl?: boolean;
}
async function buildIr(options: BuildIrOptions): Promise<BuildBdlIrResult> {
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
