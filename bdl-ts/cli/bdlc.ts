#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { serve } from "@hono/node-server";
import { stringify as stringifyYaml } from "yaml";
import packageJson from "../package.json" with { type: "json" };
import { loadBdlConfig } from "../src/io/config.ts";
import { walkBdlFiles } from "../src/io/files.ts";
import { buildIr } from "../src/io/ir.ts";
import parseBdl from "../src/parser/bdl/ast-parser.ts";
import { formatBdl } from "../src/formatter/bdl.ts";
import { generateOas } from "../src/generator/openapi/oas-30-generator.ts";
import { generateTs } from "../src/generator/ts/ts-generator.ts";
import { createReflectionServer } from "./reflection.ts";

const program = new Command().name("bdlc").version(packageJson.version)
  .description("BDL Compiler")
  .action(() => { program.outputHelp(); });
program.command("ast").description("Parse single BDL file and print AST")
  .argument("<bdl-file-path>").option("-p, --pretty", "Pretty print the AST")
  .action(async (filePath, options) => {
    const ast = parseBdl(await readFile(filePath, "utf8"));
    console.log(JSON.stringify(ast, null, options.pretty ? 2 : undefined));
  });
function compilationCommand(name: string, description: string) {
  return program.command(name).description(description)
    .option("-c, --config <path>", "Path to the BDL config file")
    .option("-s, --standard <standard>", "Filter modules by standard");
}
compilationCommand("ir", "Compile BDL and print IR")
  .option("-p, --pretty", "Pretty print the IR")
  .option("--omit-file-url", "Omit fileUrl field from the IR")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    console.log(JSON.stringify(ir, null, options.pretty ? 2 : undefined));
  });
compilationCommand("openapi3", "Compile BDL to OpenAPI 3.0.x JSON or YAML")
  .option("-p, --pretty", "Pretty print the OpenAPI")
  .option("-y, --yaml", "Print YAML")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { schema } = generateOas({ ir });
    console.log(options.yaml ? stringifyYaml(schema).trimEnd()
      : JSON.stringify(schema, null, options.pretty ? 2 : undefined));
  });
program.command("reflection").description("Run the BDL reflection server")
  .option("-c, --config <path>", "Path to the BDL config file")
  .option("-p, --port <port>", "Port to run the reflection server on", "8000")
  .action(async (options) => {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
    const { bdlConfig, configDirectory } = await loadBdlConfig(options.config);
    const app = createReflectionServer(bdlConfig, configDirectory);
    const server = serve({ fetch: app.fetch, port });
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => server.close());
    }
  });
compilationCommand("ts", "Compile BDL to TypeScript")
  .option("-o, --out <path>", "Output directory", "./out")
  .option("--file-extension <extension>", "File extension", ".ts")
  .option("--import-path-suffix <suffix>", "Import path suffix", "")
  .action(async (options) => {
    const { ir } = await buildIr(options);
    const { files } = generateTs({ ir, fileExtension: options.fileExtension,
      importPathSuffix: options.importPathSuffix });
    for (const [filePath, ts] of Object.entries(files)) {
      const outPath = resolve(options.out, filePath);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, ts);
    }
  });
program.command("fmt").description("Format BDL files")
  .argument("[file-paths...]")
  .option("-c, --config <path>", "Path to the BDL config file")
  .option("--line-width <line-width>", "Target line width", "80")
  .option("--indent-type <indent-type>", "Indent style (space|tab)", "space")
  .option("--indent-count <indent-count>", "Indent size", "2")
  .option("--no-final-newline", "Do not append final newline")
  .action(async (filePaths: string[], options) => {
    const targetFiles = filePaths.length > 0
      ? [...new Set(filePaths.map((p) => resolve(p)))].sort()
      : await collectBdlFilesFromConfig(options.config);
    for (const filePath of targetFiles) {
      const source = await readFile(filePath, "utf8");
      const formatted = formatBdl(source, {
        lineWidth: Number(options.lineWidth),
        indent: { type: options.indentType === "tab" ? "tab" : "space",
          count: Number(options.indentCount) },
        finalNewline: options.finalNewline,
      });
      if (formatted === source) continue;
      await writeFile(filePath, formatted);
      console.log(filePath);
    }
  });
async function collectBdlFilesFromConfig(config?: string): Promise<string[]> {
  const { configDirectory, bdlConfig } = await loadBdlConfig(config);
  const files = new Set<string>();
  for (const directory of Object.values(bdlConfig.paths)) {
    for (const entry of walkBdlFiles(resolve(configDirectory, directory))) files.add(entry.path);
  }
  return [...files].sort();
}
try { await program.parseAsync(); }
catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
