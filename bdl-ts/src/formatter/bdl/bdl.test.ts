import { assertEquals, assertThrows } from "@std/assert";
import { formatBdl, type FormatConfigInput } from "../bdl.ts";

function formatForTest(text: string, config: FormatConfigInput = {}) {
  return formatBdl(normalizeFixtureText(text), {
    finalNewline: false,
    ...config,
  });
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
    const nonEmptyTailLines = lines.slice(1).filter((line) =>
      line.trim().length > 0
    );
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

function assertLineWidthBoundary(
  source: string,
  expectedOneline: string,
  expectedMultiline: string,
): void {
  const boundaryWidth = expectedOneline.length;
  assertEquals(
    formatForTest(source, { lineWidth: boundaryWidth }),
    expectedOneline,
  );
  assertEquals(
    formatForTest(source, { lineWidth: boundaryWidth - 1 }),
    expectedMultiline,
  );
}

async function assertFixture(
  fixtureName: string,
  config: FormatConfigInput = {},
): Promise<void> {
  const input = await Deno.readTextFile(
    new URL(`./fixtures/${fixtureName}.input.bdl`, import.meta.url),
  );
  const expected = (await Deno.readTextFile(
    new URL(`./fixtures/${fixtureName}.expected.bdl`, import.meta.url),
  )).replaceAll("\r\n", "\n").trimEnd();
  assertEquals(formatBdl(input, { finalNewline: false, ...config }), expected);
}

type ModuleLevelStatementName =
  | "Attribute"
  | "Import"
  | "Struct"
  | "Oneof"
  | "Enum"
  | "Proc"
  | "Custom"
  | "Union";

const statementCoverageMatrix: Record<
  ModuleLevelStatementName,
  [string, string, string, ...string[]]
> = {
  Attribute: ["basic", "comment", "multiline-content"],
  Import: ["basic", "comment", "alias+comma"],
  Struct: ["basic", "comment", "attribute-mix"],
  Oneof: ["basic", "comment", "lineWidth-boundary"],
  Enum: ["basic", "comment", "attribute-mix"],
  Proc: ["basic", "comment", "line-wrap"],
  Custom: ["basic", "comment", "container-type"],
  Union: ["basic", "comment", "inline-struct"],
};

Deno.test("coverage: module-level statement matrix is complete", () => {
  assertEquals(Object.keys(statementCoverageMatrix).sort(), [
    "Attribute",
    "Custom",
    "Enum",
    "Import",
    "Oneof",
    "Proc",
    "Struct",
    "Union",
  ]);
});

Deno.test("statement/import: aliases, comments, width, and trailing comment rules", () => {
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
  C,
}
`.trim(),
  );
  assertEquals(
    formatForTest(`import aa.bb { A,\n}`),
    `import aa.bb { A }`,
  );
  assertEquals(
    formatForTest(`import pkg.mod { A,\nB }`),
    "import pkg.mod { A, B }",
  );
  assertEquals(
    formatForTest(
      `import very.long.namespace.path { AlphaIdentifier, BetaIdentifier, GammaIdentifier }`,
      { lineWidth: 40 },
    ),
    [
      "import very.long.namespace.path {",
      "  AlphaIdentifier,",
      "  BetaIdentifier,",
      "  GammaIdentifier,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `import pkg.mod { A, // keep this inline comment
B, }`,
      {
        lineWidth: 12,
      },
    ),
    [
      "import pkg.mod {",
      "  A, // keep this inline comment",
      "  B,",
      "}",
    ].join("\n"),
  );
});

Deno.test("statement/attribute: line and multiline content formatting", () => {
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

Deno.test("statement/struct: fields, attributes, comments, and width transitions", () => {
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
  assertEquals(
    formatForTest(`struct User { id: string,\n}`),
    `struct User { id: string }`,
  );
  assertEquals(
    formatForTest(`struct User { id: string,\nname: string }`),
    "struct User { id: string, name: string }",
  );
  assertEquals(
    formatForTest(`struct // note\nUser { id: string, }`),
    [
      "// note",
      "struct User { id: string }",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `struct User { veryLongFieldName: string, anotherVeryLongFieldName: string }`,
      { lineWidth: 45 },
    ),
    [
      "struct User {",
      "  veryLongFieldName: string,",
      "  anotherVeryLongFieldName: string,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `struct User { id: string, // keep this inline comment
name: string, }`,
      { lineWidth: 16 },
    ),
    [
      "struct User {",
      "  id: string, // keep this inline comment",
      "  name: string,",
      "}",
    ].join("\n"),
  );
});

Deno.test("statement/oneof: item layout and width transitions", () => {
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
  C,
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
oneof SomeOneof {
  Foo,
  Bar,

  Baz,
}
    `.trim(),
  );
  assertEquals(
    formatForTest(`oneof SomeOneof { Foo, Bar, Baz }`, { lineWidth: 20 }),
    [
      "oneof SomeOneof {",
      "  Foo,",
      "  Bar,",
      "  Baz,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`oneof Foo { Bar\n}`),
    "oneof Foo { Bar }",
  );
  assertEquals(
    formatForTest(
      `oneof Kind { A, // keep this inline comment
B, }`,
      { lineWidth: 12 },
    ),
    [
      "oneof Kind {",
      "  A, // keep this inline comment",
      "  B,",
      "}",
    ].join("\n"),
  );
});

