import type { TSESLint } from '@typescript-eslint/utils';
import { rules } from './rules';

const PLUGIN_NAME = 'nest-drift';

const plugin = {
  meta: { name: 'eslint-plugin-nest-drift' },
  rules,
  configs: {} as {
    recommended: TSESLint.FlatConfig.Config;
    'legacy-recommended': TSESLint.ClassicConfig.Config;
  },
};

const ruleLevels = Object.fromEntries(
  Object.keys(rules).map((name) => [`${PLUGIN_NAME}/${name}`, 'error']),
) as Record<string, 'error'>;

plugin.configs.recommended = {
  name: `${PLUGIN_NAME}/recommended`,
  // Decorators only exist in TypeScript; typed rules would crash on plain JS config files.
  files: ['**/*.ts', '**/*.mts', '**/*.cts'],
  plugins: { [PLUGIN_NAME]: plugin },
  rules: ruleLevels,
};

// ESLint 8 / `.eslintrc`: `extends: ['plugin:nest-drift/legacy-recommended']`
plugin.configs['legacy-recommended'] = {
  plugins: [PLUGIN_NAME],
  overrides: [{ files: ['*.ts', '*.mts', '*.cts'], rules: ruleLevels }],
};

export default plugin;
