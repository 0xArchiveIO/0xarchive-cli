import { defineConfig } from 'tsup';

export default defineConfig({
  // src/bin.ts is the executable; it parses process.argv with the command
  // tree in src/cli.ts. The bundle keeps its published name, dist/cli.js.
  entry: { cli: 'src/bin.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
