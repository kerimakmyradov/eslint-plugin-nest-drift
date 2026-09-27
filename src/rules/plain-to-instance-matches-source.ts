import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../core/create-rule';
import { packageOfFile, resolveSymbol } from '../core/decorators';
import { getTsDecorators, tsOptionKeys } from '../core/ts-decorators';
import { isUncheckable, kindOf, kindsOf, nonNullish, type Kind } from '../core/type-compare';

type Options = [{ checkMissing?: boolean }];
type MessageIds = 'kindMismatch' | 'missingInSource';

const FUNCTIONS: ReadonlySet<string> = new Set(['plainToInstance', 'plainToClass']);
/** Options that do not change which keys are copied; anything else (`groups`, `version`, …) skips the call. */
const SUPPORTED_OPTIONS: ReadonlySet<string> = new Set([
  'excludeExtraneousValues',
  'exposeUnsetFields',
  'enableCircularCheck',
  'strategy',
  'enableImplicitConversion',
]);
/** `@Expose()` options that rename the key or hide it from `plainToInstance`. */
const EXPOSE_SKIP_OPTIONS: ReadonlySet<string> = new Set(['name', 'groups', 'since', 'until', 'toPlainOnly']);
const PRIMITIVE_KINDS: ReadonlySet<Kind> = new Set(['string', 'number', 'boolean', 'bigint']);

interface Call {
  node: TSESTree.CallExpression;
  scope: TSESTree.Node;
}

/**
 * Nearest enclosing function (or the program): the region where the result may be patched.
 * Callbacks (`rows.map((r) => plainToInstance(Dto, r))`) are looked through: the mapped
 * result is usually patched in the surrounding function.
 */
function enclosingScope(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.Program || current.type === AST_NODE_TYPES.FunctionDeclaration) return current;
    if (
      (current.type === AST_NODE_TYPES.FunctionExpression || current.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
      current.parent.type !== AST_NODE_TYPES.CallExpression
    ) {
      return current;
    }
    current = current.parent;
  }
  return node;
}

function staticKey(node: TSESTree.Node, computed: boolean): string | undefined {
  if (!computed && node.type === AST_NODE_TYPES.Identifier) return node.name;
  if (node.type === AST_NODE_TYPES.Literal && (typeof node.value === 'string' || typeof node.value === 'number')) {
    return String(node.value);
  }
  return undefined;
}

function classDeclaration(symbol: ts.Symbol | undefined): ts.ClassLikeDeclaration | undefined {
  if (!symbol || !(symbol.flags & ts.SymbolFlags.Class)) return undefined;
  const declaration = symbol.declarations?.find(
    (d): d is ts.ClassLikeDeclaration => ts.isClassDeclaration(d) || ts.isClassExpression(d),
  );
  // Decorators are not emitted into `.d.ts` files: a compiled DTO cannot be judged.
  return declaration && !declaration.getSourceFile().isDeclarationFile ? declaration : undefined;
}

