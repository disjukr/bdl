import railroad from "https://raw.githubusercontent.com/tabatkins/railroad-diagrams/ea9a12393bbaa2c802b0449fd5bdf34b6868b83c/railroad.js";
import { expandGlob } from "jsr:@std/fs";
import { join } from "jsr:@std/path";

Object.assign(globalThis, railroad);

const files = await iter(expandGlob(join(
  new URL(".", import.meta.url).pathname,
  "./src/*.js",
)));

const diagrams = Object.fromEntries(
  await Promise.all(files.map(async ({ name }) => [
    name.replace(/\.js$/, ""),
    (await import(`./src/${name}`)).default.format().toStandalone(),
  ])),
) as Record<string, string>;

for (const [name, diagram] of Object.entries(diagrams)) {
  Deno.writeTextFileSync(
    new URL(`./out/${name}.svg`, import.meta.url),
    diagram,
  );
}

async function iter<T>(items: AsyncIterableIterator<T>) {
  const result = [];
  for await (const item of items) result.push(item);
  return result;
}
