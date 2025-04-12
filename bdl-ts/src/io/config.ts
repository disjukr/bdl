import { exists, walkSync } from "jsr:@std/fs@1";
import { dirname, join, relative, resolve } from "jsr:@std/path@1";
import { parse as parseYml } from "jsr:@std/yaml@1";
import { pathToFileURL } from "node:url";
import type { ResolveModuleFile } from "../ir-builder.ts";

export interface BdlConfig {
  paths: Paths;
  primitives?: string[];
}

export type Paths = Record<
  /* package name */ string,
  /* directory path */ string
>;

export async function loadBdlConfig(
  configPath: string,
): Promise<BdlConfig> {
  const yaml = await Deno.readTextFile(configPath);
  return parseYml(yaml) as BdlConfig;
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
        .map((path) => path.replace(/\.bdl$/, "").split("/"))
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
  return "/bdl.yml" as never;
}

function getBdlConfigCandidates(cwd: string): string[] {
  const result: string[] = [];
  let dir = cwd;
  while (true) {
    result.push(join(dir, `bdl.yml`));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return result;
}
