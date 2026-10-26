# Syntax diagrams

Definitions in `src/*.js` use the constructors documented in the
[renderer guide](https://github.com/tabatkins/railroad-diagrams/blob/ea9a12393bbaa2c802b0449fd5bdf34b6868b83c/README-js.md).

From the repository root, generate the SVG files with Node.js:

```sh
pnpm docs:diagrams
pnpm --filter bdl-syntax-diagrams test
```

You can also run `node docs/syntax-diagrams/build-diagrams.mjs` directly from any
working directory; `--check` compares all generated diagrams with the checked-in
SVGs without writing. The renderer is vendored at the original fixed commit, with
its upstream notices and license, so diagram generation works offline.