function memberName(member: ts.ClassElement): string | undefined {
  const name = member.name;
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

export const plainToInstanceMatchesSource = createRule<Options, MessageIds>({
  name: 'plain-to-instance-matches-source',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require `plainToInstance()` DTO properties to agree with the properties of the source object',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      kindMismatch: '`{{dto}}.{{property}}` is typed as `{{expected}}`, but `{{source}}.{{property}}` is `{{actual}}`.',
      missingInSource: '`{{dto}}.{{property}}` is exposed, but `{{source}}` has no `{{property}}`: it is always `undefined`.',
    },
    schema: [
      {
        type: 'object',
        properties: { checkMissing: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ checkMissing: false }],
  create(context, [{ checkMissing }]) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const calls: Call[] = [];
    /** Property names written after a call: `dto.amount = …`, `{ ...dto, amount }`. */
    const writes: { name: string; node: TSESTree.Node }[] = [];
    const objectAssigns: TSESTree.Node[] = [];

    function isPlainToInstance(callee: TSESTree.Node): boolean {
      if (callee.type !== AST_NODE_TYPES.Identifier && callee.type !== AST_NODE_TYPES.MemberExpression) return false;
      const symbol = resolveSymbol(callee, services);
      const declaration = symbol?.declarations?.[0];
      return (
        symbol !== undefined &&
        FUNCTIONS.has(symbol.getName()) &&
        declaration !== undefined &&
        packageOfFile(declaration.getSourceFile().fileName) === 'class-transformer'
      );
    }

    /** Object types of the source with arrays / tuples unwrapped; undefined when any cannot be judged. */
    function sourceObjects(type: ts.Type): ts.Type[] | undefined {
      const result: ts.Type[] = [];
      const queue = [...nonNullish(type)];
      while (queue.length > 0) {
        const part = queue.shift()!;
        if (checker.isArrayType(part) || checker.isTupleType(part)) {
          const elements = checker.getTypeArguments(part as ts.TypeReference);
          if (elements.length === 0) return undefined;
          elements.forEach((element) => queue.push(...nonNullish(element)));
          continue;
        }
        if (kindOf(part, checker) !== 'object') return undefined;
        if (part.getProperties().length === 0 || checker.getIndexInfosOfType(part).length > 0) return undefined;
        if (part.getCallSignatures().length > 0 || part.getConstructSignatures().length > 0) return undefined;
        result.push(part);
      }
      return result.length > 0 ? result : undefined;
    }

    /** The DTO class and its ancestors, nearest first; undefined when a base class cannot be resolved. */
    function classChain(declaration: ts.ClassLikeDeclaration): ts.ClassLikeDeclaration[] | undefined {
      const chain = [declaration];
      let current = declaration;
      for (;;) {
        const clause = current.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword);
        const expression = clause?.types[0]?.expression;
        if (!expression) return chain;
        // `extends PartialType(Base)` copies class-transformer metadata we cannot see: give up.
        if (!ts.isIdentifier(expression) && !ts.isPropertyAccessExpression(expression)) return undefined;
        let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(expression) ? expression.name : expression);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        const base = classDeclaration(symbol);
        if (!base || chain.includes(base)) return undefined;
        chain.push(base);
        current = base;
      }
    }

    function check({ node, scope }: Call): void {
      const [dtoArg, sourceArg, optionsArg, ...rest] = node.arguments;
      if (!dtoArg || !sourceArg || rest.length > 0) return;
      if ([dtoArg, sourceArg, optionsArg].some((a) => a?.type === AST_NODE_TYPES.SpreadElement)) return;

      // options: only keys that do not change which properties are copied, with literal values
      const options = new Map<string, unknown>();
      if (optionsArg) {
        if (optionsArg.type !== AST_NODE_TYPES.ObjectExpression) return;
        for (const prop of optionsArg.properties) {
          if (prop.type !== AST_NODE_TYPES.Property || prop.computed) return;
          const key = staticKey(prop.key, false);
          if (!key || !SUPPORTED_OPTIONS.has(key) || prop.value.type !== AST_NODE_TYPES.Literal) return;
          options.set(key, prop.value.value);
        }
      }

      const dtoSymbol = resolveSymbol(dtoArg, services);
      const dtoDeclaration = classDeclaration(dtoSymbol);
      if (!dtoSymbol || !dtoDeclaration || dtoDeclaration.typeParameters?.length) return;
      const chain = classChain(dtoDeclaration);
      if (!chain) return;
      const sources = sourceObjects(services.getTypeAtLocation(sourceArg));
      if (!sources) return;

      // A result handed to Object.assign may be patched in ways we cannot follow.
      if (objectAssigns.some((a) => a.range[0] > node.range[1] && within(a, scope))) return;
      const patched = new Set(
        writes.filter((w) => w.node.range[0] > node.range[1] && within(w.node, scope)).map((w) => w.name),
      );

      // Class-level strategy is read from the DTO class itself only (not inherited).
      const classDecorators = getTsDecorators(dtoDeclaration, checker).filter((d) => d.module === 'class-transformer');
      const classExclude = classDecorators.some((d) => d.name === 'Exclude');
      const classExpose = classDecorators.some((d) => d.name === 'Expose');
      const exposeMode =
        (classExclude && !classExpose) ||
        options.get('excludeExtraneousValues') === true ||
        options.get('strategy') === 'excludeAll';

      const dtoName = dtoSymbol.getName();
      const sourceName = [...new Set(sources.map((s) => checker.typeToString(s)))].join(' | ');
      const instance = checker.getDeclaredTypeOfSymbol(dtoSymbol);

      for (const property of instance.getProperties()) {
        const name = property.getName();
        if (patched.has(name)) continue;
        const members = chain.flatMap((c) => c.members.filter((m) => memberName(m) === name));
        const nearest = members[0];
        if (!nearest || !ts.isPropertyDeclaration(nearest)) continue;
        const flags = ts.getCombinedModifierFlags(nearest);
        if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Static)) continue;

        const decorators = members
          .flatMap((m) => getTsDecorators(m, checker))
          .filter((d) => d.module === 'class-transformer');
        if (decorators.some((d) => d.name === 'Exclude' || d.name === 'Transform' || d.name === 'Type')) continue;
        const exposes = decorators.filter((d) => d.name === 'Expose');
        if (
          exposes.some((d) => {
            const keys = tsOptionKeys(d.call);
            return !keys || [...keys].some((key) => EXPOSE_SKIP_OPTIONS.has(key));
          })
        ) {
          continue;
        }
        if (exposeMode && exposes.length === 0) continue;

        const present = sources.map((s) => s.getProperty(name)).filter((p): p is ts.Symbol => p !== undefined);
        const data = { dto: dtoName, property: name, source: sourceName };
        if (present.length === 0) {
          const required =
            !(property.flags & ts.SymbolFlags.Optional) &&
            !(options.get('exposeUnsetFields') === false && nearest.initializer);
          const allEntities = sources.every((s) => (s.getSymbol()?.flags ?? 0) & ts.SymbolFlags.Class);
          if (checkMissing && exposeMode && required && allEntities) {
            context.report({ node, messageId: 'missingInSource', data });
          }
          continue;
        }

        if (options.has('enableImplicitConversion')) continue;
        const dtoType = checker.getTypeOfSymbol(property);
        const sourceTypes = present.map((p) => checker.getTypeOfSymbol(p));
        if ([dtoType, ...sourceTypes].some((t) => isUncheckable(t, checker))) continue;
        const expected = primitiveKinds(dtoType);
        const actual = primitiveKinds(...sourceTypes);
        if (!expected || !actual || expected.some((kind) => actual.includes(kind))) continue;
        context.report({
          node,
          messageId: 'kindMismatch',
          data: {
            ...data,
            expected: checker.typeToString(dtoType),
            actual: [...new Set(sourceTypes.map((t) => checker.typeToString(t)))].join(' | '),
          },
        });
      }
    }

    /** Non-nullish kinds when all of them are primitives; undefined when dates, objects or arrays take part. */
    function primitiveKinds(...types: ts.Type[]): Kind[] | undefined {
      const kinds = types.flatMap((t) => kindsOf(t, checker)).filter((k) => k !== 'null' && k !== 'undefined');
      if (kinds.length === 0 || !kinds.every((k) => PRIMITIVE_KINDS.has(k))) return undefined;
      return kinds;
    }

    function within(node: TSESTree.Node, scope: TSESTree.Node): boolean {
      return node.range[0] >= scope.range[0] && node.range[1] <= scope.range[1];
    }

    return {
      CallExpression(node) {
        if (isPlainToInstance(node.callee)) {
          calls.push({ node, scope: enclosingScope(node) });
          return;
        }
        const callee = node.callee;
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === 'Object' &&
          staticKey(callee.property, callee.computed) === 'assign'
        ) {
          objectAssigns.push(node);
        }
      },
      AssignmentExpression(node) {
        if (node.left.type !== AST_NODE_TYPES.MemberExpression) return;
        const name = staticKey(node.left.property, node.left.computed);
        if (name !== undefined) writes.push({ name, node });
      },
      ObjectExpression(node) {
        if (!node.properties.some((p) => p.type === AST_NODE_TYPES.SpreadElement)) return;
        for (const prop of node.properties) {
          if (prop.type !== AST_NODE_TYPES.Property) continue;
          const name = staticKey(prop.key, prop.computed);
          if (name !== undefined) writes.push({ name, node: prop });
        }
      },
      'Program:exit'() {
        calls.forEach(check);
      },
    };
  },
});
