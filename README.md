# BDL - Bridge Definition Language

> [!WARNING]
> It's still heavily under development.
> A lot has been built already, but it's not in a state ready for production use, so please keep that in mind.

BDL is an interface definition language for RPC.
Think of it as a polished version of OpenAPI and Protobuf.

## Why create something new instead of using OpenAPI or Protobuf?

BDL isn’t meant to completely replace existing tools.

When it comes to things like serialization formats or RPC protocols, BDL leverages what already exists whenever possible—for example, using JSON with HTTP or sticking with Protobuf’s wire format and gRPC.

What BDL really focuses on is making the schema language clean and straightforward.

It keeps the syntax minimal and intentionally limited to a small set of well-chosen declarations for describing data models.

To avoid creating anonymous types, BDL also disallows nested type definitions.

## Have tools like Thrift, TypeSpec, and Smithy been considered?

I looked into them with interest, but they were more complex than what I was aiming for, and I didn’t feel confident about adding full support for all the languages I needed.

What I really wanted was a system where code generation for the target language could be written in that language itself.

To make that feasible without being overwhelming, BDL was designed to be much simpler than those tools.
