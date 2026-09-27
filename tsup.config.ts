import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'core/index': 'src/core/index.ts' },
  format: ['esm', 'cjs'],
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  cjsInterop: true,
  splitting: true,
  target: 'node20',
});
