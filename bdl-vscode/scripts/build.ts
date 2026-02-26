import { fromFileUrl, join } from "jsr:@std/path@1";

await emptyDir("./dist");
const denoBundleCommand = new Deno.Command(Deno.execPath(), {
  // deno-fmt-ignore
  args: [
    "bundle",
    "--format", "cjs",
    "--platform", "browser",
    "--external", "vscode",
    "--unstable-raw-imports",
    "-o", "dist/main.js",
    "src/main.ts",
  ],
});
await denoBundleCommand.output();

async function emptyDir(dir: string | URL) {
  try {
    const items = await Array.fromAsync(Deno.readDir(dir));
    await Promise.all(items.map((item) => {
      if (item && item.name) {
        const filepath = join(toPathString(dir), item.name);
        return Deno.remove(filepath, { recursive: true });
      }
    }));
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
    await Deno.mkdir(dir, { recursive: true });
  }
}
function toPathString(pathUrl: string | URL): string {
  return pathUrl instanceof URL ? fromFileUrl(pathUrl) : pathUrl;
}
