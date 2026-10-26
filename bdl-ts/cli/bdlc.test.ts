import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert/strict";
function assertStringIncludes(actual: string, expected: string) {
  if (!actual.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runBdlc(args: string[], cwd?: string): Promise<CommandResult> {
  const scriptPath = fileURLToPath(new URL("./bdlc.ts", import.meta.url));
  const output = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), scriptPath, ...args], { cwd, encoding: "utf8" });
  if (output.error) throw output.error;
  return { code: output.status ?? 1, stdout: output.stdout, stderr: output.stderr };
}

test("bdlc preserves AST, IR, TypeScript and OpenAPI commands on Node", async (t) => {
  const directory = await mkdtemp(tmpdir() + "/bdl-cli-");
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(resolve(directory, "schemas"));
  const file = resolve(directory, "schemas/user.bdl");
  await writeFile(file, "# standard - conventional\nstruct User { id: string }\n");
  await writeFile(resolve(directory, "bdl.yaml"), "paths:\n  app: ./schemas\n");
  const ast = await runBdlc(["ast", file, "--pretty"], directory);
  assertEquals(ast.code, 0, ast.stderr);
  assertEquals(JSON.parse(ast.stdout).statements.length > 0, true);
  const ir = await runBdlc(["ir", "--omit-file-url"], directory);
  assertEquals(ir.code, 0, ir.stderr);
  assertEquals(JSON.parse(ir.stdout).defs["app.user.User"].type, "Struct");
  const ts = await runBdlc(["ts", "-o", "generated", "--file-extension", ".ts", "--import-path-suffix", ".js"], directory);
  assertEquals(ts.code, 0, ts.stderr);
  assertStringIncludes(await readTextFile(resolve(directory, "generated/app/user.ts")), "export interface User");
  const openapi = await runBdlc(["openapi3"], directory);
  assertEquals(openapi.code, 0, openapi.stderr);
  assertEquals(JSON.parse(openapi.stdout).openapi, "3.0.3");
  const invalid = await runBdlc(["ast", resolve(directory, "missing.bdl")], directory);
  assertEquals(invalid.code, 1);
});

test("bdlc fmt formats an explicit file path", async () => {
  const tmpDir = await mkdtemp(tmpdir() + "/bdl-test-");
  const filePath = resolve(tmpDir, "sample.bdl");
  await writeFile(filePath, "oneof Value { A,\n}\n");

  const result = await runBdlc(["fmt", filePath]);
  assertEquals(result.code, 0, result.stderr || result.stdout);
  assertStringIncludes(result.stdout, filePath);
  assertEquals(await readTextFile(filePath), "oneof Value { A }\n");
});

test("bdlc fmt uses config discovery when file paths are omitted", async () => {
  const tmpDir = await mkdtemp(tmpdir() + "/bdl-test-");
  const schemaDir = resolve(tmpDir, "schemas");
  await mkdir(schemaDir, { recursive: true });
  const configPath = resolve(tmpDir, "bdl.yaml");
  const filePath = resolve(schemaDir, "module.bdl");
  await writeFile(configPath, "paths:\n  pkg: ./schemas\n");
  await writeFile(filePath, "struct User { id: string,\n}\n");

  const result = await runBdlc(["fmt", "-c", configPath]);
  assertEquals(result.code, 0, result.stderr || result.stdout);
  assertStringIncludes(result.stdout, filePath);
  assertEquals(await readTextFile(filePath), "struct User { id: string }\n");
});

test("bdlc fmt skips files with bdlc-fmt-ignore-file directive", async () => {
  const tmpDir = await mkdtemp(tmpdir() + "/bdl-test-");
  const filePath = resolve(tmpDir, "ignored.bdl");
  const source = "// bdlc-fmt-ignore-file\noneof Value { A,\n}\n";
  await writeFile(filePath, source);

  const result = await runBdlc(["fmt", filePath]);
  assertEquals(result.code, 0, result.stderr || result.stdout);
  assertEquals(await readTextFile(filePath), source);
});

function readTextFile(path: string | URL) { return readFile(path, "utf8"); }
