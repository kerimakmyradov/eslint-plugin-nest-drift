import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';

export const KNOWN_MODULES = ['class-validator', 'class-transformer', '@nestjs/swagger'] as const;
export type KnownModule = (typeof KNOWN_MODULES)[number];

export interface DecoratorInfo<M extends string = KnownModule> {
  node: TSESTree.Decorator;
  /** Original exported name, even when imported under an alias or re-exported. */
  name: string;
  module: M;
  /** Call arguments; empty when the decorator is used without a call. */
  args: readonly TSESTree.CallExpressionArgument[];
  /** Properties of the last argument when it is an object literal (validation / swagger options). */
  options: ReadonlyMap<string, TSESTree.Node>;
}

/** npm package that owns a file path, e.g. `.../node_modules/@nestjs/swagger/dist/x.d.ts` → `@nestjs/swagger`. */
export function packageOfFile(fileName: string): string | undefined {
  const marker = '/node_modules/';
  const index = fileName.lastIndexOf(marker);
  if (index === -1) return undefined;
  const [scopeOrName, name] = fileName.slice(index + marker.length).split('/');
  if (!scopeOrName) return undefined;
  return scopeOrName.startsWith('@') ? `${scopeOrName}/${name}` : scopeOrName;
}

/** Symbol an identifier or `ns.member` expression refers to, following import/export aliases. */
export function resolveSymbol(
  node: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): ts.Symbol | undefined {
  const checker = services.program.getTypeChecker();
  let tsNode: ts.Node = services.esTreeNodeToTSNodeMap.get(node);
  if (ts.isPropertyAccessExpression(tsNode)) tsNode = tsNode.name;
  const symbol = checker.getSymbolAtLocation(tsNode);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) return checker.getAliasedSymbol(symbol);
  return symbol;
}

function readOptions(args: readonly TSESTree.CallExpressionArgument[]): Map<string, TSESTree.Node> {
  const options = new Map<string, TSESTree.Node>();
  const last = args.at(-1);
  if (last?.type !== AST_NODE_TYPES.ObjectExpression) return options;
  for (const prop of last.properties) {
    if (prop.type !== AST_NODE_TYPES.Property || prop.computed) continue;
    const key =
      prop.key.type === AST_NODE_TYPES.Identifier
        ? prop.key.name
        : prop.key.type === AST_NODE_TYPES.Literal
          ? String(prop.key.value)
          : undefined;
    if (key !== undefined) options.set(key, prop.value);
  }
  return options;
}

/** Decorators on a class property that come from class-validator, class-transformer or @nestjs/swagger. */
export function getKnownDecorators(
  property: TSESTree.PropertyDefinition,
  services: ParserServicesWithTypeInformation,
): DecoratorInfo[] {
  return getDecorators(property, services, KNOWN_MODULES);
}

/** Decorators on a class property that resolve to an export of one of `modules` (npm package names). */
export function getDecorators<M extends string>(
  property: TSESTree.PropertyDefinition,
  services: ParserServicesWithTypeInformation,
  modules: readonly M[],
): DecoratorInfo<M>[] {
  const result: DecoratorInfo<M>[] = [];
  for (const decorator of property.decorators) {
    const expression = decorator.expression;
    const callee = expression.type === AST_NODE_TYPES.CallExpression ? expression.callee : expression;
    if (callee.type !== AST_NODE_TYPES.Identifier && callee.type !== AST_NODE_TYPES.MemberExpression) continue;
    const symbol = resolveSymbol(callee, services);
    const declaration = symbol?.declarations?.[0];
    if (!symbol || !declaration) continue;
    const module = packageOfFile(declaration.getSourceFile().fileName);
    if (!module || !(modules as readonly string[]).includes(module)) continue;
    const args = expression.type === AST_NODE_TYPES.CallExpression ? expression.arguments : [];
    result.push({
      node: decorator,
      name: symbol.getName(),
      module: module as M,
      args,
      options: readOptions(args),
    });
  }
  return result;
}

export type OptionState = 'true' | 'false' | 'absent' | 'unknown';

/**
 * Value of a boolean option (`each`, `nullable`, `isArray`) in the decorator's last argument.
 * Object literals are read from the AST; shared objects and spreads are read through the checker,
 * and anything that cannot be decided is `unknown` so absence-based checks can stay silent.
 */
export function readBooleanOption(
  decorator: DecoratorInfo<string>,
  key: string,
  services: ParserServicesWithTypeInformation,
): OptionState {
  const last = decorator.args.at(-1);
  if (!last) return 'absent';
  if (last.type === AST_NODE_TYPES.ObjectExpression) {
    let state: OptionState = 'absent';
    for (const prop of last.properties) {
      if (prop.type === AST_NODE_TYPES.SpreadElement || prop.computed) {
        state = 'unknown'; // a later explicit key still wins below
        continue;
      }
      const name =
        prop.key.type === AST_NODE_TYPES.Identifier
          ? prop.key.name
          : prop.key.type === AST_NODE_TYPES.Literal
            ? String(prop.key.value)
            : undefined;
      if (name !== key) continue;
      state =
        prop.value.type === AST_NODE_TYPES.Literal && typeof prop.value.value === 'boolean'
          ? prop.value.value
            ? 'true'
            : 'false'
          : 'unknown';
    }
    return state;
  }
  if (last.type === AST_NODE_TYPES.SpreadElement) return 'unknown';
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(last);
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return 'unknown';
  const property = type.getProperty(key);
  if (!property) return 'absent';
  const text = checker.typeToString(checker.getTypeOfSymbol(property));
  return text === 'true' ? 'true' : text === 'false' ? 'false' : 'unknown';
}

export function isTrueLiteral(node: TSESTree.Node | undefined): boolean {
  return node?.type === AST_NODE_TYPES.Literal && node.value === true;
}

/** `() => X` → `X`; anything else is returned unchanged. */
export function unwrapThunk(node: TSESTree.Node): TSESTree.Node {
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression && node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return node.body;
  }
  return node;
}

export function propertyName(property: TSESTree.PropertyDefinition): string {
  const key = property.key;
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.PrivateIdentifier) return `#${key.name}`;
  if (key.type === AST_NODE_TYPES.Literal) return String(key.value);
  return '[computed]';
}
