import { assertEquals } from "@std/assert";
import { formatBdl } from "./bdl.ts";

function formatForTest(text: string, config = {}) {
  return formatBdl(normalizeFixtureText(text), { finalNewline: false, ...config });
}

function normalizeFixtureText(text: string): string {
  const normalized = text.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  let indent = nonEmptyLines.length === 0
    ? 0
    : Math.min(...nonEmptyLines.map((line) => line.match(/^\s*/)![0].length));
  let stripFromSecondLine = false;
  if (indent === 0) {
    const nonEmptyTailLines = lines.slice(1).filter((line) => line.trim().length > 0);
    if (nonEmptyTailLines.length > 0) {
      const tailIndent = Math.min(
        ...nonEmptyTailLines.map((line) => line.match(/^\s*/)![0].length),
      );
      if (tailIndent > 0) {
        indent = tailIndent;
        stripFromSecondLine = true;
      }
    }
  }
  if (indent === 0) return normalized;
  return lines.map((line, index) => {
    if (stripFromSecondLine && index === 0) return line;
    return line.slice(Math.min(indent, line.length));
  }).join("\n");
}

Deno.test("import", () => {
  assertEquals(
    formatForTest(`
    import 
    // comment
    aa 
    // comment1
    .
    // comment2
    bb.cc
    { Bar
    // are
    , 
    // here
    // comes
     Baz,   // hh
    
     // b
    
     // c
    
     Baa,
     // Boo
     Baa, // hi
     // Boo
     Boo,
     A, B, C
    }
    `.trim()),
    `
// comment
// comment1
// comment2
import aa.bb.cc {
  Bar, // are
  // here
  // comes
  Baz, // hh

  // b

  // c

  Baa,
  // Boo
  Baa, // hi
  // Boo
  Boo,
  A,
  B,
  C
}
`.trim(),
  );
});

Deno.test("attribute", () => {
  assertEquals(
    formatForTest(`
    # 
    // hi
    standard - hi
    @ http - GET // not a comment
    @ security // a comment
    | hello
    | bye
    @ security
    // a comment
    | hello
    | bye
    `.trim()),
    [
      "// hi",
      "# standard - hi",
      "@ http - GET // not a comment",
      "// a comment",
      "@ security",
      "| hello",
      "| bye",
      "// a comment",
      "@ security",
      "| hello",
      "| bye",
    ].join("\n"),
  );
});

Deno.test("struct", () => {
  assertEquals(
    formatForTest(`
    struct 
    // c1
    Name
    // c2
    
    {
      @ a - b
      // hi
      @ c - d
      // c1
      f1
      // c2
      :
      // c3
      string
      // c4
      , // c5
    
    
      f2?: string, f3: string // keyType
      [number],
    
      f4: string, f5: number,
    
    
      f6: string,
    }
    `.trim()),
    `
// c1
// c2
struct Name {
  @ a - b
  // hi
  @ c - d
  // c1
  // c2
  // c3
  // c4
  f1: string, // c5

  f2?: string,
  // keyType
  f3: string[number],

  f4: string,
  f5: number,

  f6: string,
}
    `.trim(),
  );
});

Deno.test("oneof", () => {
  assertEquals(
    formatForTest(`
    oneof
    // c1
    SomeOneof 
    // c2
    {
    // c3
      @ attribute - x
      // c4
      Foo,
    
      // c5
      Bar,
      // c6
    
      A, B, C
    }
    `.trim()),
    `
// c1
// c2
oneof SomeOneof {
  // c3
  @ attribute - x
  // c4
  Foo,

  // c5
  Bar,
  // c6

  A,
  B,
  C
}
    `.trim(),
  );
  assertEquals(
    formatForTest(`
    oneof
    // c1
    SomeOneof 
    // c2
    {
      Foo, Bar,
    
      Baz
    }
    `.trim()),
    `
// c1
// c2
oneof SomeOneof { Foo, Bar, Baz }
    `.trim(),
  );
});

Deno.test("enum", () => {
  assertEquals(
    formatForTest(`
    enum
    // c1
    SomeEnum
    // c2
    {
    // c3
      @ attribute - x
      // c4
      Foo,
    
      // c5
      Bar,
      // c6
    
      A, B, C
    }
    `.trim()),
    `
// c1
// c2
enum SomeEnum {
  // c3
  @ attribute - x
  // c4
  Foo,

  // c5
  Bar,
  // c6

  A,
  B,
  C
}
    `.trim(),
  );
});

