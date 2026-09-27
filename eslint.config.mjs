import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'tests/fixtures/', 'tests/smoke/'] },
  tseslint.configs.recommended,
);
