import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation, TSESLint, TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';

export type GuardFunction =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export interface TypeGuard {
  fn: GuardFunction;
  /** Identifiers that read the guarded parameter or a `const` alias of it. */
  refs: ReadonlySet<TSESTree.Node>;
  /** The parameter is copied into a `let` / `var` or destructured into a rest element. */
  escapes: boolean;
  paramType: ts.Type;
  target: ts.Type;
  predicateNode: TSESTree.TSTypePredicate;
  /** Arguments of every `return` of the guard (or the expression body of an arrow). */
  checked: TSESTree.Expression[];
  /** The body is a single expression: an expression-bodied arrow or `{ return <expr>; }`. */
  singleExpression: boolean;
}

export interface Conjunct {
  node: TSESTree.Expression;
  /** `||`, `??` or a conditional: not a single necessary condition. */
  opaque: boolean;
}

const WRAPPERS: ReadonlySet<string> = new Set([
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
]);

const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

/** Strips `as`, `<T>`, `!` and `satisfies` around an expression. */
export function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (WRAPPERS.has(current.type)) {
    current = (current as TSESTree.TSAsExpression).expression;
  }
  return current;
}

/** Visits every node of `root`, not descending into nested functions. */
export function walkOwnBody(root: TSESTree.Node, visit: (node: TSESTree.Node) => void): void {
  const stack: TSESTree.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visit(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (child && typeof child === 'object' && typeof (child as { type?: unknown }).type === 'string') {
          if (!FUNCTION_TYPES.has((child as TSESTree.Node).type)) stack.push(child as TSESTree.Node);
        }
      }
    }
  }
}

function findParam(fn: GuardFunction, name: string): TSESTree.Identifier | 'rest' | undefined {
  for (const param of fn.params) {
    if (param.type === AST_NODE_TYPES.Identifier && param.name === name) return param;
    if (
      param.type === AST_NODE_TYPES.AssignmentPattern &&
      param.left.type === AST_NODE_TYPES.Identifier &&
      param.left.name === name
    ) {
      return param.left;
    }
    if (
      param.type === AST_NODE_TYPES.RestElement &&
      param.argument.type === AST_NODE_TYPES.Identifier &&
      param.argument.name === name
    ) {
      return 'rest';
    }
  }
  return undefined;
}

/**
 * Collects the read references of the parameter and of `const` aliases initialised with it.
 * Returns undefined when the parameter or an alias is written to.
 */
function collectRefs(
  fn: GuardFunction,
  paramNode: TSESTree.Identifier,
  sourceCode: Readonly<TSESLint.SourceCode>,
): { refs: Set<TSESTree.Node>; escapes: boolean } | undefined {
  const refs = new Set<TSESTree.Node>();
  let escapes = false;
  const paramVariable = sourceCode
    .getScope(fn)
    .variables.find((v) => v.defs.some((d) => d.name === paramNode));
  if (!paramVariable) return undefined;
  const queue: TSESLint.Scope.Variable[] = [paramVariable];
  const seen = new Set<TSESLint.Scope.Variable>();
  while (queue.length > 0) {
    const variable = queue.shift()!;
    if (seen.has(variable)) continue;
    seen.add(variable);
    for (const reference of variable.references) {
      if (reference.init) continue;
      if (reference.isWrite()) return undefined;
      const identifier = reference.identifier as TSESTree.Identifier;
      refs.add(identifier);
      // Walk up through wrappers: `const o = x as Record<string, unknown>`.
      let outer: TSESTree.Node = identifier;
      while (outer.parent && WRAPPERS.has(outer.parent.type)) outer = outer.parent;
      const parent = outer.parent;
      if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === outer) {
        const declaration = parent.parent as TSESTree.VariableDeclaration;
        if (declaration.kind === 'const' && parent.id.type === AST_NODE_TYPES.Identifier) {
          const alias = sourceCode.getDeclaredVariables(parent)[0];
          if (alias) queue.push(alias);
        } else if (parent.id.type === AST_NODE_TYPES.Identifier) {
          escapes = true; // let / var copy can be reassigned
        } else if (
          parent.id.type === AST_NODE_TYPES.ObjectPattern &&
          parent.id.properties.some((p) => p.type === AST_NODE_TYPES.RestElement)
        ) {
          escapes = true;
        }
      }
    }
  }
  return { refs, escapes };
}

