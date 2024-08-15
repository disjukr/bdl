import { SyntaxError } from "../parser/parser";
import parseJcl from "../parser/jcl-parser";

const argv = process.argv.slice(2);

const filePath = argv[0];
if (!filePath) {
  console.error("No file path provided.");
  process.exit(1);
}

const code = await Bun.file(filePath).text();

try {
  console.log(JSON.stringify(parseJcl(code), null, 2));
} catch (err) {
  if (err instanceof SyntaxError) {
    console.error(err.message);
    process.exit(1);
  } else throw err;
}
