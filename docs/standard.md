# Standard

BDL aims to support various serialization formats and RPC protocols based on a common grammar.
However, in reality, there are too many formats and protocols with differing supported features
and design philosophies, making it difficult to cover all of them perfectly with a single standard.

Therefore, BDL introduces the `standard` attribute,
which specifies the conventions to be applied on a per-file basis.
This allows each file to clearly define
"which primitive types are provided, and which serialization formats and RPC protocols are to be used."

Details on the syntax of BDL files are covered in the [BDL Syntax and Semantics](./syntax.md) document.

## The `conventional` standard

This document aims to explain the BDL standard called `conventional`.
The official tooling provided by BDL will understand and support the conventional standard well.
While BDL generally encourages defining and using your own standard tailored to your specific situation,
for those who are unsure about what to define and how to use it,
the `conventional` standard will serve as a good starting point.

First, all BDL files begin by specifying which standard is designated for that file.

```bdl
# standard - conventional
```
