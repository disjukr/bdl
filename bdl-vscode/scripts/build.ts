import { build, emptyDir } from "jsr:@deno/dnt@0.41.3";
import { rspack } from "npm:@rspack/core@1";
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

const compiler = rspack({
  mode: "production",
  target: "web",
  entry: `${packageJson.main}.js`,
  externals: { vscode: "commonjs vscode" },
  output: {
    path: "./dist",
    filename: "browser.js",
    libraryTarget: "commonjs2",
  },
});
compiler.run((err, stats) => {
  if (err || stats?.hasErrors()) {
    console.error(err || stats?.toString("errors-only"));
    Deno.exit(1);
  } else {
    console.log(stats?.toString({ colors: true }));
  }
});
