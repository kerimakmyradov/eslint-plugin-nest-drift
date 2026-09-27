import ts from 'typescript';
import { packageOfFile } from './decorators';

/** A decorator read from a TypeScript declaration (possibly in another file than the one being linted). */
export interface TsDecoratorInfo {
  /** Original exported name, even when imported under an alias; the written name when unresolved. */
  name: string;
  /** npm package that declares the decorator; undefined for local or unresolved decorators. */
  module: string | undefined;
  /** The call when the decorator is used as `@Foo(...)`. */
  call: ts.CallExpression | undefined;
}

/** Decorators of a class or class member declaration, resolved through the checker. */
export function getTsDecorators(declaration: ts.Node, checker: ts.TypeChecker): TsDecoratorInfo[] {
  if (!ts.canHaveDecorators(declaration)) return [];
  return (ts.getDecorators(declaration) ?? []).map((decorator) => {
    const call = ts.isCallExpression(decorator.expression) ? decorator.expression : undefined;
    const callee = call ? call.expression : decorator.expression;
    const nameNode = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
    let symbol = checker.getSymbolAtLocation(nameNode);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
    return {
      name: symbol?.getName() ?? nameNode.getText(),
      module: file ? packageOfFile(file) : undefined,
      call,
    };
  });
}

/**
 * Keys of the decorator's first argument: an empty set without arguments, undefined when the
 * argument is not an object literal or has spreads / computed keys.
 */
export function tsOptionKeys(call: ts.CallExpression | undefined): ReadonlySet<string> | undefined {
  const first = call?.arguments[0];
  if (!first) return new Set();
  if (!ts.isObjectLiteralExpression(first)) return undefined;
  const keys = new Set<string>();
  for (const prop of first.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return undefined;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) return undefined;
    keys.add(prop.name.text);
  }
  return keys;
}
