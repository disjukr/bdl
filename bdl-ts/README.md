# bdl-ts

This is a TypeScript implementation of BDL.\
It provides modules that define AST and IR types, as well as a parser and an IR
builder module.\
You can use this library to implement your own BDL code generation.

Builtin standards are bundled as generated TypeScript modules, so the CLI and
build scripts work with plain `deno run` and `deno compile` without extra raw
import flags.
