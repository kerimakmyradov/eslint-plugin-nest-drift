import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../core/create-rule';
import {
  getTypeGuard,
  isParamRef,
  conjuncts,
  isShaped,
  readDiscriminantCheck,
  readInCheck,
  readParamAccess,
  requiredDataProperties,
  unwrap,
  walkOwnBody,
  type GuardFunction,
  type TypeGuard,
} from '../core/guards';
import { isArrayLike, nonNullish } from '../core/type-compare';

type Options = [{ maxProperties?: number }];

const DEFAULT_MAX_PROPERTIES = 30;

function staticName(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) return node.name;
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') return node.value;
  return undefined;
}

/** `Object.hasOwn(p, 'k')`, `Reflect.has(p, 'k')`, `Object.prototype.hasOwnProperty.call(p, 'k')`. */
function hasOwnCall(call: TSESTree.CallExpression, guard: TypeGuard): string | undefined | null {
  const callee = call.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return null;
  const method = staticName(callee.property);
  const owner = callee.object;
  const [subject, key] = call.arguments;
  const keyName = key?.type === AST_NODE_TYPES.Literal && typeof key.value === 'string' ? key.value : undefined;
  const isStatic = (object: string, name: string): boolean =>
    owner.type === AST_NODE_TYPES.Identifier && owner.name === object && method === name;
  if ((isStatic('Object', 'hasOwn') || isStatic('Reflect', 'has')) && subject && isParamRef(subject, guard)) {
    return keyName;
  }
  if (
    method === 'call' &&
    owner.type === AST_NODE_TYPES.MemberExpression &&
    staticName(owner.property) === 'hasOwnProperty' &&
    subject &&
    isParamRef(subject, guard)
  ) {
    return keyName;
  }
  return null;
}

/** Properties the guard reads or tests, and whether it hands the value to something else. */
function inspect(guard: TypeGuard): { touched: Set<string>; delegates: boolean } {
  const touched = new Set<string>();
  let delegates = guard.escapes;
  const visited = new Set<TSESTree.Node>();
  walkOwnBody(guard.fn.body, (node) => {
    visited.add(node);
    // Keys that are not literals (`k in x`, `x[k]`) come from a dynamic list: cannot be counted.
    if (
      node.type === AST_NODE_TYPES.BinaryExpression &&
      node.operator === 'in' &&
      isParamRef(node.right, guard) &&
      !(node.left.type === AST_NODE_TYPES.Literal && typeof node.left.value === 'string')
    ) {
      delegates = true;
    }
    if (
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.computed &&
      isParamRef(node.object, guard) &&
      !(node.property.type === AST_NODE_TYPES.Literal && typeof node.property.value === 'string')
    ) {
      delegates = true;
    }
    // Identity with another value (`x === EMPTY`) proves the shape by reference.
    if (
      node.type === AST_NODE_TYPES.BinaryExpression &&
      (node.operator === '===' || node.operator === '!==' || node.operator === '==' || node.operator === '!=')
    ) {
      const [a, b] = [node.left, node.right];
      const other = isParamRef(a, guard) ? b : isParamRef(b, guard) ? a : undefined;
      const isNullish =
        other !== undefined &&
        ((other.type === AST_NODE_TYPES.Literal && other.value === null) ||
          (other.type === AST_NODE_TYPES.Identifier && other.name === 'undefined'));
      if (other !== undefined && !isNullish) delegates = true;
    }
    const access = readParamAccess(node, guard);
    if (access !== undefined) touched.add(access);
    const inCheck = readInCheck(node, guard);
    if (inCheck) touched.add(inCheck.key);

    if (
      node.type === AST_NODE_TYPES.VariableDeclarator &&
      node.init &&
      isParamRef(node.init, guard) &&
      node.id.type === AST_NODE_TYPES.ObjectPattern
    ) {
      for (const property of node.id.properties) {
        if (property.type === AST_NODE_TYPES.RestElement) delegates = true;
        else if (!property.computed) {
          const name = staticName(property.key);
          if (name !== undefined) touched.add(name);
        }
      }
    }
    if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === 'instanceof' && isParamRef(node.left, guard)) {
      delegates = true;
    }
    if (node.type !== AST_NODE_TYPES.CallExpression) return;

    const own = hasOwnCall(node, guard);
    if (own !== null) {
      if (own !== undefined) touched.add(own);
      return;
    }
    const callee = unwrap(node.callee);
    // A method called on the value itself: only `p.hasOwnProperty('k')` is understood.
    if (callee.type === AST_NODE_TYPES.MemberExpression && isParamRef(callee.object, guard)) {
      const [key] = node.arguments;
      if (staticName(callee.property) === 'hasOwnProperty' && key?.type === AST_NODE_TYPES.Literal && typeof key.value === 'string') {
        touched.add(key.value);
      } else {
        delegates = true;
      }
      return;
    }
    const isArrayIsArray =
      callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === 'Array' &&
      staticName(callee.property) === 'isArray';
    if (!isArrayIsArray && node.arguments.some((argument) => isParamRef(argument, guard))) delegates = true;
  });
  // A reference used inside a nested function (e.g. `keys.every((k) => k in x)`) is a dynamic check.
  const [bodyStart, bodyEnd] = guard.fn.body.range;
  for (const ref of guard.refs) {
    const inBody = ref.range[0] >= bodyStart && ref.range[1] <= bodyEnd;
    if (inBody && !visited.has(ref)) delegates = true;
  }
  return { touched, delegates };
}

