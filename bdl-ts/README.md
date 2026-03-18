# bdl-ts

This is a TypeScript implementation of BDL.\
It provides modules that define AST and IR types, as well as a parser and an IR
builder module.\
You can use this library to implement your own BDL code generation.

The repository also includes `runtime/`, which provides JSON and fetch helpers
for generated clients. Union values in that runtime follow the discriminator key
declared in the schema, including custom discriminator names.
