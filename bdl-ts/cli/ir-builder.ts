import { dirname, resolve } from "jsr:@std/path";
import { buildBdlIr } from "../src/ir-builder.ts";
import {
  gatherEntryModulePaths,
  getResolveModuleFileFn,
  loadBdlConfig,
} from "../src/config.ts";

const [configPath] = Deno.args;
if (!configPath) {
  console.error("No config path provided.");
  Deno.exit(1);
}
const configDirectory = dirname(resolve(configPath));
const configYml = await loadBdlConfig(configPath);

const entryModulePaths = await gatherEntryModulePaths(
  configDirectory,
  configYml.paths,
);
const resolveModuleFile = getResolveModuleFileFn(configYml, configDirectory);

const result = await buildBdlIr({ entryModulePaths, resolveModuleFile });

console.log(JSON.stringify(result.ir, null, 2));