Deno.test("statement/enum: item layout and width transitions", () => {
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
  C,
}
    `.trim(),
  );
  assertEquals(
    formatForTest(`enum E { A,\n}`),
    `enum E { A }`,
  );
  assertEquals(
    formatForTest(`enum Status { Ready,\nDone }`),
    "enum Status { Ready, Done }",
  );
  assertEquals(
    formatForTest(`enum // note\nStatus { Ready, }`),
    [
      "// note",
      "enum Status { Ready }",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `enum Status { ReallyLongValueOne, ReallyLongValueTwo, ReallyLongValueThree }`,
      { lineWidth: 38 },
    ),
    [
      "enum Status {",
      "  ReallyLongValueOne,",
      "  ReallyLongValueTwo,",
      "  ReallyLongValueThree,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `enum Status { Ready, // keep this inline comment
Done, }`,
      { lineWidth: 14 },
    ),
    [
      "enum Status {",
      "  Ready, // keep this inline comment",
      "  Done,",
      "}",
    ].join("\n"),
  );
});

Deno.test("statement/proc: wrapping strategy and trailing comment behavior", () => {
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
    formatForTest(
      `proc ExtremelyLongProcedureName = ExtremelyLongRequestType -> ExtremelyLongResponseType // keep`,
      { lineWidth: 30 },
    ),
    [
      "// keep",
      "proc ExtremelyLongProcedureName =",
      "  ExtremelyLongRequestType ->",
      "  ExtremelyLongResponseType",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `proc A = In -> Out // this comment is intentionally long`,
      { lineWidth: 18 },
    ),
    `proc A = In -> Out // this comment is intentionally long`,
  );
  assertEquals(
    formatForTest(`proc A = In -> Out // note\noneof X { Y }`),
    [
      "proc A = In -> Out // note",
      "oneof X { Y }",
    ].join("\n"),
  );
});

Deno.test("statement/custom: wrapping strategy and trailing comment behavior", () => {
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
    formatForTest(
      `custom VeryLongCustomTypeName = VeryLongOriginalTypeName // keep`,
      { lineWidth: 20 },
    ),
    [
      "// keep",
      "custom VeryLongCustomTypeName =",
      "  VeryLongOriginalTypeName",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `custom VeryLongCustomTypeName = VeryLongOriginalTypeName`,
      { lineWidth: 20 },
    ),
    [
      "custom VeryLongCustomTypeName =",
      "  VeryLongOriginalTypeName",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `custom A = string // this comment is intentionally long`,
      { lineWidth: 17 },
    ),
    `custom A = string // this comment is intentionally long`,
  );
  assertEquals(
    formatForTest(`custom Amount = int64 // cmt\noneof X { Y }`),
    [
      "custom Amount = int64 // cmt",
      "oneof X { Y }",
    ].join("\n"),
  );
});

Deno.test("statement/proc-custom: keyword/name comments move above declarations", () => {
  assertEquals(
    formatForTest(`proc // note
Get = In -> Out`),
    [
      "// note",
      "proc Get = In -> Out",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`custom // note
Amount = int64`),
    [
      "// note",
      "custom Amount = int64",
    ].join("\n"),
  );
});

