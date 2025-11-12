import { exists, walkSync } from "jsr:@std/fs@1";
import { dirname, join, relative, resolve, SEPARATOR } from "jsr:@std/path@1";
import { parse as parseYml } from "jsr:@std/yaml@1";
import { pathToFileURL } from "node:url";
import type { ResolveModuleFile } from "../ir-builder.ts";
import type { BdlConfig } from "../generated/config.ts";
import type { BdlIr } from "../generated/ir.ts";
import ir from "../generated/json/ir.json" with { type: "json" };
import parseBon from "../parser/bon/parser.ts";
import { fillBonTypes } from "../bon-typer.ts";
import { toPojo } from "../conventional/bon.ts";

export type { BdlConfig };

export type Paths = Record<
  /* package name */ string,
  /* directory path */ string
>;

export interface LoadBdlConfigResult {
  configDirectory: string;
  bdlConfig: BdlConfig;
}
export async function loadBdlConfig(
  config?: string,
): Promise<LoadBdlConfigResult> {
  const configPath = resolve(config || await findBdlConfigPath());
  const configDirectory = dirname(configPath);
  if (configPath.endsWith(".yml")) {
    const configYmlText = await Deno.readTextFile(configPath);
    const bdlConfig = parseYml(configYmlText) as BdlConfig;
    return { configDirectory, bdlConfig };
  }
  const configBonText = await Deno.readTextFile(configPath);
  const bonValue = fillBonTypes(
    ir as BdlIr,
    parseBon(configBonText),
    "bdl.config.BdlConfig",
  );
  const bdlConfig = toPojo(bonValue, ir as BdlIr) as BdlConfig;
  return { configDirectory, bdlConfig };
}

export async function gatherEntryModulePaths(
  configDirectory: string,
  paths: Paths,
): Promise<string[]> {
  // TODO: make async properly
  return Object.entries(paths).flatMap(
    ([packageName, directoryPath]) => {
      const resolvedDirectoryPath = resolve(configDirectory, directoryPath);
      const bdlFiles = Array.from(
        walkSync(resolvedDirectoryPath, {
          exts: ["bdl"],
          includeDirs: false,
          includeSymlinks: false,
        }),
      ).map((entry) => relative(resolvedDirectoryPath, entry.path));
      return bdlFiles
        .map((path) => path.replace(/\.bdl$/, "").split(SEPARATOR))
        .filter((names) =>
          names.every((name) => name.match(/^[a-z_][a-z0-9_]*$/i))
        )
        .map((names) => [packageName, ...names].join("."));
    },
  );
}

export function getResolveModuleFileFn(
  config: BdlConfig,
  configDirectory: string,
): ResolveModuleFile {
  return async function resolveModuleFile(modulePath) {
    const [packageName, ...fragments] = modulePath.split(".");
    const directoryPath = config.paths[packageName];
    const resolvedDirectoryPath = resolve(configDirectory, directoryPath);
    const filePath = resolve(
      resolvedDirectoryPath,
      fragments.join("/") + ".bdl",
    );
    const fileUrl = pathToFileURL(filePath).toString();
    const text = await Deno.readTextFile(filePath);
    return { fileUrl, text };
  };
}

export async function findBdlConfigPath(
  cwd: string = Deno.cwd(),
): Promise<string> {
  const candidates = getBdlConfigCandidates(cwd);
  for (const path of candidates) {
    if (await exists(path, { isFile: true })) return path;
  }
  return "/bdl.bon" as never;
}

function getBdlConfigCandidates(cwd: string): string[] {
  const result: string[] = [];
  let dir = cwd;
  while (true) {
    result.push(join(dir, `bdl.bon`));
    result.push(join(dir, `bdl.yml`));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return result;
}
