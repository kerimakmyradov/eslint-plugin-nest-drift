import { ESLintUtils } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../core/create-rule';
import {
  conjuncts,
  getTypeGuard,
  isShaped,
  memberHasProperty,
  readDiscriminantCheck,
  type GuardFunction,
} from '../core/guards';
import { constituents, isCoveredBy, isUncheckable, nonNullish } from '../core/type-compare';

export const DEFAULT_IGNORED_PROPERTIES: readonly string[] = ['__typename', '__t', '_tag'];

type Options = [{ ignoreProperties?: string[] }];

const PRIMITIVE_LIKE =
  ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.BooleanLike;

/**
 * What a property can hold at runtime: union members, with branded primitives
 * (`string & { __brand }`) reduced to their primitive part, which accepts plain literals.
 */
function runtimeParts(type: ts.Type): ts.Type[] {
  return constituents(type).flatMap((member) => {
    if (!member.isIntersection()) return [member];
    const primitives = member.types.filter((part) => part.flags & PRIMITIVE_LIKE);
    return primitives.length > 0 ? primitives : [member];
  });
}

export const guardDiscriminantMatchesType = createRule<Options, 'missingProperty' | 'valueMismatch'>({
  name: 'guard-discriminant-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require discriminant checks in type guards to agree with the guarded type',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      missingProperty: 'The guard checks `{{key}}`, but `{{target}}` has no property `{{key}}`.',
      valueMismatch: 'The guard checks `{{key}} === {{value}}`, but `{{target}}` has `{{key}}: {{actual}}`.',
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
      const targetText = checker.typeToString(guard.target);

      for (const expression of guard.checked) {
        for (const { node, opaque } of conjuncts(expression)) {
          if (opaque) continue;
          const comparison = readDiscriminantCheck(node, guard, services);
          if (!comparison || ignored.has(comparison.key)) continue;
          const valueType = comparison.valueType;

          const presence = members.map((m) => memberHasProperty(m, comparison.key, checker, compilerOptions));
          if (presence.includes('index')) continue;
          const data = { key: comparison.key, target: targetText };
          if (presence.every((p) => p === 'none')) {
            context.report({ node, messageId: 'missingProperty', data });
            continue;
          }
          if (presence.includes('none')) continue; // some member lacks `k`: open type, cannot judge

          const propertyTypes = members.map((m) =>
            checker.getTypeOfSymbol(checker.getPropertyOfType(m, comparison.key)!),
          );
          if (propertyTypes.some((t) => isUncheckable(t, checker))) continue;
          const matchesSome = propertyTypes.some((t) => isCoveredBy(valueType, runtimeParts(t), checker));
          if (matchesSome) continue;
          context.report({
            node,
            messageId: 'valueMismatch',
            data: {
              ...data,
              value: context.sourceCode.getText(comparison.value),
              actual: propertyTypes.map((t) => checker.typeToString(t)).join(' | '),
            },
          });
        }
      }
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
});
