import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, isTrueLiteral, propertyName } from '../core/decorators';
import { hasNull, isUncheckable } from '../core/type-compare';

const NULL_ALLOWING_VALIDATORS: ReadonlySet<string> = new Set(['IsOptional', 'ValidateIf']);
const API_PROPERTY_DECORATORS: ReadonlySet<string> = new Set(['ApiProperty', 'ApiPropertyOptional']);

export const nullableMatchesType = createRule({
  name: 'nullable-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `| null` in the TypeScript type to agree with class-validator and swagger nullability',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      nullRejected:
        '`{{property}}` is typed as `{{actual}}`, but its validators reject null. Add `@IsOptional()` or `@ValidateIf()`.',
      swaggerMissingNullable: '`{{property}}` can be null, but `@{{decorator}}` does not set `nullable: true`.',
      swaggerNullableOnNonNull: '`@{{decorator}}` sets `nullable: true`, but `{{property}}` is typed as `{{actual}}`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    return {
      PropertyDefinition(node) {
        const decorators = getKnownDecorators(node, services);
        if (decorators.length === 0) return;
        const type = services.getTypeAtLocation(node);
        if (isUncheckable(type, checker)) return;
        const nullable = hasNull(type);
        const data = { property: propertyName(node), actual: checker.typeToString(type) };

        const validators = decorators.filter((d) => d.module === 'class-validator');
        if (nullable && validators.length > 0 && !validators.some((d) => NULL_ALLOWING_VALIDATORS.has(d.name))) {
          context.report({ node: validators[0]!.node, messageId: 'nullRejected', data });
        }

        for (const decorator of decorators) {
          if (decorator.module !== '@nestjs/swagger' || !API_PROPERTY_DECORATORS.has(decorator.name)) continue;
          const option = decorator.options.get('nullable');
          // Non-literal `nullable: someFlag` cannot be judged.
          if (option && option.type !== AST_NODE_TYPES.Literal) continue;
          const documentedNullable = isTrueLiteral(option);
          if (nullable && !documentedNullable) {
            context.report({ node: decorator.node, messageId: 'swaggerMissingNullable', data: { ...data, decorator: decorator.name } });
          } else if (!nullable && documentedNullable) {
            context.report({ node: decorator.node, messageId: 'swaggerNullableOnNonNull', data: { ...data, decorator: decorator.name } });
          }
        }
      },
    };
  },
});
