import { Glob } from "bun";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";
import { buildBdlIr } from "../ir-builder";

const argv = process.argv.slice(2);

const [configPath] = argv;
if (!configPath) {
  console.error("No config path provided.");
  process.exit(1);
}
const configDirectory = dirname(resolve(configPath));

interface ConfigYml {
  paths: Record<string, string>;
}
const configYmlText = await Bun.file(configPath).text();
const configYml = load(configYmlText, { json: true }) as ConfigYml;

const entryModulePaths = Object.entries(configYml.paths).flatMap(
  ([packageName, directoryPath]) => {
    const resolvedDirectoryPath = resolve(configDirectory, directoryPath);
    const bdlFiles = [...new Glob("**/*.bdl").scanSync(resolvedDirectoryPath)];
    return bdlFiles
      .map((path) => path.replace(/\.bdl$/, "").split("/"))
      .filter((names) =>
        names.every((name) => name.match(/^[a-z_][a-z0-9_]*$/i))
      )
      .map((names) => [packageName, ...names].join("."));
  }
);

const result = await buildBdlIr({
  entryModulePaths,
  resolveModuleFile: async (modulePath) => {
    const [packageName, ...fragments] = modulePath.split(".");
    const directoryPath = configYml.paths[packageName];
    const resolvedDirectoryPath = resolve(configDirectory, directoryPath);
    const filePath = resolve(
      resolvedDirectoryPath,
      fragments.join("/") + ".bdl"
    );
    const fileUrl = pathToFileURL(filePath).toString();
    const text = await Bun.file(filePath).text();
    return { fileUrl, text };
  },
});

console.log(JSON.stringify(result.ir, null, 2));
