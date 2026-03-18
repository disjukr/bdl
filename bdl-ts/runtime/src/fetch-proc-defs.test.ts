import { assertEquals } from "jsr:@std/assert@1";
import { a, createPrimitiveDefs, defineCustom, defineStruct, f, p } from "./data-schema.ts";
import { defineFetchProc } from "./fetch-proc.ts";

const defs = createPrimitiveDefs();
const customStringId = "__test_fetch_proc_custom_string";
const requestId = "__test_fetch_proc_request";
const responseId = "__test_fetch_proc_response";

defineCustom(
  customStringId,
  p("string"),
  {
    customTextSerDes: {
      ser: (value) => `custom:${value}`,
      des: String,
    },
  },
  defs,
);
defineStruct(
  requestId,
  [
    f("id", p(customStringId)),
    f("tags", a(customStringId)),
  ],
  defs,
);
defineStruct(
  responseId,
  [f("value", p("string"))],
  defs,
);

Deno.test("fetch runtime uses provided defs for url params and response parsing", async () => {
  let requestedUrl: URL | undefined;

  const proc = defineFetchProc(
    {
      method: "POST",
      pathname: ["/items/", ""],
      pathParams: ["id"],
      searchParams: ["tags"],
      reqType: p(requestId),
      resTypes: { 200: p(responseId) },
    },
    {
      baseUrl: "https://example.com",
      defs,
      fetch: async (input) => {
        requestedUrl = input instanceof URL ? input : new URL(String(input));
        return new Response('{"value":"ok"}', { status: 200 });
      },
    },
  );

  const result = await proc(
    {
      id: "abc",
      tags: ["red", "blue"],
    },
    {},
  );

  assertEquals(
    requestedUrl?.toString(),
    "https://example.com/items/custom%3Aabc?tags=custom%3Ared&tags=custom%3Ablue",
  );
  assertEquals(result.data, { value: "ok" });
});
