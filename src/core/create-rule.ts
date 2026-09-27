import { ESLintUtils } from '@typescript-eslint/utils';

export interface NestDriftDocs {
  description: string;
  recommended: boolean;
  requiresTypeChecking: true;
}

export const createRule = ESLintUtils.RuleCreator<NestDriftDocs>(
  (name) => `https://github.com/kerimakmyradov/eslint-plugin-nest-drift/blob/main/docs/rules/${name}.md`,
);
