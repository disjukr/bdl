import { Glob } from "bun";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildBdlIr } from "../ir-builder";

const argv = process.argv.slice(2);

const [packageName, directoryPath] = argv;
if (!packageName || !directoryPath) {
  if (!packageName) console.error("No package name provided.");
  if (!directoryPath) console.error("No directory path provided.");
  process.exit(1);
}

const entryModulePaths = [...new Glob("**/*.bdl").scanSync(directoryPath)]
  .map((path) => path.replace(/\.bdl$/, "").split("/"))
  .filter((names) => names.every((name) => name.match(/^[a-z_][a-z0-9_]*$/i)))
  .map((names) => [packageName, ...names].join("."));

const result = await buildBdlIr({
  entryModulePaths,
  resolveModuleFile: async (modulePath) => {
    const [_packageName, ...fragments] = modulePath.split(".");
    if (packageName !== _packageName) throw new Error("Unknown package");
    const filePath = resolve(directoryPath, fragments.join("/") + ".bdl");
    const fileUrl = pathToFileURL(filePath).toString();
    const text = await Bun.file(filePath).text();
    return { fileUrl, text };
  },
});

console.log(JSON.stringify(result.ir, null, 2));
