import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';
import { createRule } from '../core/create-rule';
import { getDecorators, propertyName, resolveSymbol } from '../core/decorators';
import {
  collectionElementType,
  enumValueTypes,
  hasNull,
  isArrayLike,
  isEnumMismatch,
  isUncheckable,
  kindsOf,
  nonNullish,
  type Kind,
} from '../core/type-compare';
import { COLUMN_DECORATORS, columnInfo, type ColumnInfo, type ColumnKind } from '../core/typeorm';

const TYPEORM = ['typeorm'] as const;
const RELATION_DECORATORS: ReadonlySet<string> = new Set(['ManyToOne', 'OneToOne']);

type Options = [
  {
    decimal?: 'string' | 'number';
    bigint?: 'off' | 'string' | 'number';
    timestamp?: 'date' | 'string';
    reportNullOnNotNull?: boolean;
  },
];

const KIND_TEXT: Readonly<Record<string, string>> = {
  string: 'strings',
  number: 'numbers',
  boolean: 'booleans',
  date: '`Date` objects',
};

/**
 * Columns TypeORM may retype to the referenced column of a relation: names of `@JoinColumn({ name })`,
 * and — for relations without a literal join column name — the relation property name as a prefix
 * (the default join column of `account` is `accountId`). `undefined` when a name cannot be read.
 */
interface JoinColumns {
  names: Set<string>;
  prefixes: string[];
}

function joinColumnNames(node: TSESTree.Node | undefined): string[] | undefined {
  if (!node) return [];
  const objects = node.type === AST_NODE_TYPES.ArrayExpression ? node.elements : [node];
  const names: string[] = [];
  for (const object of objects) {
    if (object?.type !== AST_NODE_TYPES.ObjectExpression) return undefined;
    for (const prop of object.properties) {
      if (prop.type !== AST_NODE_TYPES.Property || prop.computed) return undefined;
      if (prop.key.type !== AST_NODE_TYPES.Identifier || prop.key.name !== 'name') continue;
      if (prop.value.type !== AST_NODE_TYPES.Literal || typeof prop.value.value !== 'string') return undefined;
      names.push(prop.value.value);
    }
  }
  return names;
}

function collectJoinColumns(body: TSESTree.ClassBody, services: ParserServicesWithTypeInformation): JoinColumns | undefined {
  const result: JoinColumns = { names: new Set(), prefixes: [] };
  for (const member of body.body) {
    if (member.type !== AST_NODE_TYPES.PropertyDefinition) continue;
    const decorators = getDecorators(member, services, TYPEORM);
    const join = decorators.find((d) => d.name === 'JoinColumn');
    const names = join ? joinColumnNames(join.args[0]) : [];
    if (!names) return undefined;
    names.forEach((name) => result.names.add(name));
    if (decorators.some((d) => RELATION_DECORATORS.has(d.name)) && names.length === 0) {
      result.prefixes.push(propertyName(member));
    }
  }
  return result;
}

