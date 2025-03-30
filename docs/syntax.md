# BDL Syntax and Basic Semantics

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

```bdl
// Only single line comments are allowed
```

![](./syntax-diagrams/out/comment.svg)

## Identifier

Identifiers in BDL currently have very limited expressions.
This is to avoid potential interference when generating code in various languages.

In future versions of BDL, the range of allowed characters will be expanded, and instead, restrictions will be enforced through the [Standard](./TODO).

```bdl
abc     // Valid
Abc     // Valid
123abc  // Invalid (Numbers cannot come first)
abc_123 // Valid
_abc    // Valid
$abc    // Invalid (Only underscores are allowed as special characters)
한글    // Invalid (Only ASCII alphabet characters are allowed)
```

![](./syntax-diagrams/out/identifier.svg)

## Attribute

The attribute syntax is used to decorate BDL syntactic structures.

If it starts with the `#` character, it decorates the syntactic structure that contains this attribute, and if it starts with the `@` character, it decorates the syntactic structure that follows this attribute.

```bdl
// Attributes that start with `#` are called inner attributes
# standard - conventional

// If it starts with @, it is called an outer attribute
@ http - GET /hello
proc GetHello = GetHelloReq -> GetHelloRes throws GetHelloErr
```

![](./syntax-diagrams/out/attribute.svg)

## Type Expression

In BDL, type expressions have three variations.

There is the _Plain_ expression that represents the type itself,
the _Array_ expression that represents a list-type container,
and the _Dictionary_ expression that represents a container with a list of keys and values.

In the case of a Plain expression, only the type name is written.
For an Array expression, `[]` is appended.
For a Dictionary expression, the key type is written inside brackets.

```bdl
int32           // Plain
int32[]         // Array
int32[string]   // Dictionary
```

![](./syntax-diagrams/out/type-expression.svg)

## Top Level Statement

The basic structure of BDL is a flat list of data model and procedure definitions within a module file.

Data models cannot be nested. For example, a struct definition cannot contain another struct definition.
This constraint simplifies the structure of the AST and IR, making code generation into other languages more straightforward.

![](./syntax-diagrams/out/top-level-statement.svg)

## Import

The import statement allows you to bring in data model definitions from other BDL module files.

```bdl
import pkg.dir.mod {
  TheirStruct,
  TheirEnum as MyEnum, // Import alias
}

struct MyStruct {
  // Valid
  field: TheirStruct,

  // Invalid. If you imported it with an alias, you must use the aliased name.
  field2: TheirEnum,

  // Valid
  field3: MyEnum,
}
```

![](./syntax-diagrams/out/import.svg)

## Proc

The proc statement is used to define procedures.
A procedure contains input, output, and error types.

```bdl
@ http - GET /hello
proc GetHello = GetHelloReq -> GetHelloRes throws GetHelloErr
```

![](./syntax-diagrams/out/proc.svg)

## Struct

![](./syntax-diagrams/out/struct.svg)

### Struct Field

![](./syntax-diagrams/out/struct-field.svg)

## Enum

![](./syntax-diagrams/out/enum.svg)

## Oneof

![](./syntax-diagrams/out/oneof.svg)

## Union

![](./syntax-diagrams/out/union.svg)

### Union Item

![](./syntax-diagrams/out/union-item.svg)

## Custom

![](./syntax-diagrams/out/custom.svg)
