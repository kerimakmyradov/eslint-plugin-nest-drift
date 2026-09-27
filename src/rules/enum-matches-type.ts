import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, isTrueLiteral, propertyName, resolveSymbol } from '../core/decorators';
import {
  collectionElementType,
  enumValueTypes,
  isCoveredBy,
  isUncheckable,
  isValueAssignable,
  nonNullish,
} from '../core/type-compare';

export const enumMatchesType = createRule({
  name: 'enum-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `@IsEnum()` / `@IsIn()` to agree with the TypeScript type of the property',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      enumMismatch: '`@IsEnum({{enumName}})` allows other values than `{{property}}: {{actual}}`.',
      inValueNotInType: '`@IsIn()` allows {{value}}, which is not assignable to `{{property}}: {{actual}}`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    return {
      PropertyDefinition(node) {
        const decorators = getKnownDecorators(node, services).filter(
          (d) => d.module === 'class-validator' && (d.name === 'IsEnum' || d.name === 'IsIn'),
        );
        if (decorators.length === 0) return;
        const propertyType = services.getTypeAtLocation(node);
        if (isUncheckable(propertyType, checker)) return;

        for (const decorator of decorators) {
          const checked = isTrueLiteral(decorator.options.get('each'))
            ? collectionElementType(propertyType, checker)
            : propertyType;
          if (!checked || isUncheckable(checked, checker) || nonNullish(checked).length === 0) continue;
          const data = { property: propertyName(node), actual: checker.typeToString(checked) };
          const [first] = decorator.args;
          if (!first) continue;

          if (decorator.name === 'IsEnum') {
            const symbol = resolveSymbol(first, services);
            const allowed = symbol && enumValueTypes(symbol, checker);
            if (!allowed) continue;
            // The property must not declare values the enum does not contain…
            const typeCovered = isCoveredBy(checked, allowed, checker);
            // …and the enum must not allow values the property type cannot hold.
            // Only meaningful when every enum value is a literal (a non-`as const` object widens to `string`).
            const enumCovered =
              !allowed.every((a) => a.flags & ts.TypeFlags.Literal) ||
              allowed.every((a) => nonNullish(checked).some((t) => isValueAssignable(a, t, checker)));
            if (!typeCovered || !enumCovered) {
              context.report({
                node: decorator.node,
                messageId: 'enumMismatch',
                data: { ...data, enumName: context.sourceCode.getText(first) },
              });
            }
            continue;
          }

          if (first.type !== AST_NODE_TYPES.ArrayExpression) continue;
          for (const element of first.elements) {
            if (!element || element.type === AST_NODE_TYPES.SpreadElement) continue;
            const valueType = services.getTypeAtLocation(element);
            if (isUncheckable(valueType, checker) || isCoveredBy(valueType, [...nonNullish(checked)], checker)) continue;
            context.report({
              node: element,
              messageId: 'inValueNotInType',
              data: { ...data, value: context.sourceCode.getText(element) },
            });
          }
        }
      },
    };
  },
});
