import { ESLintUtils } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../core/create-rule';
import {
  conjuncts,
  getTypeGuard,
  isShaped,
  memberHasProperty,
  readInCheck,
  type GuardFunction,
} from '../core/guards';
import { isUncheckable, nonNullish } from '../core/type-compare';
import { DEFAULT_IGNORED_PROPERTIES } from './guard-discriminant-matches-type';

type Options = [{ ignoreProperties?: string[] }];
type MessageIds = 'missingProperty' | 'requiredButExcluded' | 'notDiscriminating';

export const guardInCheckMatchesType = createRule<Options, MessageIds>({
  name: 'guard-in-check-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: "Require `'key' in x` checks in type guards to agree with the guarded type",
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      missingProperty: "The guard checks `'{{key}}' in {{param}}`, but `{{target}}` has no property `{{key}}`.",
      requiredButExcluded:
        "The guard requires `{{key}}` to be absent, but `{{target}}` always has `{{key}}`.",
      notDiscriminating:
        'Every member of `{{paramType}}` has {{keys}}, so this guard is always true and does not narrow to `{{target}}`.',
    },
    schema: [
      {
        type: 'object',
        properties: { ignoreProperties: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ ignoreProperties: [...DEFAULT_IGNORED_PROPERTIES] }],
  create(context, [options]) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const compilerOptions = services.program.getCompilerOptions();
    const ignored = new Set(options.ignoreProperties ?? DEFAULT_IGNORED_PROPERTIES);

    function check(fn: GuardFunction): void {
      const guard = getTypeGuard(fn, context.sourceCode, services);
      if (!guard || isUncheckable(guard.target, checker)) return;
      const members = nonNullish(guard.target);
      if (members.length === 0 || !members.every((m) => isShaped(m, checker))) return;
      const target = checker.typeToString(guard.target);
      const param = context.sourceCode.getText(guard.predicateNode.parameterName);

      const positiveKeys: string[] = [];
      let onlyPositiveInChecks = true;

      for (const expression of guard.checked) {
        for (const { node, opaque } of conjuncts(expression)) {
          const inCheck = opaque ? undefined : readInCheck(node, guard);
          if (!inCheck || inCheck.negated) onlyPositiveInChecks = false;
          if (!inCheck || ignored.has(inCheck.key)) continue;

          const presence = members.map((m) => memberHasProperty(m, inCheck.key, checker, compilerOptions));
          if (presence.includes('index')) {
            onlyPositiveInChecks = false;
            continue;
          }
          const data = { key: inCheck.key, target, param };
          if (!inCheck.negated) {
            positiveKeys.push(inCheck.key);
            if (presence.every((p) => p === 'none')) context.report({ node, messageId: 'missingProperty', data });
          } else if (presence.every((p) => p === 'required')) {
            context.report({ node, messageId: 'requiredButExcluded', data });
          }
        }
      }

      if (!guard.singleExpression || !onlyPositiveInChecks || positiveKeys.length === 0) return;
      const paramMembers = nonNullish(guard.paramType);
      if (paramMembers.length < 2 || paramMembers.some((m) => !(m.flags & ts.TypeFlags.Object))) return;
      const everyMemberHasAll = paramMembers.every((m) =>
        positiveKeys.every((k) => memberHasProperty(m, k, checker, compilerOptions) === 'required'),
      );
      const narrowsSomething = paramMembers.some((m) => !checker.isTypeAssignableTo(m, guard.target));
      if (!everyMemberHasAll || !narrowsSomething) return;
      context.report({
        node: guard.predicateNode,
        messageId: 'notDiscriminating',
        data: {
          target,
          paramType: checker.typeToString(guard.paramType),
          keys: [...new Set(positiveKeys)].map((k) => `\`${k}\``).join(', '),
        },
      });
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
});
