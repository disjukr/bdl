import { ensureDir } from "jsr:@std/fs@1";

await ensureDir(new URL("../tmp", import.meta.url));

const files = [
  "browser-sdk.yml",
  "v1.openapi.yml",
  "v2.openapi.yml",
];

for (const file of files) {
  const url =
    `https://raw.githubusercontent.com/portone-io/developers.portone.io/refs/heads/main/src/schema/${file}`;
  await Deno.writeTextFile(
    new URL(`../tmp/${file}`, import.meta.url),
    await (await fetch(url)).text(),
  );
}