function isLooseParameter(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive)) return true;
  if (!(type.flags & ts.TypeFlags.Object) || type.getProperties().length > 0) return false;
  const indexInfos = checker.getIndexInfosOfType(type);
  if (indexInfos.length === 0) return true; // `{}`
  return indexInfos.every((info) => info.type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
}

function isLibOrCollection(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (isArrayLike(type, checker)) return true;
  return (type.getSymbol()?.declarations ?? []).some((d) =>
    /(?:^|[\\/])lib\.[\w.-]+\.d\.ts$/.test(d.getSourceFile().fileName),
  );
}

export const guardCoversRequiredProperties = createRule<Options, 'uncheckedProperties'>({
  name: 'guard-covers-required-properties',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require a type guard on unknown input to check every required property of the guarded type',
      recommended: false,
      requiresTypeChecking: true,
    },
    messages: {
      uncheckedProperties: 'The guard promises `{{target}}` but never checks {{properties}}.',
    },
    schema: [
      {
        type: 'object',
        properties: { maxProperties: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ maxProperties: DEFAULT_MAX_PROPERTIES }],
  create(context, [options]) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const maxProperties = options.maxProperties ?? DEFAULT_MAX_PROPERTIES;

    function check(fn: GuardFunction): void {
      const guard = getTypeGuard(fn, context.sourceCode, services);
      if (!guard || !isLooseParameter(guard.paramType, checker)) return;
      const members = nonNullish(guard.target);
      if (members.length !== 1) return;
      const [member] = members as [ts.Type];
      if (!isShaped(member, checker) || isLibOrCollection(member, checker)) return;
      const required = requiredDataProperties(member).map((p) => p.getName());
      if (required.length === 0 || required.length > maxProperties) return;

      // A discriminant check (`x.kind === Kind.Foo`) is the conventional proof of a union member.
      const isDiscriminantGuard = guard.checked.some((expression) =>
        conjuncts(expression).some(({ node, opaque }) => !opaque && readDiscriminantCheck(node, guard, services)),
      );
      if (isDiscriminantGuard) return;
      const { touched, delegates } = inspect(guard);
      if (delegates) return;
      const missing = required.filter((name) => !touched.has(name));
      if (missing.length === 0) return;
      context.report({
        node: guard.predicateNode,
        messageId: 'uncheckedProperties',
        data: {
          target: checker.typeToString(guard.target),
          properties: missing.map((name) => `\`${name}\``).join(', '),
        },
      });
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
});
