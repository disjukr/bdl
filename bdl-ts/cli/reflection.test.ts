import { assertEquals } from "@std/assert";
import { dirname, resolve } from "@std/path";
import { createReflectionServer } from "./reflection.ts";

Deno.test("reflection server resolves custom standard paths from config directory", async () => {
  const tempDir = await Deno.makeTempDir();
  const configDirectory = resolve(tempDir, "workspace");
  const nestedCwd = resolve(tempDir, "elsewhere");
  const standardPath = resolve(configDirectory, "standards/custom.yaml");

  await Deno.mkdir(dirname(standardPath), { recursive: true });
  await Deno.mkdir(nestedCwd, { recursive: true });
  await Deno.writeTextFile(
    standardPath,
    [
      "name: Custom Standard",
      "primitives: {}",
    ].join("\n"),
  );

  const originalCwd = Deno.cwd();
  Deno.chdir(nestedCwd);
  try {
    const app = createReflectionServer(
      {
        paths: { pkg: "./schemas" },
        standards: { custom: "./standards/custom.yaml" },
      },
      configDirectory,
    );

    const response = await app.request("http://localhost/bdl/standards/custom");

    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      name: "Custom Standard",
      primitives: {},
    });
  } finally {
    Deno.chdir(originalCwd);
  }
});
