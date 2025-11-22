import { assertEquals } from "jsr:@std/assert";
import { format } from "./format.ts";

Deno.test("import", () => {
  assertEquals(
    format(`
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
    format(
      `
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
      `.trim(),
    ),
    `
// hi
# standard - hi
@ http - GET // not a comment
// a comment
@ security
| hello
| bye
// a comment
@ security
| hello
| bye
    `.trim(),
  );
});

Deno.test("struct", () => {
  assertEquals(
    format(
      `
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
      `.trim(),
    ),
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
    format(
      `
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
}
      `.trim(),
    ),
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
}
    `.trim(),
  );
  assertEquals(
    format(
      `
oneof
// c1
SomeOneof 
// c2
{
  Foo, Bar,

  Baz
}
      `.trim(),
    ),
    `
// c1
// c2
oneof SomeOneof { Foo, Bar, Baz }
    `.trim(),
  );
});

Deno.test("enum", () => {
  assertEquals(
    format(
      `
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
      `.trim(),
    ),
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
