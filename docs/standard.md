# Standard

BDL aims to support various serialization formats and RPC protocols based on a common grammar.
However, in reality, there are too many formats and protocols with differing supported features
and design philosophies, making it difficult to cover all of them perfectly with a single standard.

Therefore, BDL introduces the `standard` attribute,
which specifies the conventions to be applied on a per-file basis.
This allows each file to clearly define
"which primitive types are provided, and which serialization formats and RPC protocols are to be used."

Details on the syntax of BDL files are covered in the [BDL Syntax](./syntax.md) document.

# The `conventional` standard

This document aims to explain the BDL standard called `conventional`.
The official tooling provided by BDL will understand and support the conventional standard well.
While BDL generally encourages defining and using your own standard tailored to your specific situation,
for those who are unsure about what to define and how to use it,
the `conventional` standard will serve as a good starting point.

First, all BDL files begin by specifying which standard is designated for that file.

```bdl
# standard - conventional
```

## Primitive Types

> [!WARNING]
> The `int64` and `integer` types should be handled with care.
>
> In some environments where 64-bit integers are not fully supported,
> [only up to 53 bits may be safely represented](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER).\
> For example, JavaScript’s `JSON.parse` function interprets all numeric input as 64-bit floating-point numbers,
> which can lead to precision loss for 64-bit integers.
>
> Although the official implementation of BDL handles JSON parsing directly to preserve data as much as possible,
> if the JSON is already parsed by the framework before BDL processes it, the information may already be lost.
>
> In Swift as well, integers that exceed the 64-bit range may be interpreted as 64-bit floating-point numbers, leading to similar issues.

- `boolean`: Represents `true` or `false`
- `int32`: A 32-bit integer ranging from `-2147483648` to `2147483647`
- `int64`: A 64-bit integer ranging from `-9223372036854775808` to `9223372036854775807`
- `integer`: An arbitrary integer including negative numbers
- `float64`: [A 64-bit IEEE 754 floating-point number](https://en.wikipedia.org/wiki/Double-precision_floating-point_format)
- `string`: A unicode string
- `bytes`: A byte array
- `object`: A dictionary with string keys and values of any type
- `void`: Represents the absence of a value
  - It can only be specified as the input or output type in a [Proc declaration](./syntax.md#Proc)
