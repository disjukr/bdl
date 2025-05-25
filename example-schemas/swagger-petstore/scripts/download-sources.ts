import { ensureDir } from "jsr:@std/fs@1";

await ensureDir(new URL("../tmp", import.meta.url));

const files = [
  "openapi.yaml"
];

for (const file of files) {
  const url =
    `https://raw.githubusercontent.com/swagger-api/swagger-petstore/refs/heads/master/src/main/resources/${file}`;
  await Deno.writeTextFile(
    new URL(`../tmp/${file}`, import.meta.url),
    await (await fetch(url)).text(),
  );
}
