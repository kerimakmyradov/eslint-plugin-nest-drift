import type { TSESLint } from '@typescript-eslint/utils';
import { rules } from './rules';

const PLUGIN_NAME = 'nest-drift';
// Decorators and type guards only exist in TypeScript; typed rules would crash on plain JS config files.
const FLAT_FILES = ['**/*.ts', '**/*.mts', '**/*.cts'];
const LEGACY_FILES = ['*.ts', '*.mts', '*.cts'];

const plugin = {
  meta: { name: 'eslint-plugin-nest-drift' },
  rules,
  configs: {} as {
    recommended: TSESLint.FlatConfig.Config;
    strict: TSESLint.FlatConfig.Config;
    'legacy-recommended': TSESLint.ClassicConfig.Config;
    'legacy-strict': TSESLint.ClassicConfig.Config;
  },
};

function ruleLevels(onlyRecommended: boolean): Record<string, 'error'> {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([, rule]) => !onlyRecommended || rule.meta.docs?.recommended)
      .map(([name]) => [`${PLUGIN_NAME}/${name}`, 'error']),
  ) as Record<string, 'error'>;
}

const recommendedRules = ruleLevels(true);
const strictRules = ruleLevels(false);

plugin.configs.recommended = {
  name: `${PLUGIN_NAME}/recommended`,
  files: FLAT_FILES,
  plugins: { [PLUGIN_NAME]: plugin },
  rules: recommendedRules,
};

plugin.configs.strict = {
  name: `${PLUGIN_NAME}/strict`,
  files: FLAT_FILES,
  plugins: { [PLUGIN_NAME]: plugin },
  rules: strictRules,
};

// ESLint 8 / `.eslintrc`: `extends: ['plugin:nest-drift/legacy-recommended']`
plugin.configs['legacy-recommended'] = {
  plugins: [PLUGIN_NAME],
  overrides: [{ files: LEGACY_FILES, rules: recommendedRules }],
};

plugin.configs['legacy-strict'] = {
  plugins: [PLUGIN_NAME],
  overrides: [{ files: LEGACY_FILES, rules: strictRules }],
};

export default plugin;
