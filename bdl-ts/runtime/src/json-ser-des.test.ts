import { assertEquals } from "@std/assert";
import { createPrimitiveDefs, defineUnion, f, p } from "./data-schema.ts";
import { ser } from "./json-ser-des.ts";

Deno.test("ser serializes union discriminator values as JSON strings", () => {
  const defs = createPrimitiveDefs();
  defineUnion(
    "Result",
    "kind",
    {
      ok: [f("value", p("string"))],
      err: [f("message", p("string"))],
    },
    defs,
  );

  assertEquals(
    ser(defs.Result, { kind: "ok", value: "done" }, defs),
    '{"kind":"ok","value":"done"}',
  );
});
