import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { createReflectionServer } from "./reflection.ts";
import { serve } from "@hono/node-server";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

test("reflection serves HTTP requests using the Node adapter", async () => {
  const app = createReflectionServer({ paths: {} }, process.cwd());
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/bdl/standards`);
    assertEquals(response.status, 200);
    assertEquals((await response.json()).includes("conventional"), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("reflection server resolves custom standard paths from config directory", async () => {
  const tempDir = await mkdtemp(tmpdir() + "/bdl-test-");
  const configDirectory = resolve(tempDir, "workspace");
  const nestedCwd = resolve(tempDir, "elsewhere");
  const standardPath = resolve(configDirectory, "standards/custom.yaml");

  await mkdir(dirname(standardPath), { recursive: true });
  await mkdir(nestedCwd, { recursive: true });
  await writeFile(
    standardPath,
    [
      "name: Custom Standard",
      "primitives: {}",
    ].join("\n"),
  );

  const originalCwd = process.cwd();
  process.chdir(nestedCwd);
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
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true });
  }
});

function readTextFile(path: string | URL) { return readFile(path, "utf8"); }
