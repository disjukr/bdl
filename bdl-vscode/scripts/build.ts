import { build, emptyDir } from "jsr:@deno/dnt";
import packageJson from "../package.json" with { type: "json" };

await emptyDir("./dist");

await build({
  entryPoints: ["./src/main.ts"],
  outDir: "./dist",
  shims: {
    deno: true,
  },
  typeCheck: false,
  test: false,
  declaration: false,
  scriptModule: "cjs",
  esModule: false,
  skipSourceOutput: true,
  package: {
    name: packageJson.name,
    version: packageJson.version,
  },
  importMap: "dnt-importmap.json",
});
