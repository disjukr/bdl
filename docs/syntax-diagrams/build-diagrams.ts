import { resolve } from "jsr:@std/path";

const ids = [
  "bdl",
  "ws",
  "comment",
  "top-level-statement",
];
const diagrams = Object.fromEntries(
  await Promise.all(ids.map(async (id) => [
    id,
    (await import(`./${id}.js`)).default.format().toStandalone(),
  ])),
) as Record<string, string>;

const __dirname = new URL(".", import.meta.url).pathname;

for (const [name, diagram] of Object.entries(diagrams)) {
  const path = resolve(__dirname, `out/${name}.svg`);
  Deno.writeTextFileSync(path, diagram);
}
