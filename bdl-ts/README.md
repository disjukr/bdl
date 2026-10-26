# bdl

TypeScript implementation of Bridge Definition Language: parser, AST/CST, IR,
formatter, linter, generators, and the `bdlc` command.

Requires Node.js 22.18+ and pnpm 10.31. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:package
pnpm --filter bdl codegen
pnpm --filter bdl exec node dist/cli/bdlc.js --help
```

The compiler npm package is named `bdl`.
`@disjukr/bdl-runtime` remains a separate package. npm publication is
not implied by this repository configuration; set release versions and registry
credentials before publishing. Existing public subpaths are preserved as ESM JavaScript with
TypeScript declarations, for example:

```ts
import parseBdl from "bdl/parser";
import { formatBdl } from "bdl/formatter/bdl";
```

The parser, formatter, linter, built-in standards, and runtime remain browser
compatible. `io/*` and the CLI use Node.js APIs. Built-in standard YAML text is
embedded by codegen so browser consumers do not need filesystem access or raw
import loaders. Use `pnpm --filter bdl bench` for formatter timings.

`bdlc` retains `ast`, `ir`, `openapi3`, `reflection`, `ts`, and `fmt` commands.
Run `bdlc <command> --help` for options. Configuration and custom-standard paths
remain relative to the directory containing `bdl.yaml`.

Builds use TypeScript's existing non-strict checking baseline (the old runtime
tsconfig did not enable strict mode). Tightening serializer generics is a separate
change. Existing generator TODOs are intentionally outside this migration.

To inspect npm artifacts without publishing:

```sh
pnpm --filter @disjukr/bdl-runtime pack --pack-destination ./artifacts
pnpm --filter bdl pack --pack-destination ./artifacts
```

`pnpm pack` resolves workspace dependency ranges. Consumers require the matching
runtime version. Runtime version `0.5.1` already exists on npm; its local version
is retained here for migration checks and must not be republished. Before releasing
the changed runtime sources, choose a new runtime version and release it before
the compiler. Packing will then resolve the compiler's workspace range to that
version. Compiler `0.0.0` is also a development placeholder, not a release decision.
The manual npm
workflow builds and tests before packing, and requires the `npm` environment and
registry credentials. It never runs on normal pushes. Publishing is a separate
maintainer action.
