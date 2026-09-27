/**
 * Building blocks of eslint-plugin-nest-drift for writing additional rules.
 * Experimental: may change in minor versions until 1.0.
 */
export { createRule, type NestDriftDocs } from './create-rule';
export {
  getKnownDecorators,
  isTrueLiteral,
  KNOWN_MODULES,
  packageOfFile,
  propertyName,
  resolveSymbol,
  unwrapThunk,
  type DecoratorInfo,
  type KnownModule,
} from './decorators';
export {
  collectionElementType,
  constituents,
  enumValueTypes,
  hasCollection,
  hasNull,
  isCollection,
  isCollectionType,
  isCoveredBy,
  isNullish,
  isUncheckable,
  isValueAssignable,
  kindOf,
  kindsOf,
  nonNullish,
  type Kind,
} from './type-compare';
export { matchesTypeRef, resolveTypeRef, type TypeRef } from './type-ref';
