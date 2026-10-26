import { test } from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { resolveModulePath } from "./module-path.ts";

test("resolveModulePath strips the .bdl extension", () => {
  assertEquals(
    resolveModulePath(
      "pkg",
      "/workspace/schemas/pkg",
      "/workspace/schemas/pkg/foo/bar.bdl",
    ),
    "pkg.foo.bar",
  );
});

test("resolveModulePath rejects sibling package prefixes", () => {
  assertEquals(
    resolveModulePath(
      "pkg",
      "/workspace/schemas/pkg",
      "/workspace/schemas/pkg-extra/foo.bdl",
    ),
    undefined,
  );
});

test("resolveModulePath ignores non-bdl documents", () => {
  assertEquals(
    resolveModulePath(
      "pkg",
      "/workspace/schemas/pkg",
      "/workspace/schemas/pkg/foo/bar.json",
    ),
    undefined,
  );
});
