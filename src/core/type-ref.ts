import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';
import { resolveSymbol, unwrapThunk } from './decorators';
import { isUncheckable, kindsOf, nonNullish, type Kind } from './type-compare';

/** What a runtime type reference such as `() => Foo`, `Number` or `'string'` stands for. */
export type TypeRef =
  | { readonly kinds: readonly Kind[]; readonly label: string }
  | { readonly instance: ts.Type; readonly label: string };

const BUILTIN_CONSTRUCTOR_KINDS: Readonly<Record<string, readonly Kind[]>> = {
  String: ['string'],
  Number: ['number'],
  Boolean: ['boolean'],
  BigInt: ['bigint'],
  Date: ['date'],
  Array: ['array'],
  Object: ['object', 'date'],
};

const SWAGGER_TYPE_NAMES: Readonly<Record<string, readonly Kind[]>> = {
  string: ['string'],
  number: ['number'],
  integer: ['number'],
  boolean: ['boolean'],
  array: ['array'],
  object: ['object', 'date'],
};

/**
 * Resolves `() => X`, `X`, `ns.X` and swagger type names (`'string'`) to kinds or a class instance type.
 * Returns undefined for anything it cannot resolve with certainty (generic classes, expressions, unknown names).
 */
export function resolveTypeRef(
  node: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): TypeRef | undefined {
  const target = unwrapThunk(node);
  if (target.type === AST_NODE_TYPES.Literal && typeof target.value === 'string') {
    const kinds = SWAGGER_TYPE_NAMES[target.value];
    return kinds ? { kinds, label: `'${target.value}'` } : undefined;
  }
  if (target.type !== AST_NODE_TYPES.Identifier && target.type !== AST_NODE_TYPES.MemberExpression) return undefined;

  const symbol = resolveSymbol(target, services);
  const declarations = symbol?.declarations ?? [];
  if (!symbol || declarations.length === 0) return undefined;
  const program = services.program;
  if (declarations.every((d) => program.isSourceFileDefaultLibrary(d.getSourceFile()))) {
    const kinds = BUILTIN_CONSTRUCTOR_KINDS[symbol.getName()];
    return kinds ? { kinds, label: symbol.getName() } : undefined;
  }
  if (!(symbol.flags & ts.SymbolFlags.Class)) return undefined;
  const instance = program.getTypeChecker().getDeclaredTypeOfSymbol(symbol);
  if ((instance as ts.InterfaceType).typeParameters?.length) return undefined;
  return { instance, label: symbol.getName() };
}

/** Whether a value described by `ref` fits `type` (nullish constituents of `type` are ignored). */
export function matchesTypeRef(ref: TypeRef, type: ts.Type, checker: ts.TypeChecker): boolean {
  if (isUncheckable(type, checker) || nonNullish(type).length === 0) return true;
  if ('instance' in ref) return checker.isTypeAssignableTo(ref.instance, type);
  return kindsOf(type, checker)
    .filter((k) => k !== 'null' && k !== 'undefined')
    .every((k) => ref.kinds.includes(k));
}
