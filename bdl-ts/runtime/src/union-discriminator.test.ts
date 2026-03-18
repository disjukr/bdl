import { assertEquals } from "jsr:@std/assert@1";
import { defineUnion, f, globalDefs, p } from "./data-schema.ts";
import { defineFetchProc } from "./fetch-proc.ts";
import { ser } from "./json-ser-des.ts";

const unionId = "__test_union_discriminator_issue_50_51";

if (!(unionId in globalDefs)) {
  defineUnion(
    unionId,
    "kind",
    {
      Cat: [f("petId", p("string")), f("name", p("string"))],
      Dog: [f("petId", p("string")), f("bark", p("string"))],
    },
    globalDefs,
  );
}

Deno.test("json serializer quotes union discriminator values", () => {
  const json = ser(globalDefs[unionId], {
    kind: "Cat",
    petId: "pet-1",
    name: "Milo",
  });

  assertEquals(json, '{"kind":"Cat","petId":"pet-1","name":"Milo"}');
  assertEquals(JSON.parse(json), {
    kind: "Cat",
    petId: "pet-1",
    name: "Milo",
  });
});

Deno.test("fetch runtime uses schema discriminator for url resolution and body serialization", async () => {
  let requestedUrl: URL | undefined;
  let requestedInit: RequestInit | undefined;

  const proc = defineFetchProc(
    {
      method: "POST",
      pathname: ["/pets/", ""],
      pathParams: ["petId"],
      searchParams: [],
      reqType: p(unionId),
      resTypes: { 200: p("void") },
    },
    {
      baseUrl: "https://example.com",
      fetch: async (input, init) => {
        requestedUrl = input instanceof URL ? input : new URL(String(input));
        requestedInit = init;
        return new Response("null", { status: 200 });
      },
    },
  );

  await proc(
    {
      kind: "Cat",
      petId: "pet/1",
      name: "Milo",
    },
    {},
  );

  assertEquals(requestedUrl?.toString(), "https://example.com/pets/pet%2F1");
  assertEquals(requestedInit?.body, '{"kind":"Cat","name":"Milo"}');
});
