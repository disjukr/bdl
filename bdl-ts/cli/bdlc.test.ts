import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, resolve } from "@std/path";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runBdlc(args: string[], cwd?: string): Promise<CommandResult> {
  const scriptPath = fromFileUrl(new URL("./bdlc.ts", import.meta.url));
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", scriptPath, ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

Deno.test("bdlc fmt formats an explicit file path", async () => {
  const tmpDir = await Deno.makeTempDir();
  const filePath = resolve(tmpDir, "sample.bdl");
  await Deno.writeTextFile(filePath, "oneof Value { A,\n}\n");

  const result = await runBdlc(["fmt", filePath]);
  assertEquals(result.code, 0, result.stderr || result.stdout);
  assertStringIncludes(result.stdout, filePath);
  assertEquals(await Deno.readTextFile(filePath), "oneof Value { A }\n");
});

Deno.test("bdlc fmt uses config discovery when file paths are omitted", async () => {
  const tmpDir = await Deno.makeTempDir();
  const schemaDir = resolve(tmpDir, "schemas");
  await Deno.mkdir(schemaDir, { recursive: true });
  const configPath = resolve(tmpDir, "bdl.yaml");
  const filePath = resolve(schemaDir, "module.bdl");
  await Deno.writeTextFile(configPath, "paths:\n  pkg: ./schemas\n");
  await Deno.writeTextFile(filePath, "struct User { id: string,\n}\n");

  const result = await runBdlc(["fmt", "-c", configPath]);
  assertEquals(result.code, 0, result.stderr || result.stdout);
  assertStringIncludes(result.stdout, filePath);
  assertEquals(await Deno.readTextFile(filePath), "struct User { id: string }\n");
});
