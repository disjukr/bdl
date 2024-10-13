## How to update tmLanguage

```sh
deno install --allow-scripts
deno run -A watch:yaml
# edit `/syntaxes/bdl.tmLanguage.yaml`
# press `F5` key
# `cmd + shift + p` and type `Developer: Inspect Editor Tokens and Scopes`
```

# How to publish

1. Update version in `package.json`
1. `deno run -A build`
1. Copy Azure DevOps
   [PAT](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token)
1. `npx vsce login disjukr` & Paste PAT
1. `npx vsce package`
1. `npx vsce publish`
