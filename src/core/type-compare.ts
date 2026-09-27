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

const LIB_FILE = /(?:^|[\\/])lib\.[\w.-]+\.d\.ts$/;

/** Declared in TypeScript's own `lib.*.d.ts` (so a user's `class Map {}` does not count). */
function isLibSymbol(symbol: ts.Symbol | undefined): boolean {
  return (symbol?.declarations ?? []).some((d) => LIB_FILE.test(d.getSourceFile().fileName));
}

function libName(type: ts.Type): string | undefined {
  const symbol = type.getSymbol();
  return symbol && isLibSymbol(symbol) ? symbol.getName() : undefined;
}

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
    // Branded primitives / arrays: `number & { __brand: 'Money' }` behaves as `number` at runtime.
    const kinds = type.types.map((t) => kindOf(t, checker));
    if (kinds.includes('unknown')) return 'unknown';
    return kinds.find((k) => PRIMITIVE_KINDS.has(k)) ?? (kinds.includes('array') ? 'array' : 'object');
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) return 'array';
  if (libName(type) === 'Date') return 'date';
  return 'object';
}

/** Distinct kinds of every union constituent. */
export function kindsOf(type: ts.Type, checker: ts.TypeChecker): Kind[] {
  return [...new Set(constituents(type).map((t) => kindOf(t, checker)))];
}

/**
 * Kind of the value after `JSON.stringify`: objects with a string-returning `toJSON`
 * (Date, ObjectId, Decimal) become strings.
 */
export function jsonKindOf(type: ts.Type, checker: ts.TypeChecker): Kind {
  const kind = kindOf(type, checker);
  if (kind !== 'object' && kind !== 'date') return kind;
  const toJSON = type.getProperty('toJSON');
  if (!toJSON) return kind;
  const signatures = checker.getTypeOfSymbol(toJSON).getCallSignatures();
  const returns = signatures.map((sig) => kindOf(checker.getReturnTypeOfSignature(sig), checker));
  return returns.length > 0 && returns.every((k) => k === 'string') ? 'string' : kind;
}

/** True when the type (or a union member) is any/unknown/generic, so nothing can be said about it. */
export function isUncheckable(type: ts.Type, checker: ts.TypeChecker): boolean {
  return kindsOf(type, checker).includes('unknown');
}

const SET_NAMES: ReadonlySet<string> = new Set(['Set', 'ReadonlySet']);
const MAP_NAMES: ReadonlySet<string> = new Set(['Map', 'ReadonlyMap']);

/** Arrays, tuples, Sets and Maps: everything class-validator's `{ each: true }` iterates. */
export function isCollectionType(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isIntersection()) return type.types.some((t) => isCollectionType(t, checker)); // branded arrays
  if (checker.isArrayType(type) || checker.isTupleType(type)) return true;
  const name = libName(type);
  return name !== undefined && (SET_NAMES.has(name) || MAP_NAMES.has(name));
}

/** Arrays and tuples only — `Set` / `Map` instances are plain objects for `IsObject`. */
export function isArrayLike(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isIntersection()) return type.types.some((t) => isArrayLike(t, checker));
  return checker.isArrayType(type) || checker.isTupleType(type);
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
  if (type.isIntersection()) {
    for (const part of type.types) {
      const element = elementOf(part, checker);
      if (element) return element;
    }
    return undefined;
  }
  if (checker.isArrayType(type)) return checker.getTypeArguments(type as ts.TypeReference)[0];
  const name = libName(type);
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
  if (target.isUnion()) return target.types.some((member) => isValueAssignable(source, member, checker));
  return source.isLiteral() && target.isLiteral() && source.value === target.value;
}

/** Every non-nullish constituent of `type` is value-assignable to at least one of `allowed`. */
export function isCoveredBy(type: ts.Type, allowed: readonly ts.Type[], checker: ts.TypeChecker): boolean {
  return nonNullish(type).every((t) => allowed.some((a) => isValueAssignable(t, a, checker)));
}

/** Member value types of an enum, of a const object used as an enum, or of an array of values. */
export function enumValueTypes(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Type[] | undefined {
  if (symbol.flags & ts.SymbolFlags.Enum) {
    return [...constituents(checker.getDeclaredTypeOfSymbol(symbol))];
  }
  if (symbol.flags & ts.SymbolFlags.Variable) {
    const type = checker.getTypeOfSymbol(symbol);
    if (checker.isTupleType(type) || checker.isArrayType(type)) {
      // Element types as declared: a widened `Step[]` stays one non-literal `Step`, so no subset claim is made.
      const elements = [...checker.getTypeArguments(type as ts.TypeReference)];
      return elements.length > 0 ? elements : undefined;
    }
    const props = type.getProperties();
    return props.length > 0 ? props.map((p) => checker.getTypeOfSymbol(p)) : undefined;
  }
  return undefined;
}

/**
 * A plain `string` / `number` property holding enum values of the same kind: an imprecise type,
 * not a runtime mismatch (`@IsEnum(Color) color: string`).
 */
export function isPlainPrimitiveOf(type: ts.Type, allowed: readonly ts.Type[], checker: ts.TypeChecker): boolean {
  const parts = nonNullish(type);
  const partKinds = new Set(parts.map((part) => kindOf(part, checker)));
  const valueKinds = new Set(allowed.flatMap((value) => constituents(value).map((t) => kindOf(t, checker))));
  return (
    parts.length > 0 &&
    parts.every(
      (part) => !part.isLiteral() && (part.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike)) !== 0,
    ) &&
    [...valueKinds].every((kind) => partKinds.has(kind))
  );
}
