import { context } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
const grammarPath = fileURLToPath(new URL('../syntaxes/bdl.tmLanguage.yaml', import.meta.url));
const grammarOutput = new URL('../syntaxes/bdl.tmLanguage.json', import.meta.url);
const grammarPlugin = {
  name: 'bdl-grammar',
  setup(build) {
    build.onStart(async () => {
      const grammar = parse(await readFile(grammarPath, 'utf8'));
      await writeFile(grammarOutput, JSON.stringify(grammar, null, 2) + '\n');
    });
    build.onLoad({ filter: /[\\/]src[\\/]main\.ts$/ }, async ({ path }) => ({
      contents: await readFile(path, 'utf8'),
      loader: 'ts',
      resolveDir: dirname(path),
      watchFiles: [grammarPath],
    }));
  },
};
const build = await context({entryPoints:['src/main.ts'],outdir:'dist',bundle:true,platform:'browser',format:'cjs',external:['vscode'],sourcemap:true,plugins:[grammarPlugin]});
if(process.argv.includes('--watch')) await build.watch();
else { await build.rebuild(); await build.dispose(); }
