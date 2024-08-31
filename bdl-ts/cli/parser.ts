import { SyntaxError } from "../src/parser/parser.ts";
import parseBdl from "../src/parser/bdl-parser.ts";

const [filePath] = Deno.args;
if (!filePath) {
  console.error("No file path provided.");
  Deno.exit(1);
}

const code = await Deno.readTextFile(filePath);

try {
  console.log(JSON.stringify(parseBdl(code), null, 2));
} catch (err) {
  if (err instanceof SyntaxError) {
    console.error(err.message);
    Deno.exit(1);
  } else throw err;
}
