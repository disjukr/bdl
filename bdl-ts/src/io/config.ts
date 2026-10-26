import { readFile } from "node:fs/promises";
import { walkBdlFiles } from "./files.ts";
import { stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { pathToFileURL } from "node:url";
import type { ResolveModuleFile } from "../ir-builder.ts";
import type { BdlConfig } from "../generated/config.ts";

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
  const configText = await readTextFile(configPath);
  const bdlConfig = parseYaml(configText) as BdlConfig;
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
        walkBdlFiles(resolvedDirectoryPath),
      ).map((entry) => relative(resolvedDirectoryPath, entry.path));
      return bdlFiles
        .map((path) => path.replace(/\.bdl$/, "").split(sep))
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
    const text = await readTextFile(filePath);
    return { fileUrl, text };
  };
}

export async function findBdlConfigPath(
  cwd: string = process.cwd(),
): Promise<string> {
  const candidates = getBdlConfigCandidates(cwd);
  for (const path of candidates) {
    try { if ((await stat(path)).isFile()) return path; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return "/bdl.yaml" as never;
}

function getBdlConfigCandidates(cwd: string): string[] {
  const result: string[] = [];
  let dir = cwd;
  while (true) {
    result.push(join(dir, `bdl.yml`));
    result.push(join(dir, `bdl.yaml`));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return result;
}

function readTextFile(path: string | URL) { return readFile(path, "utf8"); }
