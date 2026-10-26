# Developing the extension

From the repository root, run `pnpm install --frozen-lockfile` and `pnpm build`.
Run `pnpm --dir bdl-vscode watch` while using the VS Code Extension Host.
The extension bundle is browser compatible and keeps `vscode` external.
Release publishing remains a separate tagged maintainer action.

The extension keeps its Marketplace name `bdl`. It is built separately by the
root scripts so it does not conflict with the compiler npm workspace named `bdl`.
Run dependency installation from the repository root.
