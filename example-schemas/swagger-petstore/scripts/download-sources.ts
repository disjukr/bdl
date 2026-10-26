import { mkdir, writeFile } from "node:fs/promises";

await mkdir(new URL("../tmp", import.meta.url), { recursive: true });

const files = [
  "openapi.yaml"
];

for (const file of files) {
  const url =
    `https://raw.githubusercontent.com/swagger-api/swagger-petstore/refs/heads/master/src/main/resources/${file}`;
  await writeFile(
    new URL(`../tmp/${file}`, import.meta.url),
    await (await fetch(url)).text(),
  );
}
