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
} from "../src/config.ts";
import { generateTs } from "../src/generator/ts/ts-generator.ts";

const irCommand = new Command()
  .description("Print BDL IR")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Target standard",
    { default: "conventional" },
  )
  .option("-p, --pretty", "Pretty print the IR")
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
    "Target standard",
    { default: "conventional" },
  )
  .option(
    "-o, --out <path:string>",
    "Output directory for the generated files",
    { default: "./out" },
  )
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { files } = generateTs({ ir });
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
  return await buildBdlIr({
    entryModulePaths,
    resolveModuleFile,
    filterModule: (config) => config.attributes.standard === options.standard,
  });
}
