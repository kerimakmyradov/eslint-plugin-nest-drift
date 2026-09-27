import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, isTrueLiteral, propertyName, resolveSymbol } from '../core/decorators';
import {
  collectionElementType,
  enumValueTypes,
  hasCollection,
  isCollection,
  isCoveredBy,
  isUncheckable,
} from '../core/type-compare';
import { matchesTypeRef, resolveTypeRef, type TypeRef } from '../core/type-ref';

const API_PROPERTY_DECORATORS: ReadonlySet<string> = new Set(['ApiProperty', 'ApiPropertyOptional']);

/** JSON has no Date: swagger documents dates as strings, so string ↔ Date is not drift. */
function widenForJson(ref: TypeRef): TypeRef {
  if (!('kinds' in ref)) return ref;
  if (ref.kinds.includes('string') && !ref.kinds.includes('date')) return { ...ref, kinds: [...ref.kinds, 'date'] };
  if (ref.kinds.includes('date') && !ref.kinds.includes('string')) return { ...ref, kinds: [...ref.kinds, 'string'] };
  return ref;
}

export const apiPropertyMatchesType = createRule({
  name: 'api-property-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `@ApiProperty()` type, enum and isArray to match the TypeScript type of the property',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      typeMismatch: '`@{{decorator}}` documents `{{documented}}`, but `{{property}}` is typed as `{{actual}}`.',
      isArrayOnNonCollection: '`@{{decorator}}` sets `isArray: true`, but `{{property}}` is typed as `{{actual}}`.',
      enumMismatch: '`@{{decorator}}` documents enum `{{enumName}}`, but `{{property}}` is typed as `{{actual}}`.',
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
          (d) => d.module === '@nestjs/swagger' && API_PROPERTY_DECORATORS.has(d.name),
        );
        if (decorators.length === 0) return;
        const propertyType = services.getTypeAtLocation(node);
        if (isUncheckable(propertyType, checker)) return;
        const base = { property: propertyName(node), actual: checker.typeToString(propertyType) };

        for (const decorator of decorators) {
          const data = { ...base, decorator: decorator.name };
          const typeNode = decorator.options.get('type');
          const enumNode = decorator.options.get('enum');
          const arrayForm = typeNode?.type === AST_NODE_TYPES.ArrayExpression; // type: [Foo]
          const documentedArray = arrayForm || isTrueLiteral(decorator.options.get('isArray'));

          if (documentedArray && !hasCollection(propertyType, checker)) {
            context.report({ node: decorator.node, messageId: 'isArrayOnNonCollection', data });
            continue;
          }
          // Element type when the docs describe an array; array-ness itself is darraghor's job.
          const checked =
            documentedArray || isCollection(propertyType, checker)
              ? collectionElementType(propertyType, checker)
              : propertyType;
          if (!checked || isUncheckable(checked, checker)) continue;

          const refNode: TSESTree.Node | undefined = arrayForm
            ? (typeNode as TSESTree.ArrayExpression).elements[0] ?? undefined
            : typeNode;
          const ref = refNode && refNode.type !== AST_NODE_TYPES.SpreadElement ? resolveTypeRef(refNode, services) : undefined;
          if (ref && !matchesTypeRef(widenForJson(ref), checked, checker)) {
            context.report({ node: decorator.node, messageId: 'typeMismatch', data: { ...data, documented: ref.label } });
            continue;
          }

          if (enumNode) {
            const symbol = resolveSymbol(enumNode, services);
            const allowed = symbol && enumValueTypes(symbol, checker);
            if (allowed && !isCoveredBy(checked, allowed, checker)) {
              context.report({
                node: decorator.node,
                messageId: 'enumMismatch',
                data: { ...data, enumName: context.sourceCode.getText(enumNode) },
              });
            }
          }
        }
      },
    };
  },
});
