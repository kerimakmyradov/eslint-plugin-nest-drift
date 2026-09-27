import { describe, expect, it } from 'vitest';
import plugin from '../src/index';

describe('plugin', () => {
  it('exposes all rules', () => {
    expect(Object.keys(plugin.rules).sort()).toEqual([
      'api-property-matches-type',
      'each-matches-array',
      'enum-matches-type',
      'nested-type-matches',
      'nullable-matches-type',
      'validator-matches-type',
    ]);
  });

  it('recommended config enables every rule as error and registers the plugin', () => {
    const config = plugin.configs.recommended;
    expect(config.plugins?.['nest-drift']).toBe(plugin);
    expect(config.files).toEqual(['**/*.ts', '**/*.mts', '**/*.cts']);
    expect(Object.keys(config.rules ?? {})).toHaveLength(Object.keys(plugin.rules).length);
    for (const [name, level] of Object.entries(config.rules ?? {})) {
      expect(name.startsWith('nest-drift/')).toBe(true);
      expect(level).toBe('error');
    }
  });

  it('legacy-recommended config works for .eslintrc (ESLint 8)', () => {
    const config = plugin.configs['legacy-recommended'];
    expect(config.plugins).toEqual(['nest-drift']);
    expect(config.overrides).toEqual([
      { files: ['*.ts', '*.mts', '*.cts'], rules: plugin.configs.recommended.rules },
    ]);
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