Deno.test("oneline: keeps compact rendering for import/custom/struct type forms", () => {
  assertEquals(
    formatForTest(`import pkg.mod { A as Alias, }`),
    "import pkg.mod { A as Alias }",
  );
  assertEquals(
    formatForTest(`custom Amount = int64[string]`),
    "custom Amount = int64[string]",
  );
  assertEquals(
    formatForTest(`struct User { id?: string[number], }`),
    "struct User { id?: string[number] }",
  );
});

Deno.test("statement/union: nested struct formatting and width transitions", () => {
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
  Ok(
    code: string,
    value: number,
  ),
  Err,
}
    `.trim(),
  );
  assertEquals(
    formatForTest(`union R { Ok( // note\n id: string, ), }`),
    [
      "union R {",
      "  Ok(",
      "    // note",
      "    id: string,",
      "  ),",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`union R { Ok,\n// note\nErr }`),
    [
      "union R {",
      "  Ok,",
      "  // note",
      "  Err,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`union R { Ok(id: string,\n), }`),
    `union R { Ok(id: string) }`,
  );
  assertEquals(
    formatForTest(`union R { Ok(id: string, another: string, ), }`, {
      lineWidth: 24,
    }),
    [
      "union R {",
      "  Ok(",
      "    id: string,",
      "    another: string,",
      "  ),",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`union R {Ok(id: string,),\nErr}`),
    `union R { Ok(id: string), Err }`,
  );
  assertEquals(
    formatForTest(`union R {Ok( id: string,),\nErr}`),
    `union R { Ok(id: string), Err }`,
  );
  assertEquals(
    formatForTest(`union U { Ok(id: string,), Err }`, { lineWidth: 16 }),
    [
      "union U {",
      "  Ok(",
      "    id: string,",
      "  ),",
      "  Err,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`union U {\n  Ok(id: string,), // note\n  Err,\n}`, {
      lineWidth: 16,
    }),
    [
      "union U {",
      "  // note",
      "  Ok(",
      "    id: string,",
      "  ),",
      "  Err,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `union U {\n  Ok(id: string,), // very long note\n  Err,\n}`,
      {
        lineWidth: 17,
      },
    ),
    [
      "union U {",
      "  Ok(id: string), // very long note",
      "  Err,",
      "}",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(`union U { Ok(\n), Err }`),
    `union U { Ok(), Err }`,
  );
  assertEquals(
    formatForTest(`union R { Ok,\n}`),
    `union R { Ok }`,
  );
  assertEquals(
    formatForTest(`union Result { Ok,\nErr }`),
    `union Result { Ok, Err }`,
  );
  assertEquals(
    formatForTest(`union // note\nResult { Ok, }`),
    [
      "// note",
      "union Result { Ok }",
    ].join("\n"),
  );
  assertEquals(
    formatForTest(
      `union Result { ReallyLongOkType, ReallyLongErrType, ReallyLongPendingType }`,
      { lineWidth: 46 },
    ),
    [
      "union Result {",
      "  ReallyLongOkType,",
      "  ReallyLongErrType,",
      "  ReallyLongPendingType,",
      "}",
    ].join("\n"),
  );
});

Deno.test("errors: parse failure keeps top-level message and original cause", () => {
  const error = assertThrows(
    () => formatBdl("oneof Value {"),
    Error,
    "Formatter parse failed:",
  );
  assertEquals(error.cause instanceof Error, true);
});

Deno.test("lineWidth: boundary transitions across statement kinds", () => {
  assertLineWidthBoundary(
    "import pkg.mod { Alpha, Beta }",
    "import pkg.mod { Alpha, Beta }",
    [
      "import pkg.mod {",
      "  Alpha,",
      "  Beta,",
      "}",
    ].join("\n"),
  );

  assertLineWidthBoundary(
    "struct User { id: string, name: string }",
    "struct User { id: string, name: string }",
    [
      "struct User {",
      "  id: string,",
      "  name: string,",
      "}",
    ].join("\n"),
  );

  assertLineWidthBoundary(
    "enum Status { Ready, Done }",
    "enum Status { Ready, Done }",
    [
      "enum Status {",
      "  Ready,",
      "  Done,",
      "}",
    ].join("\n"),
  );

  assertLineWidthBoundary(
    "union Result { Ok, Err }",
    "union Result { Ok, Err }",
    [
      "union Result {",
      "  Ok,",
      "  Err,",
      "}",
    ].join("\n"),
  );

  assertLineWidthBoundary(
    "proc Get = Input -> Output",
    "proc Get = Input -> Output",
    [
      "proc Get =",
      "  Input -> Output",
    ].join("\n"),
  );

  assertLineWidthBoundary(
    "custom Amount = int64[string]",
    "custom Amount = int64[string]",
    [
      "custom Amount =",
      "  int64[string]",
    ].join("\n"),
  );
});

Deno.test("config: invalid values are coerced to defaults", () => {
  const source = "oneof Value { Alpha, Beta, Gamma }";
  for (
    const invalidLineWidth of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]
  ) {
    assertEquals(
      formatForTest(source, { lineWidth: invalidLineWidth }),
      "oneof Value { Alpha, Beta, Gamma }",
    );
  }

  const invalidIndentConfig = {
    lineWidth: 20,
    indent: { type: "invalid", count: -2 },
  } as unknown as FormatConfigInput;
  assertEquals(
    formatForTest(source, invalidIndentConfig),
    [
      "oneof Value {",
      "  Alpha,",
      "  Beta,",
      "  Gamma,",
      "}",
    ].join("\n"),
  );

  const invalidBooleanConfig = {
    finalNewline: "invalid",
    triviaCache: "invalid",
  } as unknown as FormatConfigInput;
  assertEquals(
    formatBdl("oneof Value { A, B }", invalidBooleanConfig),
    "oneof Value { A, B }\n",
  );
});