/** Describes a user-defined type guard with a body, or returns undefined for anything else. */
export function getTypeGuard(
  fn: GuardFunction,
  sourceCode: Readonly<TSESLint.SourceCode>,
  services: ParserServicesWithTypeInformation,
): TypeGuard | undefined {
  const predicate = fn.returnType?.typeAnnotation;
  if (predicate?.type !== AST_NODE_TYPES.TSTypePredicate) return undefined;
  if (predicate.asserts || predicate.parameterName.type !== AST_NODE_TYPES.Identifier) return undefined;
  const targetNode = predicate.typeAnnotation?.typeAnnotation;
  if (!targetNode) return undefined;

  const param = findParam(fn, predicate.parameterName.name);
  if (!param || param === 'rest') return undefined;
  const collected = collectRefs(fn, param, sourceCode);
  if (!collected) return undefined;

  let checked: TSESTree.Expression[];
  let singleExpression: boolean;
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    checked = [fn.body];
    singleExpression = true;
  } else {
    checked = [];
    let bareReturn = false;
    walkOwnBody(fn.body, (node) => {
      if (node.type !== AST_NODE_TYPES.ReturnStatement) return;
      if (node.argument) checked.push(node.argument);
      else bareReturn = true;
    });
    if (bareReturn || checked.length === 0) return undefined;
    singleExpression =
      fn.body.body.length === 1 && fn.body.body[0]!.type === AST_NODE_TYPES.ReturnStatement;
  }

  return {
    fn,
    refs: collected.refs,
    escapes: collected.escapes,
    paramType: services.getTypeAtLocation(param),
    target: services.getTypeAtLocation(targetNode),
    predicateNode: predicate,
    checked,
    singleExpression,
  };
}

/** Splits an expression on `&&`; `||`, `??` and conditionals become opaque conjuncts. */
export function conjuncts(expr: TSESTree.Expression): Conjunct[] {
  if (expr.type === AST_NODE_TYPES.LogicalExpression) {
    if (expr.operator === '&&') return [...conjuncts(expr.left), ...conjuncts(expr.right)];
    return [{ node: expr, opaque: true }];
  }
  if (expr.type === AST_NODE_TYPES.ConditionalExpression) return [{ node: expr, opaque: true }];
  return [{ node: expr, opaque: false }];
}

export function isParamRef(node: TSESTree.Node, guard: TypeGuard): boolean {
  return guard.refs.has(unwrap(node));
}

/** `p.k`, `p?.k`, `p['k']`, `(p as X).k` → `'k'`. */
export function readParamAccess(expr: TSESTree.Node, guard: TypeGuard): string | undefined {
  let node = unwrap(expr);
  if (node.type === AST_NODE_TYPES.ChainExpression) node = node.expression;
  if (node.type !== AST_NODE_TYPES.MemberExpression || !isParamRef(node.object, guard)) return undefined;
  if (!node.computed && node.property.type === AST_NODE_TYPES.Identifier) return node.property.name;
  if (node.computed && node.property.type === AST_NODE_TYPES.Literal && typeof node.property.value === 'string') {
    return node.property.value;
  }
  return undefined;
}

const UNIT_LITERAL =
  ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral | ts.TypeFlags.BigIntLiteral | ts.TypeFlags.BooleanLiteral;

/** `p.k === V` / `V === p.k` where V has a unit literal type (string / number / bigint / boolean / enum literal). */
export function readDiscriminantCheck(
  node: TSESTree.Node,
  guard: TypeGuard,
  services: ParserServicesWithTypeInformation,
): { key: string; value: TSESTree.Expression; valueType: ts.Type } | undefined {
  if (node.type !== AST_NODE_TYPES.BinaryExpression || node.operator !== '===') return undefined;
  const leftKey = readParamAccess(node.left, guard);
  const rightKey = readParamAccess(node.right, guard);
  let key: string;
  let value: TSESTree.Expression;
  if (leftKey !== undefined && rightKey === undefined) [key, value] = [leftKey, node.right];
  else if (rightKey !== undefined && leftKey === undefined) [key, value] = [rightKey, node.left];
  else return undefined;
  const valueType = services.getTypeAtLocation(value);
  if (valueType.isUnion() || !(valueType.flags & UNIT_LITERAL)) return undefined;
  return { key, value, valueType };
}

