import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { ParserServicesWithTypeInformation, TSESTree } from '@typescript-eslint/utils';
import { resolveSymbol, type DecoratorInfo, type OptionState } from './decorators';

/**
 * What the driver returns for a column (TypeORM 0.3 / 1.x with `pg` / `mysql2` defaults).
 * `decimal`, `bigint` and `timestamp` depend on driver settings and are resolved by rule options;
 * `enum` is compared against the enum values instead of a kind.
 */
export type ColumnKind = 'string' | 'number' | 'boolean' | 'date' | 'decimal' | 'bigint' | 'timestamp' | 'enum';

export interface ColumnInfo {
  decorator: DecoratorInfo<string>;
  /** Column type as written (`decimal`, `Number`, `uuid`) or the decorator's default, for messages. */
  typeName: string | undefined;
  /** Runtime kind of a scalar column; undefined when unknown or not checked. */
  kind: ColumnKind | undefined;
  /** Runtime kind of an element of an `array: true` column (PostgreSQL). */
  arrayKind: ColumnKind | undefined;
  array: OptionState;
  nullable: OptionState;
  /** `enum` option of an enum column. */
  enumNode: TSESTree.Node | undefined;
  /** Database name from the `name` option; undefined when not given, null when not a literal. */
  databaseName: string | null | undefined;
}

type KindPair = readonly [scalar: ColumnKind | undefined, array: ColumnKind | undefined];

const COLUMN_TYPES: ReadonlyMap<string, KindPair> = new Map<string, KindPair>([
  ...[
    'int', 'int2', 'int4', 'integer', 'smallint', 'tinyint', 'mediumint',
    'float', 'float4', 'float8', 'double', 'double precision', 'real',
  ].map((name): [string, KindPair] => [name, ['number', 'number']]),
  ...['decimal', 'numeric', 'dec'].map((name): [string, KindPair] => [name, ['decimal', 'number']]),
  ['money', ['string', 'string']],
  ...['bigint', 'int8'].map((name): [string, KindPair] => [name, ['bigint', 'bigint']]),
  ...[
    'varchar', 'character varying', 'char', 'character', 'nvarchar', 'nchar',
    'text', 'tinytext', 'mediumtext', 'longtext', 'uuid', 'inet', 'cidr', 'macaddr',
    'time', 'timetz', 'time with time zone', 'time without time zone',
  ].map((name): [string, KindPair] => [name, ['string', 'string']]),
  ['citext', ['string', undefined]], // no array parser registered: arrays come back as strings
  ['date', ['string', 'date']],
  ...['timestamp', 'timestamptz', 'timestamp with time zone', 'timestamp without time zone'].map(
    (name): [string, KindPair] => [name, ['timestamp', 'date']],
  ),
  ...['datetime', 'datetime2'].map((name): [string, KindPair] => [name, ['date', 'date']]),
  ...['bool', 'boolean'].map((name): [string, KindPair] => [name, ['boolean', 'boolean']]),
  ...['enum', 'simple-enum'].map((name): [string, KindPair] => [name, ['enum', 'enum']]),
]);

const CONSTRUCTOR_KINDS: Readonly<Record<string, ColumnKind>> = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Date: 'date',
};

export const COLUMN_DECORATORS: ReadonlySet<string> = new Set([
  'Column',
  'PrimaryColumn',
  'PrimaryGeneratedColumn',
  'CreateDateColumn',
  'UpdateDateColumn',
  'DeleteDateColumn',
  'VersionColumn',
]);

/** Properties of an object literal; undefined when it has spreads or computed keys (cannot be read). */
function literalProperties(node: TSESTree.ObjectExpression): Map<string, TSESTree.Node> | undefined {
  const result = new Map<string, TSESTree.Node>();
  for (const prop of node.properties) {
    if (prop.type !== AST_NODE_TYPES.Property || prop.computed) return undefined;
    const key =
      prop.key.type === AST_NODE_TYPES.Identifier
        ? prop.key.name
        : prop.key.type === AST_NODE_TYPES.Literal
          ? String(prop.key.value)
          : undefined;
    if (key === undefined) return undefined;
    result.set(key, prop.value);
  }
  return result;
}

function booleanState(node: TSESTree.Node | undefined): OptionState {
  if (!node) return 'absent';
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'boolean') return node.value ? 'true' : 'false';
  return 'unknown';
}

interface ResolvedType {
  typeName: string;
  pair: KindPair;
}

