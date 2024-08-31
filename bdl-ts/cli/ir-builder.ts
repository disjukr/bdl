import { walkSync } from "jsr:@std/fs/walk";
import { parse } from "jsr:@std/yaml";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildBdlIr } from "../src/ir-builder.ts";

const [configPath] = Deno.args;
if (!configPath) {
  console.error("No config path provided.");
  Deno.exit(1);
}
const configDirectory = dirname(resolve(configPath));

interface ConfigYml {
  paths: Record<string, string>;
}
const configYmlText = await Deno.readTextFile(configPath);
const configYml = parse(configYmlText, { schema: "json" }) as ConfigYml;

const entryModulePaths = Object.entries(configYml.paths).flatMap(
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

const result = await buildBdlIr({
  entryModulePaths,
  resolveModuleFile: async (modulePath) => {
    const [packageName, ...fragments] = modulePath.split(".");
    const directoryPath = configYml.paths[packageName];
    const resolvedDirectoryPath = resolve(configDirectory, directoryPath);
    const filePath = resolve(
      resolvedDirectoryPath,
      fragments.join("/") + ".bdl",
    );
    const fileUrl = pathToFileURL(filePath).toString();
    const text = await Deno.readTextFile(filePath);
    return { fileUrl, text };
  },
});

console.log(JSON.stringify(result.ir, null, 2));
