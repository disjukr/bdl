import { ensureDir } from "jsr:@std/fs@1";
import { dirname, resolve } from "jsr:@std/path@1";
import { stringify as stringifyYml } from "jsr:@std/yaml@1";
import { Command } from "jsr:@cliffy/command@1.0.0-rc.7";
import denoJson from "../deno.json" with { type: "json" };
import { loadBdlConfig } from "../src/io/config.ts";
import { buildIr } from "../src/io/ir.ts";
import parseBdl from "../src/parser/bdl/ast-parser.ts";
import parseBon from "../src/parser/bon/parser.ts";
import { fillBonTypes } from "../src/bon-typer.ts";
import { generateOas } from "../src/generator/openapi/oas-30-generator.ts";
import { generateTs } from "../src/generator/ts/ts-generator.ts";
import { createReflectionServer } from "./reflection.ts";

const astCommand = new Command()
  .description("Parse single BDL file and print AST")
  .arguments("<bdl-file-path:string>")
  .option("-p, --pretty", "Pretty print the AST")
  .action(async (options, filePath) => {
    const code = await Deno.readTextFile(filePath);
    try {
      const ast = parseBdl(code);
      const json = options.pretty
        ? JSON.stringify(ast, null, 2)
        : JSON.stringify(ast);
      console.log(json);
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.error(err.message);
        Deno.exit(1);
      } else throw err;
    }
  });

const bonCommand = new Command()
  .description("Parse single BON file and print AST")
  .arguments("<bon-file-path:string>")
  .option("-f, --fill [root:string]", "Fill in type information from IR")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option("-p, --pretty", "Pretty print the AST")
  .action(async (options, filePath) => {
    const code = await Deno.readTextFile(filePath);
    try {
      let bonValue = parseBon(code);
      const { ir } = await buildIr(options);
      if (options.fill) {
        const rootTypePath = options.fill === true ? undefined : options.fill;
        bonValue = fillBonTypes(ir, bonValue, rootTypePath);
      }
      const json = options.pretty
        ? JSON.stringify(bonValue, null, 2)
        : JSON.stringify(bonValue);
      console.log(json);
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.error(err.message);
        Deno.exit(1);
      } else throw err;
    }
  });

const irCommand = new Command()
  .description("Compile BDL and print IR")
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

const openapi30Command = new Command()
  .description("Compile BDL to OpenAPI 3.0.x JSON or YAML and print to stdout")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
    { default: "conventional" },
  )
  .option("-p, --pretty", "Pretty print the OpenAPI")
  .option("-y, --yaml", "Print the OpenAPI in YAML format (Implies --pretty)")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { schema } = generateOas({ ir });
    const text = options.yaml
      ? stringifyYml(schema).trimEnd()
      : options.pretty
      ? JSON.stringify(schema, null, 2)
      : JSON.stringify(schema);
    console.log(text);
  });

const reflectionCommand = new Command()
  .description("Run the BDL reflection server")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-p, --port <port:number>",
    "Port to run the reflection server on",
    { default: 8000 },
  )
  .action(async (options) => {
    const { configYml, configDirectory } = await loadBdlConfig(options.config);
    const app = createReflectionServer(configYml, configDirectory);
    Deno.serve({ port: options.port }, app.fetch);
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
  .command("ast", astCommand)
  .command("bon", bonCommand)
  .command("ir", irCommand)
  .command("openapi3", openapi30Command)
  .command("reflection", reflectionCommand)
  .command("ts", tsCommand)
  .parse();
