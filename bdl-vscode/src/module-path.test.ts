import { assertEquals } from "jsr:@std/assert@1";
import { resolveModulePath } from "./module-path.ts";

Deno.test("resolveModulePath strips the .bdl extension", () => {
  assertEquals(
    resolveModulePath(
      "pkg",
      "/workspace/schemas/pkg",
      "/workspace/schemas/pkg/foo/bar.bdl",
    ),
    "pkg.foo.bar",
  );
});

Deno.test("resolveModulePath rejects sibling package prefixes", () => {
  assertEquals(
    resolveModulePath(
      "pkg",
      "/workspace/schemas/pkg",
      "/workspace/schemas/pkg-extra/foo.bdl",
    ),
    undefined,
  );
});

Deno.test("resolveModulePath ignores non-bdl documents", () => {
  assertEquals(
    resolveModulePath(
      "pkg",
      "/workspace/schemas/pkg",
      "/workspace/schemas/pkg/foo/bar.json",
    ),
    undefined,
  );
});
