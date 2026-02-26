import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import conventionalStandard from "../builtin/standards/conventional.ts";
import { lintBdl, type LintBdlResult } from "./bdl.ts";

async function lintBdlFinal(config: Parameters<typeof lintBdl>[0]) {
  let last: LintBdlResult | undefined;
  for await (const result of lintBdl(config)) {
    last = result;
  }
  return last ?? { diagnostics: [] };
}

Deno.test("lintBdl reports syntax errors", async () => {
  const result = await lintBdlFinal({ text: "struct User { id: string" });
  assertEquals(result.diagnostics.length, 1);
  assertEquals(result.diagnostics[0].code, "bdl/syntax");
  assertEquals(result.diagnostics[0].severity, "error");
  assertStringIncludes(result.diagnostics[0].message, "Expected");
});

Deno.test("lintBdl reports unknown attributes", async () => {
  const result = await lintBdlFinal({
    text: [
      "struct User {",
      "  @ nope - true",
      "  id: string,",
      "}",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Unknown attribute 'nope'."));
});

Deno.test("lintBdl requires standard by default", async () => {
  const result = await lintBdlFinal({ text: "struct User { id: string }\n" });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("No BDL standard specified."));
});

Deno.test("lintBdl validates standard id from bdlConfig", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - unknown",
      "struct User {",
      "  id: string,",
      "}",
      "",
    ].join("\n"),
    bdlConfig: {
      paths: { pkg: "./schemas" },
      standards: { conventional: "./standards/conventional.yaml" },
    },
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Unknown BDL standard."));
});

Deno.test("lintBdl loads config and standard asynchronously", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "struct User {",
      "  id: string,",
      "}",
      "",
    ].join("\n"),
    loadBdlConfig: async () => ({
      paths: { pkg: "./schemas" },
      standards: { conventional: "./standards/conventional.yaml" },
    }),
    loadBdlStandard: async (standardId) => {
      if (standardId !== "conventional") return;
      return conventionalStandard;
    },
  });
  const codes = result.diagnostics.map((diag) => diag.code);
  assert(!codes.includes("bdl/missing-standard"));
  assert(!codes.includes("bdl/unknown-standard"));
  assert(!codes.includes("bdl/unknown-type"));
});

Deno.test("lintBdl yields diagnostics snapshots multiple times", async () => {
  const snapshots: number[] = [];
  for await (
    const lintResult of lintBdl({
      text: [
        "# standard - conventional",
        "struct User {",
        "  id: string,",
        "}",
        "",
      ].join("\n"),
      standard: conventionalStandard,
    })
  ) {
    snapshots.push(lintResult.diagnostics.length);
  }
  assertEquals(snapshots.length, 5);
});

Deno.test("lintBdl yields after async standard loading", async () => {
  const snapshots: number[] = [];
  for await (
    const lintResult of lintBdl({
      text: [
        "# standard - conventional",
        "struct User {",
        "  id: string,",
        "}",
        "",
      ].join("\n"),
      loadBdlConfig: async () => ({
        paths: { pkg: "./schemas" },
        standards: { conventional: "./standards/conventional.yaml" },
      }),
      loadBdlStandard: async (standardId) => {
        if (standardId !== "conventional") return;
        return conventionalStandard;
      },
    })
  ) {
    snapshots.push(lintResult.diagnostics.length);
  }
  assertEquals(snapshots.length, 5);
});

Deno.test("lintBdl supports async modulePath loading", async () => {
  const snapshots: number[] = [];
  let sawConfigStandards = false;

  for await (
    const lintResult of lintBdl({
      text: [
        "# standard - conventional",
        "struct User {",
        "  id: string,",
        "}",
        "",
      ].join("\n"),
      standard: conventionalStandard,
      loadBdlConfig: async () => ({
        paths: { pkg: "./schemas" },
        standards: { conventional: "./standards/conventional.yaml" },
      }),
      resolveModulePath: async (bdlConfig) => {
        sawConfigStandards = !!bdlConfig?.standards?.conventional;
        return "pkg.user";
      },
    })
  ) {
    snapshots.push(lintResult.diagnostics.length);
  }

  assert(sawConfigStandards);
  assertEquals(snapshots.length, 5);
});

