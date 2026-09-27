import ts from 'typescript';

/** Runtime category of a TypeScript type, as class-validator sees it. */
export type Kind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'bigint'
  | 'date'
  | 'array'
  | 'object'
  | 'null'
  | 'undefined'
  | 'unknown';

const UNCHECKABLE =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.TypeParameter |
  ts.TypeFlags.Never |
  ts.TypeFlags.Index |
  ts.TypeFlags.IndexedAccess |
  ts.TypeFlags.Conditional |
  ts.TypeFlags.Substitution;

const PRIMITIVE_KINDS: ReadonlySet<Kind> = new Set(['string', 'number', 'boolean', 'bigint']);

export function constituents(type: ts.Type): readonly ts.Type[] {
  return type.isUnion() ? type.types : [type];
}

export function isNullish(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0;
}

export function nonNullish(type: ts.Type): readonly ts.Type[] {
  return constituents(type).filter((t) => !isNullish(t));
}

export function hasNull(type: ts.Type): boolean {
  return constituents(type).some((t) => (t.flags & ts.TypeFlags.Null) !== 0);
}

export function kindOf(type: ts.Type, checker: ts.TypeChecker): Kind {
  const flags = type.flags;
  if (flags & UNCHECKABLE) return 'unknown';
  if (flags & ts.TypeFlags.Null) return 'null';
  if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return 'undefined';
  if (flags & ts.TypeFlags.StringLike) return 'string';
  if (flags & ts.TypeFlags.NumberLike) return 'number';
  if (flags & ts.TypeFlags.BigIntLike) return 'bigint';
  if (flags & ts.TypeFlags.BooleanLike) return 'boolean';
  if (type.isUnion()) {
    const kinds = kindsOf(type, checker);
    return kinds.length === 1 ? kinds[0]! : 'unknown';
  }
  if (type.isIntersection()) {
    // Branded primitives: `number & { __brand: 'Money' }` behave as `number` at runtime.
    const kinds = type.types.map((t) => kindOf(t, checker));
    if (kinds.includes('unknown')) return 'unknown';
    return kinds.find((k) => PRIMITIVE_KINDS.has(k)) ?? 'object';
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) return 'array';
  if (type.getSymbol()?.getName() === 'Date') return 'date';
  return 'object';
}

/** Distinct kinds of every union constituent. */
export function kindsOf(type: ts.Type, checker: ts.TypeChecker): Kind[] {
  return [...new Set(constituents(type).map((t) => kindOf(t, checker)))];
}

/** True when the type (or a union member) is any/unknown/generic, so nothing can be said about it. */
export function isUncheckable(type: ts.Type, checker: ts.TypeChecker): boolean {
  return kindsOf(type, checker).includes('unknown');
}

const SET_NAMES: ReadonlySet<string> = new Set(['Set', 'ReadonlySet']);
const MAP_NAMES: ReadonlySet<string> = new Set(['Map', 'ReadonlyMap']);

/** Arrays, tuples, Sets and Maps: everything class-validator's `{ each: true }` iterates. */
export function isCollectionType(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (checker.isArrayType(type) || checker.isTupleType(type)) return true;
  const name = type.getSymbol()?.getName();
  return name !== undefined && (SET_NAMES.has(name) || MAP_NAMES.has(name));
}

/** Every non-nullish constituent is a collection. */
export function isCollection(type: ts.Type, checker: ts.TypeChecker): boolean {
  const parts = nonNullish(type);
  return parts.length > 0 && parts.every((t) => isCollectionType(t, checker));
}

/** At least one non-nullish constituent is a collection. */
export function hasCollection(type: ts.Type, checker: ts.TypeChecker): boolean {
  return nonNullish(type).some((t) => isCollectionType(t, checker));
}

function elementOf(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  if (checker.isArrayType(type)) return checker.getTypeArguments(type as ts.TypeReference)[0];
  const name = type.getSymbol()?.getName();
  if (name && SET_NAMES.has(name)) return checker.getTypeArguments(type as ts.TypeReference)[0];
  if (name && MAP_NAMES.has(name)) return checker.getTypeArguments(type as ts.TypeReference)[1];
  return undefined; // tuples are heterogeneous: no single element type
}

/**
 * Element type validated by `{ each: true }`, or undefined when the type is not a
 * collection or its constituents disagree (e.g. `string[] | number[]`).
 */
export function collectionElementType(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  const elements = nonNullish(type).map((t) => elementOf(t, checker));
  const first = elements[0];
  if (!first || elements.some((e) => e !== first)) return undefined;
  return first;
}

/**
 * Assignability by runtime value: an enum member `Status.Open = 'open'` and the literal `'open'`
 * are the same value at runtime, although TypeScript does not relate them.
 */
export function isValueAssignable(source: ts.Type, target: ts.Type, checker: ts.TypeChecker): boolean {
  if (checker.isTypeAssignableTo(source, target)) return true;
  return source.isLiteral() && target.isLiteral() && source.value === target.value;
}

/** Every non-nullish constituent of `type` is value-assignable to at least one of `allowed`. */
export function isCoveredBy(type: ts.Type, allowed: readonly ts.Type[], checker: ts.TypeChecker): boolean {
  return nonNullish(type).every((t) => allowed.some((a) => isValueAssignable(t, a, checker)));
}

/** Member value types of an enum, or of a const object used as an enum. */
export function enumValueTypes(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Type[] | undefined {
  if (symbol.flags & ts.SymbolFlags.Enum) {
    return [...constituents(checker.getDeclaredTypeOfSymbol(symbol))];
  }
  if (symbol.flags & ts.SymbolFlags.Variable) {
    const props = checker.getTypeOfSymbol(symbol).getProperties();
    return props.length > 0 ? props.map((p) => checker.getTypeOfSymbol(p)) : undefined;
  }
  return undefined;
}
