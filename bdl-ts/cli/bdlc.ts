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

const irCommand = new Command()
  .description("Print BDL IR")
  .arguments("[configPath:string]")
  .option("-p, --pretty", "Pretty print the IR")
  .action(async (options, configPathArg) => {
    const configPath = resolve(configPathArg || await findBdlConfigPath());
    const result = await buildIr(configPath);
    const json = options.pretty
      ? JSON.stringify(result.ir, null, 2)
      : JSON.stringify(result.ir);
    console.log(json);
  });

const tsCommand = new Command()
  .description("Compile BDL to TypeScript")
  .arguments("[configPath:string]")
  .action(async (_options, configPathArg) => {
    const configPath = resolve(configPathArg || await findBdlConfigPath());
    const result = await buildIr(configPath);
    console.log(result); // TODO
  });

await new Command()
  .name("bdlc")
  .version(denoJson.version)
  .description("BDL Compiler")
  .command("ir", irCommand)
  .command("ts", tsCommand)
  .parse();

async function buildIr(configPath: string): Promise<BuildBdlIrResult> {
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
  return await buildBdlIr({ entryModulePaths, resolveModuleFile });
}
