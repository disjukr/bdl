import { test } from "node:test";
import { ok } from "node:assert/strict";
import { generateTs } from "./ts-generator.ts";

test("TypeScript generator preserves POSIX import paths across module directories", () => {
  const { files } = generateTs({
    ir: {
      modules: {
        "app.deep.model": {
          attributes: {}, defPaths: [],
          imports: [
            { modulePath: "app.deep.types", attributes: {}, items: [{ name: "Local" }] },
            { modulePath: "app.shared.types", attributes: {}, items: [{ name: "Shared" }] },
          ],
        },
      },
      defs: {},
    },
    fileExtension: ".ts",
    importPathSuffix: ".js",
  });
  ok(files["app/deep/model.ts"].includes('from "./types.js"'));
  ok(files["app/deep/model.ts"].includes('from "./../shared/types.js"'));
});
