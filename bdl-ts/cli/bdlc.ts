import { ensureDir } from "jsr:@std/fs@1";
import { dirname, resolve } from "jsr:@std/path@1";
import { stringify as stringifyYml } from "jsr:@std/yaml@1";
import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import denoJson from "../deno.json" with { type: "json" };
import { buildIr } from "../src/io/ir.ts";
import { generateOas } from "../src/generator/openapi/oas-generator.ts";
import { generateTs } from "../src/generator/ts/ts-generator.ts";

const irCommand = new Command()
  .description("Print BDL IR")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option("-p, --pretty", "Pretty print the IR")
  .option("--omit-file-url", "Omit fileUrl field from the IR")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const json = options.pretty
      ? JSON.stringify(ir, null, 2)
      : JSON.stringify(ir);
    console.log(json);
  });

const openapiCommand = new Command()
  .description("Compile BDL to OpenAPI")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option(
    "-o, --out <path:string>",
    "Output directory for the generated files",
    { default: "./out" },
  )
  .option(
    "--file-extension <extension:string>",
    "File extension for the generated files",
    { default: ".yml" },
  )
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { out, fileExtension } = options;
    const { files } = generateOas({ ir });
    const outDirectory = resolve(out);
    const isYaml = [".yml", ".yaml"].some((ext) => fileExtension.endsWith(ext));
    for (const [filePath, schema] of Object.entries(files)) {
      const outPath = resolve(outDirectory, filePath + fileExtension);
      await ensureDir(dirname(outPath));
      await Deno.writeTextFile(
        outPath,
        isYaml ? stringifyYml(schema) : JSON.stringify(schema, null, 2),
      );
    }
  });

const tsCommand = new Command()
  .description("Compile BDL to TypeScript")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option(
    "-o, --out <path:string>",
    "Output directory for the generated files",
    { default: "./out" },
  )
  .option(
    "--file-extension <extension:string>",
    "File extension for the generated files",
    { default: ".ts" },
  )
  .option(
    "--import-path-suffix <suffix:string>",
    "Suffix to append to the import path",
    { default: "" },
  )
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { fileExtension, importPathSuffix } = options;
    const { files } = generateTs({ ir, fileExtension, importPathSuffix });
    const outDirectory = resolve(options.out);
    for (const [filePath, ts] of Object.entries(files)) {
      const outPath = resolve(outDirectory, filePath);
      await ensureDir(dirname(outPath));
      await Deno.writeTextFile(outPath, ts);
    }
  });

await new Command()
  .name("bdlc")
  .usage("<command> [args...]")
  .version(denoJson.version)
  .description("BDL Compiler")
  .action(function () {
    this.showHelp();
  })
  .command("ir", irCommand)
  .command("openapi", openapiCommand)
  .command("ts", tsCommand)
  .parse();
