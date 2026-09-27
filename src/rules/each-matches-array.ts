import { ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, propertyName, readBooleanOption } from '../core/decorators';
import { hasCollection, isArrayLike, isCollection, isUncheckable, nonNullish } from '../core/type-compare';
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

        // `IsObject` accepts Set / Map instances; only arrays and tuples make it fail.
        const onlyArrays = nonNullish(type).every((t) => isArrayLike(t, checker));

        for (const decorator of decorators) {
          const state = readBooleanOption(decorator, 'each', services);
          if (state === 'unknown') continue;
          const each = state === 'true';
          if (each && !anyCollection) {
            context.report({ node: decorator.node, messageId: 'eachOnNonCollection', data: { ...data, decorator: decorator.name } });
          } else if (
            !each &&
            allCollections &&
            isScalarValidator(decorator.name) &&
            (decorator.name !== 'IsObject' || onlyArrays)
          ) {
            context.report({ node: decorator.node, messageId: 'collectionWithoutEach', data: { ...data, decorator: decorator.name } });
          }
        }
      },
    };
  },
});
