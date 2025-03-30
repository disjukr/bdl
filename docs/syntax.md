# BDL Syntax and Semantics

> [!NOTE]
> This document covers the syntax structure and semantics of BDL.
>
> For information on which primitive types exist, how attributes are used, how the serialization format is structured, and how the RPC protocol is composed, please refer to the [Standard](./TODO).

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
integer           // Plain
integer[]         // Array
integer[string]   // Dictionary
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

You can define [composite data type](https://en.wikipedia.org/wiki/Composite_data_type)s using the struct statement.

```bdl
struct MyStruct {
  foo: integer,
  bar?: string, // `?` means the field is optional
}
```

![](./syntax-diagrams/out/struct.svg)

### Struct Field

![](./syntax-diagrams/out/struct-field.svg)

## Enum

The enum statement is used to represent [enumerated type](https://en.wikipedia.org/wiki/Enumerated_type)s.

```bdl
enum MyEnum {
  FOO,
  BAR,
  BAZ,
}
```

![](./syntax-diagrams/out/enum.svg)

## Union

The union statement is used to represent [tagged union](https://en.wikipedia.org/wiki/Tagged_union)s.

```bdl
union MyUnion {
  Foo, // If there are no fields, parentheses can be omitted
  Bar(),
  Baz(
    foo: integer,
    bar?: string,
  ),
}
```

![](./syntax-diagrams/out/union.svg)

### Union Item

![](./syntax-diagrams/out/union-item.svg)

## Oneof

The oneof statement is used to represent [untagged union](https://en.wikipedia.org/wiki/Tagged_union#Advantages_and_disadvantages)s.

This syntax was designed solely for compatibility with existing schema languages.

Unless you need compatibility with existing schema languages, serialization formats, or RPC protocols, you should use the union statement instead of oneof.

```bdl
oneof MyOneof {
  boolean,
  integer,
  string,
}
```

![](./syntax-diagrams/out/oneof.svg)

## Custom

The custom statement is used when you want to define user-defined types beyond the primitives specified in the standard.

Tooling such as code generation should provide a way for users to express their types through attributes within the custom statement.

```bdl
custom MyString = string
```

![](./syntax-diagrams/out/custom.svg)