export const columnMatchesType = createRule<Options, 'columnKindMismatch' | 'columnEnumMismatch' | 'nullableWithoutNull' | 'nullOnNotNullColumn'>({
  name: 'column-matches-type',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require TypeORM column types to agree with the TypeScript type of the property',
      recommended: true,
      requiresTypeChecking: true,
    },
    messages: {
      columnKindMismatch: '`{{column}}` columns are read as {{expected}}, but `{{property}}` is typed as `{{actual}}`.',
      columnEnumMismatch: 'The `{{column}}` column stores `{{enumName}}`, but `{{property}}` is typed as `{{actual}}`.',
      nullableWithoutNull: '`{{property}}` is a nullable column, but its type `{{actual}}` does not include `null`.',
      nullOnNotNullColumn: '`{{property}}` is typed as `{{actual}}`, but the column is not nullable.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          decimal: { type: 'string', enum: ['string', 'number'] },
          bigint: { type: 'string', enum: ['off', 'string', 'number'] },
          timestamp: { type: 'string', enum: ['date', 'string'] },
          reportNullOnNotNull: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ decimal: 'string', bigint: 'off', timestamp: 'date', reportNullOnNotNull: false }],
  create(context, [options]) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    // Without strictNullChecks TypeScript erases `| null`, so nullability cannot be compared.
    const compilerOptions = services.program.getCompilerOptions();
    const strictNullChecks = compilerOptions.strictNullChecks ?? compilerOptions.strict ?? false;
    const joinColumnsCache = new WeakMap<TSESTree.ClassBody, JoinColumns | undefined>();

    function joinColumns(body: TSESTree.ClassBody): JoinColumns | undefined {
      if (!joinColumnsCache.has(body)) joinColumnsCache.set(body, collectJoinColumns(body, services));
      return joinColumnsCache.get(body);
    }

    /** Runtime kind after applying driver options; undefined when not checked. */
    function runtimeKind(kind: ColumnKind | undefined): Kind | undefined {
      switch (kind) {
        case 'decimal':
          return options.decimal ?? 'string';
        case 'bigint':
          return options.bigint === 'off' || options.bigint === undefined ? undefined : options.bigint;
        case 'timestamp':
          return options.timestamp ?? 'date';
        case 'enum':
          return undefined;
        default:
          return kind;
      }
    }

    function isRetypedByRelation(node: TSESTree.PropertyDefinition, column: ColumnInfo): boolean {
      if (node.parent.type !== AST_NODE_TYPES.ClassBody) return true;
      const joins = joinColumns(node.parent);
      if (!joins || column.databaseName === null) return true;
      const names = [propertyName(node), column.databaseName].filter((n): n is string => typeof n === 'string');
      return names.some((name) => joins.names.has(name) || joins.prefixes.some((prefix) => name.startsWith(prefix)));
    }

    /** Allowed values of `enum: E` / `enum: ['a', 'b']`; undefined when they cannot be read. */
    function enumValues(node: TSESTree.Node): ts.Type[] | undefined {
      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        const values: ts.Type[] = [];
        for (const element of node.elements) {
          if (element?.type !== AST_NODE_TYPES.Literal) return undefined;
          values.push(services.getTypeAtLocation(element));
        }
        return values.length > 0 ? values : undefined;
      }
      const symbol = resolveSymbol(node, services);
      return symbol && enumValueTypes(symbol, checker);
    }

    function checkType(node: TSESTree.PropertyDefinition, column: ColumnInfo, type: ts.Type): void {
      if (column.array === 'unknown' || !column.typeName) return;
      const array = column.array === 'true';
      const columnKind = array ? column.arrayKind : column.kind;
      const expected = runtimeKind(columnKind);
      if (!expected && !(columnKind === 'enum' && column.enumNode)) return;
      const label = array ? `${column.typeName}[]` : column.typeName;
      const data = { column: label, property: propertyName(node), actual: checker.typeToString(type) };
      let checked = type;
      if (array) {
        const parts = nonNullish(type);
        if (parts.length === 0) return;
        if (!parts.some((part) => isArrayLike(part, checker))) {
          context.report({ node: column.decorator.node, messageId: 'columnKindMismatch', data: { ...data, expected: 'arrays' } });
          return;
        }
        const element = collectionElementType(type, checker);
        if (!element) return;
        checked = element;
      }
      if (isUncheckable(checked, checker) || nonNullish(checked).length === 0) return;

      if (!expected) {
        const allowed = enumValues(column.enumNode!);
        if (allowed && isEnumMismatch(checked, allowed, checker, node.typeAnnotation !== undefined)) {
          context.report({
            node: column.decorator.node,
            messageId: 'columnEnumMismatch',
            data: { ...data, enumName: context.sourceCode.getText(column.enumNode!) },
          });
        }
        return;
      }
      const kinds: Kind[] = kindsOf(checked, checker).filter((k) => k !== 'null' && k !== 'undefined');
      if (kinds.includes(expected)) return;
      context.report({
        node: column.decorator.node,
        messageId: 'columnKindMismatch',
        data: { ...data, expected: array ? `arrays of ${KIND_TEXT[expected]}` : KIND_TEXT[expected]! },
      });
    }

    function checkNullability(node: TSESTree.PropertyDefinition, column: ColumnInfo, type: ts.Type): void {
      const data = { property: propertyName(node), actual: checker.typeToString(type) };
      const typeHasNull = hasNull(type);
      if (column.nullable === 'true' && !typeHasNull) {
        context.report({ node: column.decorator.node, messageId: 'nullableWithoutNull', data });
      } else if (
        options.reportNullOnNotNull &&
        typeHasNull &&
        (column.nullable === 'false' || column.nullable === 'absent')
      ) {
        context.report({ node: column.decorator.node, messageId: 'nullOnNotNullColumn', data });
      }
    }

    return {
      PropertyDefinition(node) {
        const decorator = getDecorators(node, services, TYPEORM).find((d) => COLUMN_DECORATORS.has(d.name));
        const column = decorator && columnInfo(decorator, services);
        if (!column) return;
        const type = services.getTypeAtLocation(node);
        if (isUncheckable(type, checker)) return;
        if (!isRetypedByRelation(node, column)) checkType(node, column, type);
        if (strictNullChecks) checkNullability(node, column, type);
      },
    };
  },
});
