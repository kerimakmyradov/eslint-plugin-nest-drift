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

const [result] = await eslint.lintFiles(['create-order.dto.ts']);
const actual = result.messages.map((m) => `${m.line}:${m.ruleId}`).sort();
const expected = [
  '11:nest-drift/validator-matches-type',
  '12:nest-drift/enum-matches-type',
  '13:nest-drift/nested-type-matches',
  '14:nest-drift/each-matches-array',
  '16:nest-drift/nullable-matches-type',
  '16:nest-drift/nullable-matches-type',
].sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error('Smoke test failed.\nExpected:', expected, '\nActual:', result.messages);
  process.exit(1);
}
console.log(`Smoke test passed on ESLint ${ESLint.version} (${legacy ? 'eslintrc' : 'flat'}): ${actual.length} expected problems reported.`);
