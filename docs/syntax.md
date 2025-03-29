# BDL Syntax

A BDL file consists of a list of [Top Level Statement](#top-level-statement)s.

![](./syntax-diagrams/out/bdl.svg)

## WS

It is used to distinguish between different syntactic elements or to help humans read code more easily.

It does not affect the contents of the AST or IR.

If you want to inject meta-information into the AST or IR, use [Attribute](#attribute)s instead of [Comment](#comment)s.

![](./syntax-diagrams/out/ws.svg)

## Comment

BDL only supports C-style single-line comments.
Multi-line comment support may be added in future versions, but it has been omitted for simplicity of implementation.

![](./syntax-diagrams/out/comment.svg)

## Identifier

Identifiers in BDL currently have very limited expressions.
This is to avoid potential interference when generating code in various languages.

In future versions of BDL, the range of allowed characters will be expanded, and instead, restrictions will be enforced through the [Standard](./TODO).

![](./syntax-diagrams/out/identifier.svg)

## Top Level Statement

![](./syntax-diagrams/out/top-level-statement.svg)

## Attribute

![](./syntax-diagrams/out/attribute.svg)

## Type Expression

![](./syntax-diagrams/out/type-expression.svg)

## Custom

![](./syntax-diagrams/out/custom.svg)

## Enum (TODO)

![](./syntax-diagrams/out/enum.svg)

## Import (TODO)

![](./syntax-diagrams/out/import.svg)

## Oneof (TODO)

![](./syntax-diagrams/out/oneof.svg)

## Proc (TODO)

![](./syntax-diagrams/out/proc.svg)

## Socket (TODO)

![](./syntax-diagrams/out/socket.svg)

## Struct (TODO)

![](./syntax-diagrams/out/struct.svg)

## Union (TODO)

![](./syntax-diagrams/out/union.svg)
