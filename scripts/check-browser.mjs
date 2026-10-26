import { build } from "esbuild";

await build({
  entryPoints: [
    "bdl-ts/src/parser/bdl/ast-parser.ts",
    "bdl-ts/src/formatter/bdl.ts",
    "bdl-ts/src/linter/bdl.ts",
    "bdl-ts/src/builtin/standards.ts",
    "bdl-ts/src/generator/ts/ts-generator.ts",
    "bdl-ts/src/generator/openapi/oas-30-generator.ts",
    "bdl-ts/runtime/src/fetch-proc.ts",
  ],
  outdir: "browser-check",
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
console.log("Browser boundary: 7 entry points bundled without Node built-ins");
