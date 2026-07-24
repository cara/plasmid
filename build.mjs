// Build @carabennemsi/plasmid: bundle the ESM entry with esbuild, emit types with tsc.
// The package has zero runtime dependencies, so a single bundled file is the
// simplest thing that resolves cleanly under Node ESM and any bundler.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile: resolve(root, 'dist/index.js'),
  sourcemap: true,
});

// Type declarations (emit-only; the bundle above is the runtime artifact).
execSync('npx tsc -p tsconfig.build.json --emitDeclarationOnly --declaration --outDir dist', {
  cwd: root,
  stdio: 'inherit',
});

console.log('built @carabennemsi/plasmid -> dist/');
