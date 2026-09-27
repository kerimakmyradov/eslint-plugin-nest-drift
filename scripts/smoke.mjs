// Lints tests/smoke with the BUILT plugin (dist/) through the public ESLint API.
// Runs in flat-config mode on ESLint >= 9 and in `.eslintrc` mode on ESLint 8.
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import nestDrift from '../dist/index.js';

const cwd = fileURLToPath(new URL('../tests/smoke/', import.meta.url));
const legacy = Number(ESLint.version.split('.')[0]) < 9;

const eslint = legacy
  ? new ESLint({
      cwd,
      useEslintrc: false,
      plugins: { 'nest-drift': nestDrift },
      overrideConfig: {
        root: true,
        parser: '@typescript-eslint/parser',
        parserOptions: { project: './tsconfig.json', tsconfigRootDir: cwd },
        extends: ['plugin:nest-drift/legacy-recommended'],
      },
    })
  : new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: { projectService: true, tsconfigRootDir: cwd },
          },
        },
        nestDrift.configs.recommended,
      ],
    });

const results = await eslint.lintFiles(['create-order.dto.ts', 'shape-guards.ts', 'payment.entity.ts']);
const actual = results
  .flatMap((r) => r.messages.map((m) => `${r.filePath.split(/[\\/]/).pop()}:${m.line}:${m.ruleId}`))
  .sort();
const expected = [
  'create-order.dto.ts:11:nest-drift/validator-matches-type',
  'create-order.dto.ts:12:nest-drift/enum-matches-type',
  'create-order.dto.ts:13:nest-drift/nested-type-matches',
  'create-order.dto.ts:14:nest-drift/each-matches-array',
  'create-order.dto.ts:16:nest-drift/nullable-matches-type',
  'create-order.dto.ts:16:nest-drift/nullable-matches-type',
  'shape-guards.ts:8:nest-drift/guard-discriminant-matches-type',
  'shape-guards.ts:9:nest-drift/guard-in-check-matches-type',
  'payment.entity.ts:7:nest-drift/column-matches-type',
  'payment.entity.ts:12:nest-drift/plain-to-instance-matches-source',
].sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error('Smoke test failed.\nExpected:', expected, '\nActual:', actual);
  process.exit(1);
}
console.log(`Smoke test passed on ESLint ${ESLint.version} (${legacy ? 'eslintrc' : 'flat'}): ${actual.length} expected problems reported.`);