Deno.test("config: triviaCache on/off output parity", () => {
  const samples: Array<{ text: string; config?: FormatConfigInput }> = [
    { text: "import pkg.mod { A, B, C }" },
    {
      text: "struct User { id: string, name: string, age: int32 }",
      config: { lineWidth: 24 },
    },
    { text: "enum Status { Ready, Done, Failed }", config: { lineWidth: 18 } },
    {
      text: "proc GetUser = GetUserInput -> GetUserOutput throws GetUserError",
      config: { lineWidth: 42 },
    },
    {
      text: "custom Amount = int64[string] // note",
      config: { lineWidth: 18 },
    },
    {
      text:
        "union Result { Ok(id: string,), // keep this inline comment\nErr, }",
      config: { lineWidth: 17 },
    },
  ];
  for (const sample of samples) {
    const cacheOn = formatForTest(sample.text, {
      ...(sample.config ?? {}),
      triviaCache: true,
    });
    const cacheOff = formatForTest(sample.text, {
      ...(sample.config ?? {}),
      triviaCache: false,
    });
    assertEquals(cacheOn, cacheOff);
  }
});

Deno.test("fixture: validates mixed-module formatting with golden files", async () => {
  await assertFixture("complex-mixed");
});

Deno.test("fixture: validates line-width and trailing-comment policy with golden files", async () => {
  await assertFixture("comment-width", { lineWidth: 17 });
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
    `@ auth - bearer\nproc Login = LoginReq -> LoginRes throws LoginErr`,
    `struct Box { data: bytes[string], }\n\ncustom Token = string`,
    `oneof Payload { A, B, C, D }\n\nenum Kind { X, Y, Z }`,
    `union Outcome { Ok(id: string,), @ reason - failed\nErr, }`,
    `import pkg.api { User as ApiUser, Role, }\n\nstruct Use { user: ApiUser, role: Role, }`,
  ];
  for (const sample of samples) {
    const once = formatForTest(sample);
    const twice = formatForTest(once);
    assertEquals(twice, once);
  }
  assertEquals(samples.length >= 10, true);
});

Deno.test("edge: trailing comma mixed", () => {
  assertEquals(
    formatForTest(`oneof A { X, Y }\noneof B { X, Y, }`),
    [
      "oneof A { X, Y }",
      "oneof B { X, Y }",
    ].join("\n"),
  );
});

