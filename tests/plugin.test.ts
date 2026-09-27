import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

const ALL_RULES = [
  'api-property-matches-type',
  'column-matches-type',
  'each-matches-array',
  'enum-matches-type',
  'guard-covers-required-properties',
  'guard-discriminant-matches-type',
  'guard-in-check-matches-type',
  'nested-type-matches',
  'nullable-matches-type',
  'plain-to-instance-matches-source',
  'validator-matches-type',
];
const OPT_IN_RULES = ['guard-covers-required-properties'];
const RECOMMENDED_RULES = ALL_RULES.filter((name) => !OPT_IN_RULES.includes(name));

const prefixed = (names: string[]) => names.map((name) => `nest-drift/${name}`).sort();

describe('plugin', () => {
  it('exposes all rules', () => {
    expect(Object.keys(plugin.rules).sort()).toEqual(ALL_RULES);
  });

  it('recommended enables every recommended rule as error and registers the plugin', () => {
    const config = plugin.configs.recommended;
    expect(config.plugins?.['nest-drift']).toBe(plugin);
    expect(config.files).toEqual(['**/*.ts', '**/*.mts', '**/*.cts']);
    expect(Object.keys(config.rules ?? {}).sort()).toEqual(prefixed(RECOMMENDED_RULES));
    expect(new Set(Object.values(config.rules ?? {}))).toEqual(new Set(['error']));
  });

  it('strict enables every rule', () => {
    const config = plugin.configs.strict;
    expect(config.plugins?.['nest-drift']).toBe(plugin);
    expect(config.files).toEqual(['**/*.ts', '**/*.mts', '**/*.cts']);
    expect(Object.keys(config.rules ?? {}).sort()).toEqual(prefixed(ALL_RULES));
    expect(config.rules?.['nest-drift/plain-to-instance-matches-source']).toEqual(['error', { checkMissing: true }]);
    expect(config.rules?.['nest-drift/column-matches-type']).toBe('error');
  });

  it('legacy configs mirror the flat ones for .eslintrc (ESLint 8)', () => {
    expect(plugin.configs['legacy-recommended']).toEqual({
      plugins: ['nest-drift'],
      overrides: [{ files: ['*.ts', '*.mts', '*.cts'], rules: plugin.configs.recommended.rules }],
    });
    expect(plugin.configs['legacy-strict']).toEqual({
      plugins: ['nest-drift'],
      overrides: [{ files: ['*.ts', '*.mts', '*.cts'], rules: plugin.configs.strict.rules }],
    });
  });

  it('every rule requires type checking and links to its docs', () => {
    for (const [name, rule] of Object.entries(plugin.rules)) {
      expect(rule.meta.docs?.requiresTypeChecking).toBe(true);
      expect(rule.meta.docs?.url).toBe(
        `https://github.com/kerimakmyradov/eslint-plugin-nest-drift/blob/main/docs/rules/${name}.md`,
      );
    }
  });
});
