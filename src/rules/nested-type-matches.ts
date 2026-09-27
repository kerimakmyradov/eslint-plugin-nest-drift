import { ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, propertyName } from '../core/decorators';
import { collectionElementType, hasCollection, isUncheckable } from '../core/type-compare';
import { matchesTypeRef, resolveTypeRef } from '../core/type-ref';

export const nestedTypeMatches = createRule({
  name: 'nested-type-matches',
  meta: {
    type: 'problem',
    docs: {
      description: "Require class-transformer's `@Type(() => X)` to match the TypeScript type of the property",
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      mismatch: '`@Type(() => {{target}})` builds `{{target}}`, but `{{property}}` is typed as `{{actual}}`.',
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
          (d) => d.module === 'class-transformer' && d.name === 'Type',
        );
        if (decorators.length === 0) return;
        const propertyType = services.getTypeAtLocation(node);
        if (isUncheckable(propertyType, checker)) return;

        for (const decorator of decorators) {
          const [thunk, options] = decorator.args;
          if (!thunk || options !== undefined) continue; // discriminator / keepDiscriminatorProperty: out of scope
          const ref = resolveTypeRef(thunk, services);
          if (!ref) continue;
          // @Type applies to each element of an array / Set / Map.
          const checked = hasCollection(propertyType, checker)
            ? collectionElementType(propertyType, checker)
            : propertyType;
          if (!checked || matchesTypeRef(ref, checked, checker)) continue;
          context.report({
            node: decorator.node,
            messageId: 'mismatch',
            data: { target: ref.label, property: propertyName(node), actual: checker.typeToString(propertyType) },
          });
        }
      },
    };
  },
});