Deno.test("proc", () => {
  assertEquals(
    formatForTest(`
    proc  MyProcedure
    =
    RequestType
    ->
    ResponseType
    `.trim()),
    `
proc MyProcedure = RequestType -> ResponseType
    `.trim(),
  );
  assertEquals(
    formatForTest(`
    proc   MyProcedureWithError = RequestType
    -> ResponseType
    throws
    MyError
    `.trim()),
    `
proc MyProcedureWithError = RequestType -> ResponseType throws MyError
    `.trim(),
  );
  assertEquals(
    formatForTest(
      `proc ExtremelyLongProcedureName = ExtremelyLongRequestType -> ExtremelyLongResponseType throws ExtremelyLongErrorType`,
      { lineWidth: 80 },
    ),
    [
      "proc ExtremelyLongProcedureName =",
      "  ExtremelyLongRequestType -> ExtremelyLongResponseType",
      "  throws ExtremelyLongErrorType",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `proc ExtremelyLongProcedureName = ExtremelyLongRequestType -> ExtremelyLongResponseTypeThatKeepsGoing throws ExtremelyLongErrorTypeThatKeepsGoing`,
      { lineWidth: 60 },
    ),
    [
      "proc ExtremelyLongProcedureName =",
      "  ExtremelyLongRequestType ->",
      "  ExtremelyLongResponseTypeThatKeepsGoing",
      "  throws ExtremelyLongErrorTypeThatKeepsGoing",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `proc MyProc = // this is a very very very very very very very very long comment\nInput -> Output throws Error`,
      { lineWidth: 40 },
    ),
    [
      "proc MyProc =",
      "  // this is a very very very very very very very very long comment",
      "  Input -> Output throws Error",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `proc MyProc = Input -> Output // keep as standalone\nthrows Error`,
      { lineWidth: 120 },
    ),
    [
      "proc MyProc = Input -> Output",
      "  // keep as standalone",
      "  throws Error",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`proc A = In -> Out // note`),
    `proc A = In -> Out // note`,
  );
  assertEquals(
    formatForTest(`proc A = In -> Out // note\noneof X { Y }`),
    [
      "proc A = In -> Out // note",
      "oneof X { Y }",
    ].join("\n"),
  );
});

Deno.test("custom", () => {
  assertEquals(
    formatForTest(`
    custom   Amount
    =
    int64[string]
    `.trim()),
    `
custom Amount = int64[string]
    `.trim(),
  );
  assertEquals(
    formatForTest(`custom Amount = int64 // cmt`),
    `custom Amount = int64 // cmt`,
  );
  assertEquals(
    formatForTest(`custom Amount = int64 // cmt\noneof X { Y }`),
    [
      "custom Amount = int64 // cmt",
      "oneof X { Y }",
    ].join("\n"),
  );
});

Deno.test("union", () => {
  assertEquals(
    formatForTest(`
    union
    Result
    {
    Ok(
    code
    :
    string
    ,
    value:number,
    ),
    Err
    }
    `.trim()),
    `
union Result {
  Ok (
  code: string,
  value: number,
  ),
  Err
}
    `.trim(),
  );
  assertEquals(
    formatForTest(`union R { Ok( // note\n id: string, ), }`),
    [
      "union R {",
      "  Ok (",
      "  // note",
      "  id: string,",
      "  ),",
      "}",
    ].join("\n"),
  );
});

Deno.test("idempotency", () => {
  const samples = [
    `import aa.bb { A, B }`,
    `struct User { id:string, name:string }`,
    `oneof Value { A, B, C }`,
    `enum E { A, B }`,
    `proc GetUser = GetUserInput -> GetUserOutput throws GetUserError`,
    `custom Amount = int64[string]`,
    `union Result { Ok(id: string,), Err, }`,
  ];
  for (const sample of samples) {
    const once = formatForTest(sample);
    const twice = formatForTest(once);
    assertEquals(twice, once);
  }
});

Deno.test("config: indent", () => {
  assertEquals(
    formatForTest(`
    struct User {
    id: string,
    }
    `.trim(), { indent: { type: "tab", count: 1 } }),
    `
struct User {
	id: string,
}
    `.trim(),
  );
});

Deno.test("config: lineWidth", () => {
  assertEquals(
    formatForTest(`
    oneof Value {
    Alpha,
    Beta,
    Gamma,
    Delta
    }
    `.trim(), { lineWidth: 20 }),
    `
oneof Value {
  Alpha,
  Beta,
  Gamma,
  Delta
}
    `.trim(),
  );
});

Deno.test("trailing newline at eof", () => {
  assertEquals(
    formatForTest(`oneof Value { A, B }\n\n`),
    `oneof Value { A, B }`,
  );
});

Deno.test("preserve newlines between module statements", () => {
  assertEquals(
    formatForTest(`
    import pkg.mod { A, }
    
    oneof Value {
      A,
    }
    `.trim()),
    [
      "import pkg.mod {",
      "  A,",
      "}",
      "",
      "oneof Value { A, }",
    ].join("\n"),
  );
});

Deno.test("limit blank lines between module statements", () => {
  assertEquals(
    formatForTest(`
    import pkg.mod { A, }



    oneof Value {
      A,
    }
    `.trim()),
    [
      "import pkg.mod {",
      "  A,",
      "}",
      "",
      "oneof Value { A, }",
    ].join("\n"),
  );
});

Deno.test("default final newline", () => {
  assertEquals(
    formatBdl("oneof Value { A, B }"),
    "oneof Value { A, B }\n",
  );
});
