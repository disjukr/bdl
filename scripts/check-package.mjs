import { mkdtemp, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Run this check with pnpm test:package");
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
function runPnpm(args, cwd = root) {
  const isScript = /\.[cm]?js$/.test(pnpm);
  run(isScript ? process.execPath : pnpm, isScript ? [pnpm, ...args] : args, cwd);
}
const directory = await mkdtemp(join(tmpdir(), "bdl-package-"));
try {
  const dependencies = {};
  for (const folder of ["bdl-ts/runtime", "bdl-ts"]) {
    const pkg = JSON.parse(await readFile(join(root, folder, "package.json"), "utf8"));
    runPnpm(["pack", "--pack-destination", directory], join(root, folder));
    const archive = `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`;
    dependencies[pkg.name] = `file:${join(directory, archive).replaceAll("\\", "/")}`;
  }
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name: "bdl-package-check", private: true, type: "module", dependencies,
    pnpm: { overrides: { "@disjukr/bdl-runtime": dependencies["@disjukr/bdl-runtime"] } },
  }));
  const store = process.env.BDL_TEST_STORE_DIR;
  // Frozen workspace installs can cache tarballs without semver-range metadata.
  // A fresh consumer may therefore need registry metadata even with a warm store.
  runPnpm(["install", "--prefer-offline", "--ignore-scripts", ...(store ? ["--store-dir", store] : [])], directory);
  await copyFile(join(root, "scripts/fixtures/package-consumer.mjs"), join(directory, "smoke.mjs"));
  await copyFile(join(root, "scripts/fixtures/package-consumer.ts"), join(directory, "types.ts"));
  run(process.execPath, [join(directory, "smoke.mjs")], directory);
  runPnpm(["exec", "bdlc", "--version"], directory);
  const require = createRequire(import.meta.url);
  run(process.execPath, [require.resolve("typescript/bin/tsc"), "--noEmit", "--strict", "--module", "NodeNext", "--target", "ESNext", "types.ts"], directory);
} finally {
  // This path is freshly created by mkdtemp, independent of the user's checkout.
  await rm(resolve(directory), { recursive: true, force: true });
}