/** `'k' in p` / `!('k' in p)`. */
export function readInCheck(
  expr: TSESTree.Node,
  guard: TypeGuard,
): { key: string; negated: boolean } | undefined {
  let node = expr;
  let negated = false;
  if (node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!') {
    negated = true;
    node = node.argument;
  }
  if (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    node.operator === 'in' &&
    node.left.type === AST_NODE_TYPES.Literal &&
    typeof node.left.value === 'string' &&
    isParamRef(node.right, guard)
  ) {
    return { key: node.left.value, negated };
  }
  return undefined;
}

function isLibType(type: ts.Type): boolean {
  return (type.getSymbol()?.declarations ?? []).some((d) =>
    /(?:^|[\\/])lib\.[\w.-]+\.d\.ts$/.test(d.getSourceFile().fileName),
  );
}

/** An object type with at least one property or an index signature, other than lib `Object`. */
export function isShaped(member: ts.Type, checker: ts.TypeChecker): boolean {
  const objectLike = member.isIntersection()
    ? member.types.every((t) => (t.flags & ts.TypeFlags.Object) !== 0)
    : (member.flags & ts.TypeFlags.Object) !== 0;
  if (!objectLike) return false;
  if (member.getSymbol()?.getName() === 'Object' && isLibType(member)) return false;
  return member.getProperties().length > 0 || checker.getIndexInfosOfType(member).length > 0;
}

function defineSemantics(options: ts.CompilerOptions): boolean {
  if (options.useDefineForClassFields !== undefined) return options.useDefineForClassFields;
  const target = options.target ?? ts.ScriptTarget.ES5;
  return target >= ts.ScriptTarget.ES2022;
}

/** A class field that may be absent at runtime: `declare`, or uninitialised without define semantics. */
function mayBeAbsentField(symbol: ts.Symbol, options: ts.CompilerOptions): boolean {
  const declaration = symbol.valueDeclaration;
  if (!declaration || !ts.isPropertyDeclaration(declaration)) return false;
  const modifiers = ts.getCombinedModifierFlags(declaration);
  if (modifiers & ts.ModifierFlags.Ambient) return true;
  return declaration.initializer === undefined && !defineSemantics(options);
}

export type PropertyPresence = 'required' | 'declared' | 'index' | 'none';

/** How a member type knows property `k` (inherited and apparent members included). */
export function memberHasProperty(
  member: ts.Type,
  key: string,
  checker: ts.TypeChecker,
  options: ts.CompilerOptions,
): PropertyPresence {
  const property = checker.getPropertyOfType(member, key);
  if (property) {
    const optional = (property.flags & ts.SymbolFlags.Optional) !== 0 || mayBeAbsentField(property, options);
    return optional ? 'declared' : 'required';
  }
  const keyType = checker.getStringLiteralType(key);
  const indexed = checker.getIndexInfosOfType(member).some((info) => checker.isTypeAssignableTo(keyType, info.keyType));
  return indexed ? 'index' : 'none';
}

/** Required data properties: not optional, not methods / accessors, not private, not symbol-keyed. */
export function requiredDataProperties(member: ts.Type): ts.Symbol[] {
  return member.getProperties().filter((property) => {
    if (property.flags & (ts.SymbolFlags.Optional | ts.SymbolFlags.Method | ts.SymbolFlags.Accessor)) return false;
    const name = property.getName();
    if (name.startsWith('__@') || name.startsWith('#')) return false;
    const declaration = property.valueDeclaration;
    if (declaration && ts.getCombinedModifierFlags(declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) {
      return false;
    }
    return true;
  });
}