Deno.test("edge: inline comment then next comment before throws", () => {
  assertEquals(
    formatForTest(`proc A = In -> Out // inline\n// block-like\nthrows Err`),
    [
      "proc A = In -> Out",
      "  // inline",
      "  // block-like",
      "  throws Err",
    ].join("\n"),
  );
});

Deno.test("edge: multiline attribute adjacent to single-line attribute", () => {
  assertEquals(
    formatForTest(`
    struct S {
    @ first - x
    @ second
    | line1
    | line2
    @ third - y
    value: string,
    }
    `.trim()),
    [
      "struct S {",
      "  @ first - x",
      "  @ second",
      "  | line1",
      "  | line2",
      "  @ third - y",
      "  value: string,",
      "}",
    ].join("\n"),
  );
});

Deno.test("edge: oneof oneline vs multiline boundary", () => {
  const source = `oneof Value { Alpha, Beta, Gamma }`;
  const oneline = `oneof Value { Alpha, Beta, Gamma }`;
  assertEquals(
    formatForTest(source, { lineWidth: oneline.length }),
    oneline,
  );
  assertEquals(
    formatForTest(source, { lineWidth: oneline.length - 1 }),
    [
      "oneof Value {",
      "  Alpha,",
      "  Beta,",
      "  Gamma,",
      "}",
    ].join("\n"),
  );
});

Deno.test("edge: union item struct with nested attribute", () => {
  assertEquals(
    formatForTest(`
    union Response {
    Ok(
    @ note - alpha
    id: string,
    ),
    @ reason - failed
    Err
    }
    `.trim()),
    [
      "union Response {",
      "  Ok(",
      "    @ note - alpha",
      "    id: string,",
      "  ),",
      "  @ reason - failed",
      "  Err,",
      "}",
    ].join("\n"),
  );
});

Deno.test("config: indent", () => {
  assertEquals(
    formatForTest(
      `
    struct User {
    id: string,
    }
    `.trim(),
      { indent: { type: "tab", count: 1 } },
    ),
    `
struct User {
	id: string,
}
    `.trim(),
  );
});

