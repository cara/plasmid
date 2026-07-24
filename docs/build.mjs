// Build the GitHub Pages demo: bundle docs/app.ts (and the renderer it imports
// straight from src/) into a single browser module. The output lives in
// docs/assets/ and is gitignored — the Pages workflow rebuilds it on deploy,
// so the demo can never drift from the source it demonstrates.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(root, 'app.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: true,
  outfile: resolve(root, 'assets/app.js'),
});

console.log('built docs demo -> docs/assets/app.js');
