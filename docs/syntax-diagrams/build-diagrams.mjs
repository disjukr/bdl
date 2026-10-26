import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import railroad from "./vendor/railroad-diagrams/railroad.js";

// The diagram definitions use the renderer's constructors as globals.
Object.assign(globalThis, railroad);
const sourceDirectory = new URL("./src/", import.meta.url);
const outputDirectory = new URL("./out/", import.meta.url);
const check = process.argv.includes("--check");
const names = (await readdir(sourceDirectory)).filter((name) => name.endsWith(".js")).sort();
if (!check) await mkdir(outputDirectory, { recursive: true });
const normalize = (text) => text.replaceAll("\r\n", "\n");
for (const name of names) {
  const { default: diagram } = await import(new URL(name, sourceDirectory).href);
  const svg = diagram.format().toStandalone();
  const output = new URL(name.replace(/\.js$/, ".svg"), outputDirectory);
  if (check) {
    const current = await readFile(output, "utf8");
    if (normalize(current) !== normalize(svg)) {
      throw new Error(`Diagram is out of date: ${fileURLToPath(output)}`);
    }
  } else {
    await writeFile(output, svg);
  }
}
if (check) {
  const expected = names.map((name) => name.replace(/\.js$/, ".svg"));
  const actual = (await readdir(outputDirectory)).filter((name) => name.endsWith(".svg")).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Diagram output names do not match the source definitions");
  }
}
console.log(`${check ? "Checked" : "Generated"} ${names.length} syntax diagrams`);
