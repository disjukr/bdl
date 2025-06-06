# Intermediate Representation (IR)

![IR Diagram](./excalidraws/ir.svg)

The process of compiling BDL texts into the target language can be divided into three main steps.

The first step is called Parse, where the text is converted into an abstract syntax tree (AST).\
This step is well explained in the [BDL Syntax](./syntax.md) document
using [railroad diagram](https://en.wikipedia.org/wiki/Syntax_diagram)s, so please refer to that.

The second step is called Build.
In this step, references within the AST are resolved to their actual targets and represented in a graph-like structure.

In the diagram, this step is depicted linearly, but in reality, the IR is constructed by taking multiple ASTs as input.
Therefore, when a single IR is given, it can be seen as containing all the context needed to process BDL.

Finally, through the Codegen step, text is generated in the target language.\
While BDL encourages users to develop this part themselves, if that feels overwhelming, you can use the official tooling that follows [the `conventional` standard](./standard.md#the-conventional-standard).

## `BdlIr`

This struct corresponds to the root of the BDL IR.\
It contains all the type definitions needed for code generation.

```bdl
struct BdlIr {
  modules: Module[string],
  defs: Def[string],
}
```

As seen in the definition above, it contains the `modules` and `defs` fields.

The `modules` field is a flattened table of all BDL files, using their absolute paths as keys.
It shows how the modules import one another and what type definitions are contained within each module.

The `defs` field is also a flattened table of all type definitions across BDL files, keyed by their absolute paths.

In fact, with just the `defs` information, and excluding attributes,
most of the data contained in `modules` can be reconstructed.\
The `modules` field is essentially redundant information that helps simplify code generation.

### Type Path

```
package name            pkg
 |  module directory    <pkg dir>/foo/bar
 |   |      def name    Baz
 |   |       |
vvv vvvvvvv vvv
pkg.foo.bar.Baz
^^^^^^^^^^^     <- module path  pkg.foo.bar
^^^^^^^^^^^^^^^ <- def path     pkg.foo.bar.Baz
```

The absolute path keys used in the `modules` and `defs` tables follow the type path format.

A type path consists of [identifier](./syntax.md#identifier)s connected by dots (`.`),
and when it refers to a module, it's called a module path;
when it refers to a definition, it's also referred to as a def path.

Since every def belongs to some module, a module path always precedes it's path.
BDL intentionally does not support nested type definitions, so every def path takes the form of a module path followed by the def name, connected by a dot.

> [!NOTE]
> In the context of type paths, if an identifier is used without any dots,
> it is considered the name of a primitive type.

### Attributes

Attributes are used to express things like documentation, code generation behavior, and serialization semantics.

At the IR level, attributes are represented as dictionaries with string keys and values.

During this transformation, if there are multiple attributes with the same key, the one that appears last in the AST will overwrite the others.

The following types can have attributes:

[`Module`](#module), [`Import`](#import), [`Def::Custom`](#defcustom), [`Def::Enum`](#defenum), [`Def::Oneof`](#defoneof), [`Def::Proc`](#defproc), [`Def::Struct`](#defstruct), [`Def::Union`](#defunion), [`EnumItem`](#enumitem), [`OneofItem`](#oneofitem), [`StructField`](#structfield), [`UnionItem`](#unionitem)

## `Module`

```bdl
struct Module {
  fileUrl?: string,
  attributes: string[string],
  defPaths: string[],
  imports: Import[],
}
```

A module holds a list of [type path](#type-path)s in the `defPaths` field representing the defs that belong to it.
It also has an `imports` field that lists the other modules it depends on.

## `Import`

```bdl
struct Import {
  attributes: string[string],
  modulePath: string,
  items: ImportItem[],
}
```

## `ImportItem`

```bdl
struct ImportItem {
  name: string,
  as?: string,
}
```

## `Def`

```bdl
union Def {
  Custom(
    attributes: string[string],
    name: string,
    originalType: Type,
  ),
  Enum(
    attributes: string[string],
    name: string,
    items: EnumItem[],
  ),
  Oneof(
    attributes: string[string],
    name: string,
    items: OneofItem[],
  ),
  Proc(
    attributes: string[string],
    name: string,
    inputType: Type,
    outputType: Type,
    errorType?: Type,
  ),
  Struct(
    attributes: string[string],
    name: string,
    fields: StructField[],
  ),
  Union(
    attributes: string[string],
    name: string,
    items: UnionItem[],
  ),
}
```

### `Def::Custom`

By itself, this is simply an alias for another type.

However, since BDL’s [type expression](./syntax.md#type-expression) syntax is intentionally designed to be limited in expressiveness,
the `custom` type can be used to represent complex types such as nested arrays—in other words, it serves to supplement the expressive power of BDL's type expression syntax.

```bdl
struct MyStruct {
  field: string[], // Valid
  field2: string[][], // Invalid
  field3: StringArray[], // Valid
}

custom StringArray = string[]
```

The second use case is as a hint to map a user-defined type to an appropriate existing type in the target language during code generation, treating it like a primitive type.

The second use case is to specialize a user-defined type and use it as a hint for mapping to an appropriate existing type in the target language during code generation, treating it similarly to a primitive type.

```bdl
@ javascript - Date
custom MyDate = string
```

If you're familiar with [GraphQL's custom scalar](https://graphql.org/blog/2023-01-14-graphql-scalars/)s, this serves a similar purpose.

### `Def::Enum`

An `enum` def is used to represent an enumeration.
Enumerations define a set of named values that belong to the same type.

Enums are useful for representing a fixed set of options or states. For example:

```bdl
enum Status {
  PENDING,
  ACTIVE,
  COMPLETED,
  FAILED,
}
```

### `Def::Oneof`

A `oneof` def is used when a value can be one of several types.

```bdl
oneof MyOneof {
  boolean,
  integer,
  string,
}
```

By default, BDL recommends using the [`union` syntax](./syntax.md#union), which includes tag information to make it clear which variant a value belongs to.

However, in other schema systems such as JSON Schema, it is common for users to create unions without tag information.
The `oneof` def was designed for compatibility with those cases.

Separately, `oneof` can also be useful when an existing type needs to be reused across multiple unions.

```bdl
struct MyCommonStruct {}

oneof MyOneof1 {
  MyCommonStruct,
  Foo,
}

oneof MyOneof2 {
  MyCommonStruct,
  Bar,
}
```

### `Def::Proc`

A `proc` def is used for RPC.
It describes what value is input, what value is output, and optionally, what errors may be thrown.

Whether a `proc` is single-in or multiple-in, single-out or multiple-out must be defined by the [standard](./standard.md).

```bdl
@ http - GET /users/{id}
proc HttpGetUser = HttpGetUserRequest -> HttpGetUserResponse throws HttpGetUserError

@ grpc - unary foo.bar.UserService/GetUser
proc GrpcGetUser = GrpcGetUserRequest -> GrpcGetUserResponse
```

### `Def::Struct`

### `Def::Union`

## `EnumItem`

```bdl
struct EnumItem {
  attributes: string[string],
  name: string,
}
```

## `OneofItem`

```bdl
struct OneofItem {
  attributes: string[string],
  itemType: Type,
}
```

## `StructField`

```bdl
struct StructField {
  attributes: string[string],
  name: string,
  fieldType: Type,
  optional: boolean,
}
```

## `Type`

```bdl
union Type {
  Plain(valueTypePath: string),
  Array(valueTypePath: string),
  Dictionary(valueTypePath: string, keyTypePath: string),
}
```

### `Type::Plain`

### `Type::Array`

### `Type::Dictionary`

## `UnionItem`

```bdl
struct UnionItem {
  attributes: string[string],
  name: string,
  fields: StructField[],
}
```
