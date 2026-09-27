import { ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../core/create-rule';
import { getKnownDecorators, isTrueLiteral, propertyName } from '../core/decorators';
import { collectionElementType, hasCollection, isUncheckable, kindsOf, type Kind } from '../core/type-compare';

/** class-validator decorator → TS kinds it accepts. Kind-agnostic decorators are absent on purpose. */
export const VALIDATOR_KINDS: Readonly<Record<string, readonly Kind[]>> = {
  IsString: ['string'],
  IsUUID: ['string'],
  IsEmail: ['string'],
  IsUrl: ['string'],
  IsISO8601: ['string'],
  IsDateString: ['string'],
  IsNumberString: ['string'],
  IsDecimal: ['string'],
  Length: ['string'],
  MinLength: ['string'],
  MaxLength: ['string'],
  Matches: ['string'],
  IsNumber: ['number'],
  IsInt: ['number'],
  IsPositive: ['number'],
  IsNegative: ['number'],
  Min: ['number'],
  Max: ['number'],
  IsBoolean: ['boolean'],
  IsDate: ['date'],
  MinDate: ['date'],
  MaxDate: ['date'],
  IsArray: ['array'],
  ArrayMinSize: ['array'],
  ArrayMaxSize: ['array'],
  ArrayNotEmpty: ['array'],
  IsObject: ['object', 'date'],
};

export const validatorMatchesType = createRule({
  name: 'validator-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require class-validator type decorators to match the TypeScript type of the property',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      mismatch: '`@{{decorator}}()` accepts {{expected}}, but `{{property}}` is typed as `{{actual}}`.',
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
          (d) => d.module === 'class-validator' && d.name in VALIDATOR_KINDS,
        );
        if (decorators.length === 0) return;
        const propertyType = services.getTypeAtLocation(node);
        if (isUncheckable(propertyType, checker)) return;

        for (const decorator of decorators) {
          const expected = VALIDATOR_KINDS[decorator.name]!;
          let checked = propertyType;
          if (isTrueLiteral(decorator.options.get('each'))) {
            const element = collectionElementType(propertyType, checker);
            if (!element) continue; // reported by each-matches-array
            checked = element;
          } else if (!expected.includes('array') && hasCollection(propertyType, checker)) {
            continue; // array without `each`: reported by each-matches-array
          }
          const kinds = kindsOf(checked, checker).filter((k) => k !== 'null' && k !== 'undefined');
          if (kinds.length === 0 || kinds.includes('unknown')) continue;
          if (kinds.every((k) => expected.includes(k))) continue;
          context.report({
            node: decorator.node,
            messageId: 'mismatch',
            data: {
              decorator: decorator.name,
              expected: expected.join(' | '),
              property: propertyName(node),
              actual: checker.typeToString(checked),
            },
          });
        }
      },
    };
  },
});
