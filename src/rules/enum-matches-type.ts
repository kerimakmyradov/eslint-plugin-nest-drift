import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, propertyName, readBooleanOption, resolveSymbol } from '../core/decorators';
import {
  collectionElementType,
  enumValueTypes,
  isCollection,
  isCoveredBy,
  isEnumMismatch,
  isUncheckable,
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
          const each = readBooleanOption(decorator, 'each', services);
          if (each === 'unknown') continue;
          // An array validated without `each` is each-matches-array's report (one report per mistake).
          if (each !== 'true' && isCollection(propertyType, checker)) continue;
          const checked = each === 'true' ? collectionElementType(propertyType, checker) : propertyType;
          if (!checked || isUncheckable(checked, checker) || nonNullish(checked).length === 0) continue;
          const data = { property: propertyName(node), actual: checker.typeToString(checked) };
          const [first] = decorator.args;
          if (!first) continue;

          if (decorator.name === 'IsEnum') {
            const symbol = resolveSymbol(first, services);
            const allowed = symbol && enumValueTypes(symbol, checker);
            if (!allowed) continue;
            if (isEnumMismatch(checked, allowed, checker, node.typeAnnotation !== undefined)) {
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
