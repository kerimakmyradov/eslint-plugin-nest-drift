import { RuleTester } from '@typescript-eslint/rule-tester';
import * as vitest from 'vitest';

RuleTester.afterAll = vitest.afterAll;
RuleTester.describe = vitest.describe;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;

export const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: `${import.meta.dirname}/fixtures`,
    },
  },
});

/** Same harness for projects with `strict: false` (common in older NestJS apps). */
export const looseRuleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: `${import.meta.dirname}/fixtures/loose`,
    },
  },
});

/** Target below ES2022: class fields use assignment semantics (`useDefineForClassFields` off). */
export const es2021RuleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: `${import.meta.dirname}/fixtures/es2021`,
    },
  },
});
