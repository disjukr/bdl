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
