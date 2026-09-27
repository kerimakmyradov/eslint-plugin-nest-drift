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

type RuleEntry = 'error' | ['error', Record<string, unknown>];

/** Options the `strict` configs pass to rules whose stricter checks are opt-in. */
const STRICT_OPTIONS: Partial<Record<keyof typeof rules, Record<string, unknown>>> = {
  'plain-to-instance-matches-source': { checkMissing: true },
};

function ruleLevels(strict: boolean): Record<string, RuleEntry> {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([, rule]) => strict || rule.meta.docs?.recommended)
      .map(([name]) => {
        const options = strict ? STRICT_OPTIONS[name as keyof typeof rules] : undefined;
        return [`${PLUGIN_NAME}/${name}`, options ? ['error', options] : 'error'];
      }),
  );
}

const recommendedRules = ruleLevels(false);
const strictRules = ruleLevels(true);

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
