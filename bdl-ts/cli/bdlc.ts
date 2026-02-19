import { ensureDir, walkSync } from "@std/fs";
import { dirname, resolve } from "@std/path";
import { stringify as stringifyYaml } from "@std/yaml";
import { Command } from "@cliffy/command";
import denoJson from "../deno.json" with { type: "json" };
import { loadBdlConfig } from "../src/io/config.ts";
import { buildIr } from "../src/io/ir.ts";
import parseBdl from "../src/parser/bdl/ast-parser.ts";
import { formatBdl } from "../src/formatter/bdl.ts";
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

const irCommand = new Command()
  .description("Compile BDL and print IR")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
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
  )
  .option("-p, --pretty", "Pretty print the OpenAPI")
  .option("-y, --yaml", "Print the OpenAPI in YAML format (Implies --pretty)")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { schema } = generateOas({ ir });
    const text = options.yaml
      ? stringifyYaml(schema).trimEnd()
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
    const { bdlConfig, configDirectory } = await loadBdlConfig(options.config);
    const app = createReflectionServer(bdlConfig, configDirectory);
    Deno.serve({ port: options.port }, app.fetch);
  });

const tsCommand = new Command()
  .description("Compile BDL to TypeScript")
  .option("-c, --config <path:string>", "Path to the BDL config file")
  .option(
    "-s, --standard <standard:string>",
    "Filter only modules that correspond to the standard you use",
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

function createFormatCommand() {
  return new Command()
    .description("Format BDL files")
    .arguments("[file-paths...:string]")
    .option("-c, --config <path:string>", "Path to the BDL config file")
    .option("--check", "Do not write files; exit non-zero if formatting is needed")
    .option("--line-width <line-width:number>", "Target line width", {
      default: 80,
    })
    .option(
      "--indent-type <indent-type:string>",
      "Indent style (space|tab)",
      {
        default: "space",
      },
    )
    .option("--indent-count <indent-count:number>", "Indent size", {
      default: 2,
    })
    .option("--no-final-newline", "Do not append final newline")
    .action(async (options, ...filePaths) => {
      const indentType = options.indentType === "tab" ? "tab" : "space";
      const targetFiles = filePaths.length > 0
        ? [...new Set(filePaths.map((filePath) => resolve(filePath)))].sort()
        : await collectBdlFilesFromConfig(options.config);

      let changed = 0;
      for (const filePath of targetFiles) {
        const source = await Deno.readTextFile(filePath);
        const formatted = formatBdl(source, {
          lineWidth: options.lineWidth,
          indent: { type: indentType, count: options.indentCount },
          finalNewline: options.finalNewline,
        });
        if (formatted === source) continue;
        changed += 1;
        if (options.check) {
          console.log(filePath);
          continue;
        }
        await Deno.writeTextFile(filePath, formatted);
        console.log(filePath);
      }

      if (options.check && changed > 0) {
        Deno.exit(1);
      }
    });
}

async function collectBdlFilesFromConfig(config?: string): Promise<string[]> {
  const { configDirectory, bdlConfig } = await loadBdlConfig(config);
  const files = new Set<string>();
  for (const directoryPath of Object.values(bdlConfig.paths)) {
    const root = resolve(configDirectory, directoryPath);
    for (const entry of walkSync(root, {
      exts: ["bdl"],
      includeDirs: false,
      includeSymlinks: false,
    })) {
      files.add(entry.path);
    }
  }
  return [...files].sort();
}

await new Command()
  .name("bdlc")
  .usage("<command> [args...]")
  .version(denoJson.version)
  .description("BDL Compiler")
  .action(function () {
    this.showHelp();
  })
  .command("ast", astCommand)
  .command("ir", irCommand)
  .command("openapi3", openapi30Command)
  .command("reflection", reflectionCommand)
  .command("ts", tsCommand)
  .command("format", createFormatCommand())
  .command("fmt", createFormatCommand())
  .parse();
