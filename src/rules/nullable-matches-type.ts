import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { DecoratorInfo } from '../core/decorators';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, propertyName, readBooleanOption } from '../core/decorators';
import { hasNull, isUncheckable } from '../core/type-compare';

const NULL_ALLOWING_VALIDATORS: ReadonlySet<string> = new Set(['IsOptional', 'ValidateIf', 'Allow', 'IsEmpty']);

function isNullLiteral(node: unknown): boolean {
  const n = node as { type?: string; value?: unknown; raw?: string } | undefined;
  return n?.type === AST_NODE_TYPES.Literal && n.value === null && n.raw === 'null';
}

/** Validators that let `null` through: `@IsOptional()`, `@IsIn([..., null])`, `@Equals(null)`, … */
function allowsNull(decorator: DecoratorInfo): boolean {
  if (NULL_ALLOWING_VALIDATORS.has(decorator.name)) return true;
  const [first] = decorator.args;
  if (decorator.name === 'Equals') return isNullLiteral(first);
  if (decorator.name === 'IsIn' && first?.type === AST_NODE_TYPES.ArrayExpression) {
    return first.elements.some(isNullLiteral);
  }
  return false;
}
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
    // Without strictNullChecks TypeScript erases `| null`, so nullability cannot be compared at all.
    const compilerOptions = services.program.getCompilerOptions();
    if (!(compilerOptions.strictNullChecks ?? compilerOptions.strict ?? false)) return {};
    return {
      PropertyDefinition(node) {
        const decorators = getKnownDecorators(node, services);
        if (decorators.length === 0) return;
        const type = services.getTypeAtLocation(node);
        if (isUncheckable(type, checker)) return;
        const nullable = hasNull(type);
        const data = { property: propertyName(node), actual: checker.typeToString(type) };

        const validators = decorators.filter((d) => d.module === 'class-validator');
        if (nullable && validators.length > 0 && !validators.some(allowsNull)) {
          context.report({ node: validators[0]!.node, messageId: 'nullRejected', data });
        }

        for (const decorator of decorators) {
          if (decorator.module !== '@nestjs/swagger' || !API_PROPERTY_DECORATORS.has(decorator.name)) continue;
          // Non-literal `nullable: someFlag`, spreads and shared option objects cannot be judged.
          const option = readBooleanOption(decorator, 'nullable', services);
          if (option === 'unknown') continue;
          const documentedNullable = option === 'true';
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
