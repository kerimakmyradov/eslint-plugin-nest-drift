import { ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, isTrueLiteral, propertyName } from '../core/decorators';
import { hasCollection, isCollection, isUncheckable } from '../core/type-compare';
import { VALIDATOR_KINDS } from './validator-matches-type';

/** Validators that check a single value, so an array property needs `{ each: true }`. */
function isScalarValidator(name: string): boolean {
  if (name === 'IsEnum' || name === 'IsIn') return true;
  const kinds = VALIDATOR_KINDS[name];
  return kinds !== undefined && !kinds.includes('array');
}

export const eachMatchesArray = createRule({
  name: 'each-matches-array',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `{ each: true }` exactly when a validated property is an array, Set or Map',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      eachOnNonCollection:
        '`@{{decorator}}({ each: true })` iterates a collection, but `{{property}}` is typed as `{{actual}}`.',
      collectionWithoutEach:
        '`@{{decorator}}()` validates a single value, but `{{property}}` is `{{actual}}`. Add `{ each: true }`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    return {
      PropertyDefinition(node) {
        const decorators = getKnownDecorators(node, services).filter((d) => d.module === 'class-validator');
        if (decorators.length === 0) return;
        const type = services.getTypeAtLocation(node);
        if (isUncheckable(type, checker)) return;
        const allCollections = isCollection(type, checker);
        const anyCollection = hasCollection(type, checker);
        const data = { property: propertyName(node), actual: checker.typeToString(type) };

        for (const decorator of decorators) {
          const each = isTrueLiteral(decorator.options.get('each'));
          if (each && !anyCollection) {
            context.report({ node: decorator.node, messageId: 'eachOnNonCollection', data: { ...data, decorator: decorator.name } });
          } else if (!each && allCollections && isScalarValidator(decorator.name)) {
            context.report({ node: decorator.node, messageId: 'collectionWithoutEach', data: { ...data, decorator: decorator.name } });
          }
        }
      },
    };
  },
});