/** `'decimal'` or a lib constructor (`Number`); undefined for anything else (embedded thunks, variables). */
function resolveColumnType(
  node: TSESTree.Node,
  services: ParserServicesWithTypeInformation,
): ResolvedType | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    const typeName = node.value.toLowerCase();
    return { typeName, pair: COLUMN_TYPES.get(typeName) ?? [undefined, undefined] };
  }
  if (node.type !== AST_NODE_TYPES.Identifier) return undefined;
  const symbol = resolveSymbol(node, services);
  const declarations = symbol?.declarations ?? [];
  if (!symbol || declarations.length === 0) return undefined;
  if (!declarations.every((d) => services.program.isSourceFileDefaultLibrary(d.getSourceFile()))) return undefined;
  const kind = CONSTRUCTOR_KINDS[symbol.getName()];
  return kind ? { typeName: symbol.getName(), pair: [kind, kind] } : undefined;
}

/**
 * Column type, nullability and array-ness of a TypeORM column decorator, or undefined when the
 * column cannot be judged at all: a `transformer`, embedded columns, options that are not an
 * object literal (shared objects, spreads) or a type that is not a literal.
 */
export function columnInfo(
  decorator: DecoratorInfo<string>,
  services: ParserServicesWithTypeInformation,
): ColumnInfo | undefined {
  if (!COLUMN_DECORATORS.has(decorator.name)) return undefined;
  const args = decorator.args;
  let typeArg: TSESTree.Node | undefined;
  let optionArgs: readonly TSESTree.Node[];
  let fallback: ResolvedType | undefined;
  switch (decorator.name) {
    case 'Column':
    case 'PrimaryColumn': {
      const [first, second] = args;
      if (first?.type === AST_NODE_TYPES.ObjectExpression) {
        optionArgs = [first];
      } else {
        // `@Column(Foo)`: any function (even `Number`) registers an embedded entity; PrimaryColumn takes constructors.
        if (decorator.name === 'Column' && first && first.type !== AST_NODE_TYPES.Literal) return undefined;
        typeArg = first;
        optionArgs = second ? [second] : [];
      }
      break;
    }
    case 'PrimaryGeneratedColumn': {
      const [first, second] = args;
      let strategy = 'increment';
      if (first && first.type !== AST_NODE_TYPES.ObjectExpression) {
        if (first.type !== AST_NODE_TYPES.Literal || typeof first.value !== 'string') return undefined;
        strategy = first.value;
        optionArgs = second ? [second] : [];
      } else {
        optionArgs = [first, second].filter((a) => a !== undefined);
      }
      if (strategy === 'increment' || strategy === 'identity') fallback = { typeName: 'integer', pair: ['number', 'number'] };
      else if (strategy === 'uuid') fallback = { typeName: 'uuid', pair: ['string', 'string'] };
      else return undefined; // rowid and unknown strategies
      break;
    }
    case 'VersionColumn':
      optionArgs = args.slice(0, 1);
      fallback = { typeName: 'integer', pair: ['number', 'number'] };
      break;
    default:
      // Create / Update / Delete date columns: the driver's timestamp type (`timestamp`, `datetime`) → Date.
      optionArgs = args.slice(0, 1);
      fallback = { typeName: 'timestamp', pair: ['date', 'date'] };
  }

  const options = new Map<string, TSESTree.Node>();
  for (const arg of optionArgs) {
    if (arg.type !== AST_NODE_TYPES.ObjectExpression) return undefined;
    const props = literalProperties(arg);
    if (!props) return undefined;
    for (const [key, value] of props) options.set(key, value);
  }
  if (options.has('transformer')) return undefined;

  // TypeORM: `if (!options.type && type) options.type = type` — the options object wins.
  const typeNode = options.get('type') ?? typeArg;
  if (typeNode?.type === AST_NODE_TYPES.ArrowFunctionExpression || typeNode?.type === AST_NODE_TYPES.FunctionExpression) {
    return undefined; // embedded entity
  }
  const resolved = typeNode ? resolveColumnType(typeNode, services) : fallback;
  if (typeNode && !resolved) return undefined;

  const nameNode = options.get('name');
  const nullable = booleanState(options.get('nullable'));
  return {
    decorator,
    typeName: resolved?.typeName,
    kind: resolved?.pair[0],
    arrayKind: resolved?.pair[1],
    array: booleanState(options.get('array')),
    nullable: decorator.name === 'DeleteDateColumn' && nullable === 'absent' ? 'true' : nullable,
    enumNode: options.get('enum'),
    databaseName: !nameNode
      ? undefined
      : nameNode.type === AST_NODE_TYPES.Literal && typeof nameNode.value === 'string'
        ? nameNode.value
        : null,
  };
}
