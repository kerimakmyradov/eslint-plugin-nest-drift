# column-matches-type

Require TypeORM column types to agree with the TypeScript type of the property.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

The column type decides what the database driver returns; the TypeScript type of the property is
only a promise. `@Column({ type: 'decimal' }) amount: number` compiles, but PostgreSQL and MySQL
return `numeric` as a **string**, so `amount + fee` concatenates. The same happens with `date`
columns (read as `'2026-09-27'`, not `Date`), enum columns that store a different enum, and
`nullable: true` columns typed without `| null`.

## Examples

❌ Incorrect

```ts
@Entity()
class Payment {
  @Column('decimal', { precision: 12, scale: 2 }) amount: number;     // read as string
  @Column('date') dueOn: Date;                                         // read as 'YYYY-MM-DD'
  @PrimaryGeneratedColumn('uuid') id: number;                          // uuid is a string
  @Column('int', { array: true }) scores: number;                      // an array column
  @Column({ type: 'enum', enum: Status }) currency: Currency;          // different enum
  @Column('text', { nullable: true }) note: string;                    // can be null
}
```

✅ Correct

```ts
@Entity()
class Payment {
  @Column('decimal', { precision: 12, scale: 2 }) amount: string;
  @Column('decimal', { transformer: new DecimalTransformer() }) total: number; // transformers are trusted
  @Column('date') dueOn: string;
  @Column('timestamptz') createdAt: Date;
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @Column('decimal', { array: true }) prices: number[];                // array elements are parsed
  @Column({ type: 'enum', enum: Status }) status: Status;
  @Column('text', { nullable: true }) note: string | null;
}
```

## What is read as what

| Column types | Scalar | With `array: true` (PostgreSQL) |
|---|---|---|
| `int`, `integer`, `smallint`, `float`, `double precision`, `real`, … | `number` | `number` |
| `decimal`, `numeric` | `string` (option `decimal`) | `number` |
| `bigint`, `int8` | not checked (option `bigint`) | same |
| `varchar`, `text`, `uuid`, `time`, `money`, … | `string` | `string` |
| `date` | `string` | `Date` |
| `timestamp`, `timestamptz`, `datetime` | `Date` (option `timestamp`) | `Date` |
| `bool`, `boolean` | `boolean` | `boolean` |
| `enum`, `simple-enum` | compared with the enum values | same, per element |
| `json`, `jsonb`, `bytea`, `simple-array`, spatial and others | not checked | not checked |

Columns without an explicit type are not checked (TypeORM derives it from the TypeScript type).
`@PrimaryGeneratedColumn()` is an integer, `('uuid')` a string; `@CreateDateColumn()` /
`@UpdateDateColumn()` / `@DeleteDateColumn()` are `Date`s and `@VersionColumn()` a number unless
`type` is set. `@DeleteDateColumn()` is nullable by default.

## Options

```js
'nest-drift/column-matches-type': ['error', {
  decimal: 'string',            // 'number' if you parse numerics (pg type parser 1700, mysql2 `decimalNumbers`)
  bigint: 'off',                // 'string' (pg default) or 'number' (custom type parser 20)
  timestamp: 'date',            // 'string' for mysql2 `dateStrings: true`; only explicit timestamp / timestamptz columns
  reportNullOnNotNull: false,   // also report `| null` on NOT NULL columns
}]
```

`bigint` is off by default because the linter cannot see `pg.types.setTypeParser(20, …)`.
`reportNullOnNotNull` is off by default: an over-wide type is not a runtime bug.

## Notes

- Nullability is only compared with `strictNullChecks` (without it TypeScript erases `| null`).
- A `transformer` option, embedded columns (`@Column(() => Address)`), options that are not an
  object literal (shared objects, spreads) and non-literal types are skipped.
- Columns TypeORM retypes to a relation's referenced column are skipped: names used by
  `@JoinColumn({ name })`, and columns starting with the name of a `@ManyToOne` / `@OneToOne`
  relation that has no literal join column name (`account` → `accountId`).
- An over-wide type (`amount: number | string`) is accepted: it is a read/write model, not a lie.

## When not to use it

- Custom type parsers that are not covered by the options (per column, or for types other than
  `numeric` / `int8`). Configure `decimal` / `bigint` / `timestamp` first; otherwise disable the rule
  for the entities that rely on them:

  ```js
  { files: ['src/**/*.entity.ts'], rules: { 'nest-drift/column-matches-type': 'off' } }
  ```