Deno.test("lintBdl stops immediately when already aborted", async () => {
  const abortController = new AbortController();
  abortController.abort();

  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "struct User {",
      "  @ nope - true",
      "  id: string,",
      "}",
      "",
    ].join("\n"),
    standard: conventionalStandard,
    abortSignal: abortController.signal,
  });

  assertEquals(result.diagnostics.length, 0);
});

Deno.test("lintBdl stops after async standard-id stage when aborted", async () => {
  const abortController = new AbortController();

  const result = await lintBdlFinal({
    text: [
      "# standard - unknown",
      "struct User {",
      "  id: string,",
      "}",
      "",
    ].join("\n"),
    loadBdlConfig: async () => {
      abortController.abort();
      return {
        paths: { pkg: "./schemas" },
        standards: { conventional: "./standards/conventional.yaml" },
      };
    },
    abortSignal: abortController.signal,
  });

  assertEquals(result.diagnostics.length, 0);
});

Deno.test("lintBdl reports unknown imported type", async () => {
  const result = await lintBdlFinal({
    text: [
      "import pkg.model { User, Missing }",
      "struct Request {",
      "  user: User,",
      "}",
      "",
    ].join("\n"),
    readModule: async (modulePath) => {
      if (modulePath !== "pkg.model") return;
      return [
        "struct User {",
        "  id: string,",
        "}",
        "",
      ].join("\n");
    },
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(
    messages.includes("Module 'pkg.model' has no exported type 'Missing'."),
  );
});

Deno.test("lintBdl distinguishes import parse errors from missing modules", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "import pkg.model { User }",
      "struct Request {",
      "  user: User,",
      "}",
      "",
    ].join("\n"),
    readModule: async (modulePath) => {
      if (modulePath !== "pkg.model") return;
      return "struct User { id: string";
    },
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Module 'pkg.model' has syntax errors."));
  assert(!messages.includes("Cannot find module 'pkg.model'."));
});

Deno.test("lint directives: disable and enable control lint region", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "  // bdlc-lint-disable",
      "struct A { x: MissingA }",
      "  // bdlc-lint-enable",
      "struct B { y: MissingB }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(!messages.includes("Cannot find name 'MissingA'."));
  assert(messages.includes("Cannot find name 'MissingB'."));
});

Deno.test("lint directives: disable-line suppresses same line", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "struct A { x: MissingA } // bdlc-lint-disable-line",
      "struct B { y: MissingB }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(!messages.includes("Cannot find name 'MissingA'."));
  assert(messages.includes("Cannot find name 'MissingB'."));
});

Deno.test("lint directives: disable-next-line suppresses only next line", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "// bdlc-lint-disable-next-line",
      "struct A { x: MissingA }",
      "struct B { y: MissingB }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(!messages.includes("Cannot find name 'MissingA'."));
  assert(messages.includes("Cannot find name 'MissingB'."));
});

Deno.test("lint directives: ignore directive-like text in attribute content", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional // bdlc-lint-disable",
      "struct A { x: MissingA }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Cannot find name 'MissingA'."));
});

Deno.test("lint directives: ignore directive-like text in multiline attribute content", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "@ note",
      "| // bdlc-lint-disable",
      "struct A { x: MissingA }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Cannot find name 'MissingA'."));
});

Deno.test("lint directives: prose mention does not activate directives", async () => {
  const result = await lintBdlFinal({
    text: [
      "# standard - conventional",
      "// docs: mention bdlc-lint-disable for examples",
      "struct A { x: MissingA }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Cannot find name 'MissingA'."));
});

Deno.test("lint directives: compact hash attribute text does not activate directives", async () => {
  const result = await lintBdlFinal({
    text: [
      "#standard- conventional // bdlc-lint-disable",
      "struct A { x: MissingA }",
      "",
    ].join("\n"),
    standard: conventionalStandard,
  });
  const messages = result.diagnostics.map((diag) => diag.message);
  assert(messages.includes("Cannot find name 'MissingA'."));
});

Deno.test("lint directives: disable-line works with CRLF input", async () => {
  const result = await lintBdlFinal({
    text: [
      "// bdlc-lint-disable-line",
      "struct User { id: string }",
      "",
    ].join("\r\n"),
    standard: conventionalStandard,
  });
  assertEquals(result.diagnostics.length, 0);
});