Deno.test("config: lineWidth", () => {
  assertEquals(
    formatForTest(
      `
oneof Value {
  Alpha,
  Beta,
  Gamma,
  Delta,
}
    `.trim(),
      { lineWidth: 20 },
    ),
    `
oneof Value {
  Alpha,
  Beta,
  Gamma,
  Delta,
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
      "import pkg.mod { A }",
      "",
      "oneof Value {",
      "  A,",
      "}",
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
      "import pkg.mod { A }",
      "",
      "oneof Value {",
      "  A,",
      "}",
    ].join("\n"),
  );
});

Deno.test("default final newline", () => {
  assertEquals(
    formatBdl("oneof Value { A, B }"),
    "oneof Value { A, B }\n",
  );
});

Deno.test("ignore-file directive: formatBdl returns input unchanged", () => {
  const source = [
    "// bdlc-fmt-ignore-file",
    "oneof Value { A,",
    "}",
  ].join("\n");
  assertEquals(formatBdl(source), source);
  assertEquals(
    formatBdl(source, { finalNewline: false, lineWidth: 10 }),
    source,
  );
});

Deno.test("ignore directive: skip formatting for the next module statement", () => {
  const source = [
    "oneof First { A, B, }",
    "",
    "// bdlc-fmt-ignore",
    "oneof Second { A,",
    "}",
  ].join("\n");
  assertEquals(
    formatBdl(source, { finalNewline: false }),
    [
      "oneof First { A, B }",
      "",
      "// bdlc-fmt-ignore",
      "oneof Second { A,",
      "}",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for the next block statement", () => {
  assertEquals(
    formatForTest(`
    struct User {
      id:string,
      // bdlc-fmt-ignore
      name  :   string,
    }
    `.trim()),
    [
      "struct User {",
      "  id: string,",
      "  // bdlc-fmt-ignore",
      "  name  :   string,",
      "}",
    ].join("\n"),
  );
});

Deno.test("ignore directive: preserves attributed module statement as one unit", () => {
  const source = [
    "oneof First { A, B, }",
    "",
    "// bdlc-fmt-ignore",
    "@ http - GET",
    "proc   GetUser=GetUserInput->GetUserOutput",
    "",
    "oneof Last { X, Y, }",
  ].join("\n");
  assertEquals(
    formatBdl(source, { finalNewline: false }),
    [
      "oneof First { A, B }",
      "",
      "// bdlc-fmt-ignore",
      "@ http - GET",
      "proc   GetUser=GetUserInput->GetUserOutput",
      "",
      "oneof Last { X, Y }",
    ].join("\n"),
  );
});

Deno.test("ignore directive: preserves attributed block item as one unit", () => {
  assertEquals(
    formatForTest(`
    struct User {
      id: string,
      // bdlc-fmt-ignore
      @ validation - strict
      name  :   string,
      age:number,
    }
    `.trim()),
    [
      "struct User {",
      "  id: string,",
      "  // bdlc-fmt-ignore",
      "  @ validation - strict",
      "  name  :   string,",
      "  age: number,",
      "}",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for import statement", () => {
  const source = [
    "oneof First { A, B, }",
    "",
    "// bdlc-fmt-ignore",
    "import pkg.mod { A,",
    "}",
    "",
    "oneof Last { X, Y, }",
  ].join("\n");
  assertEquals(
    formatBdl(source, { finalNewline: false }),
    [
      "oneof First { A, B }",
      "",
      "// bdlc-fmt-ignore",
      "import pkg.mod { A,",
      "}",
      "",
      "oneof Last { X, Y }",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for custom statement", () => {
  const source = [
    "oneof First { A, B, }",
    "",
    "// bdlc-fmt-ignore",
    "custom   Amount=int64[string]",
    "",
    "oneof Last { X, Y, }",
  ].join("\n");
  assertEquals(
    formatBdl(source, { finalNewline: false }),
    [
      "oneof First { A, B }",
      "",
      "// bdlc-fmt-ignore",
      "custom   Amount=int64[string]",
      "",
      "oneof Last { X, Y }",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for enum statement", () => {
  const source = [
    "oneof First { A, B, }",
    "",
    "// bdlc-fmt-ignore",
    "enum Status { Ready,",
    "}",
    "",
    "oneof Last { X, Y, }",
  ].join("\n");
  assertEquals(
    formatBdl(source, { finalNewline: false }),
    [
      "oneof First { A, B }",
      "",
      "// bdlc-fmt-ignore",
      "enum Status { Ready,",
      "}",
      "",
      "oneof Last { X, Y }",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for union statement", () => {
  const source = [
    "oneof First { A, B, }",
    "",
    "// bdlc-fmt-ignore",
    "union Result { Ok,",
    "Err }",
    "",
    "oneof Last { X, Y, }",
  ].join("\n");
  assertEquals(
    formatBdl(source, { finalNewline: false }),
    [
      "oneof First { A, B }",
      "",
      "// bdlc-fmt-ignore",
      "union Result { Ok,",
      "Err }",
      "",
      "oneof Last { X, Y }",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for import item", () => {
  assertEquals(
    formatForTest(`
    import pkg.mod {
      A   as   A1,
      // bdlc-fmt-ignore
      Foo    as    Bar,
      C   as   C1,
    }
    `.trim()),
    [
      "import pkg.mod {",
      "  A as A1,",
      "  // bdlc-fmt-ignore",
      "  Foo    as    Bar,",
      "  C as C1,",
      "}",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for enum item", () => {
  assertEquals(
    formatForTest(`
    enum Status {
      Ready   ,
      // bdlc-fmt-ignore
      Running   ,
      Done   ,
    }
    `.trim()),
    [
      "enum Status {",
      "  Ready,",
      "  // bdlc-fmt-ignore",
      "  Running   ,",
      "  Done,",
      "}",
    ].join("\n"),
  );
});

Deno.test("ignore directive: skip formatting for union item", () => {
  assertEquals(
    formatForTest(`
    union Result {
      Ok   ,
      // bdlc-fmt-ignore
      Err (  message : string, ),
      Unknown   ,
    }
    `.trim()),
    [
      "union Result {",
      "  Ok,",
      "  // bdlc-fmt-ignore",
      "  Err (  message : string, ),",
      "  Unknown,",
      "}",
    ].join("\n"),
  );
});
