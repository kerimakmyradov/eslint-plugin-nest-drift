import { columnMatchesType } from '../../src/rules/column-matches-type';
import { ruleTester } from '../rule-tester';

const kind = (column: string, expected: string, property: string, actual: string) => ({
  messageId: 'columnKindMismatch' as const,
  data: { column, expected, property, actual },
});

ruleTester.run('column-matches-type', columnMatchesType, {
  valid: [
    // every scalar row on its runtime kind
    `import { Column } from 'typeorm';
     class E {
       @Column('int') a!: number;
       @Column('double precision') b!: number;
       @Column('decimal') c!: string;
       @Column('money') d!: string;
       @Column('varchar') e!: string;
       @Column('uuid') f!: string;
       @Column('time') g!: string;
       @Column('citext') h!: string;
       @Column('date') i!: string;
       @Column('timestamptz') j!: Date;
       @Column('datetime') k!: Date;
       @Column('boolean') l!: boolean;
       @Column({ type: 'INTEGER' }) m!: number;
       @Column({ type: Number }) n!: number;
       @Column({ type: String, length: 20 }) o!: string;
     }`,
    // an over-wide read/write type and branded primitives
    `import { Column } from 'typeorm';
     type Cents = number & { __brand: 'Cents' };
     class E { @Column('decimal') a!: number | string; @Column('int') b!: Cents; @Column('int') c!: 1 | 2; }`,
    // arrays (PostgreSQL): decimal and date elements are parsed
    `import { Column } from 'typeorm';
     class E {
       @Column('decimal', { array: true }) a!: number[];
       @Column('date', { array: true }) b!: Date[];
       @Column('int', { array: true, nullable: true }) c!: number[] | null;
       @Column('citext', { array: true }) d!: string;
     }`,
    // default and generated columns
    `import { Column, CreateDateColumn, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
     class E {
       @PrimaryGeneratedColumn() id!: number;
       @PrimaryGeneratedColumn('uuid') uid!: string;
       @PrimaryGeneratedColumn({ type: 'bigint' }) big!: string;
       @PrimaryGeneratedColumn('increment', { type: 'bigint' }) big2!: string;
       @PrimaryGeneratedColumn('rowid') row!: string;
       @PrimaryColumn(String) code!: string;
       @CreateDateColumn() createdAt!: Date;
       @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
       @VersionColumn() version!: number;
       @Column() inferred!: number;
     }`,
    // bigint is not checked by default: pg returns strings unless a type parser is installed
    `import { Column } from 'typeorm';
     class E { @Column('bigint') a!: number; @Column('int8') b!: string; }`,
    // transformer, embedded, unknown / opaque types, non-literal types and options
    `import { Column } from 'typeorm';
     class Address { city!: string; }
     const DECIMAL = 'decimal';
     const common = { nullable: true };
     const toNumber = { to: (v: number) => v, from: (v: string) => Number(v) };
     class E {
       @Column('decimal', { transformer: toNumber }) a!: number;
       @Column(() => Address) address!: Address;
       @Column('bytea') b!: Buffer;
       @Column('jsonb') c!: { x: number };
       @Column('simple-array') d!: string[];
       @Column(DECIMAL) e!: number;
       @Column('decimal', common) f!: number;
       @Column({ ...common, type: 'decimal' }) g!: number;
       @Column('int', { array: flag() }) h!: string;
     }
     declare function flag(): boolean;
     declare class Buffer {}`,
    // any / unknown / generic
    `import { Column } from 'typeorm';
     class E<T> { @Column('int') a!: any; @Column('int') b!: unknown; @Column('int') c!: T; }`,
    // columns retyped by a relation: join column names and default relation-prefixed names
    `import { Column, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
     class Account { id!: string; }
     class E {
       @ManyToOne(() => Account) @JoinColumn({ name: 'account_id' }) account!: Account;
       @Column({ name: 'account_id', type: 'int' }) accountId!: string;
       @ManyToOne(() => Account) owner!: Account;
       @Column('int') ownerId!: string;
       @OneToOne(() => Account) @JoinColumn([{ name: 'parent_id' }]) parent!: Account;
       @Column('int') parent_id!: string;
     }`,
    // user decorators with TypeORM names are ignored
    `function Column(_type?: string): PropertyDecorator { return () => undefined; }
     class E { @Column('decimal') a!: number; }`,
    // option: decimal parsed as number, timestamps read as strings (mysql2 dateStrings)
    {
      code: `import { Column, CreateDateColumn } from 'typeorm';
             class E { @Column('numeric') a!: number; @Column('timestamp') b!: string; @CreateDateColumn() c!: Date; }`,
      options: [{ decimal: 'number', timestamp: 'string' }],
    },
  ],
  invalid: [
    {
      code: `import { Column } from 'typeorm';
             class E { @Column('decimal', { precision: 12, scale: 2 }) amount!: number; }`,
      errors: [kind('decimal', 'strings', 'amount', 'number')],
    },
    {
      code: `import { Column } from 'typeorm';
             class E { @Column({ type: 'numeric', nullable: true }) amount!: number | null; }`,
      errors: [kind('numeric', 'strings', 'amount', 'number | null')],
    },
    {
      code: `import { Column, PrimaryGeneratedColumn } from 'typeorm';
             class E { @PrimaryGeneratedColumn('uuid') id!: number; @Column('int') count!: string; }`,
      errors: [kind('uuid', 'strings', 'id', 'number'), kind('int', 'numbers', 'count', 'string')],
    },
    {
      code: `import { Column } from 'typeorm';
             class E { @Column('date') day!: Date; @Column('timestamp') at!: string; @Column('bool') on!: number; }`,
      errors: [
        kind('date', 'strings', 'day', 'Date'),
        kind('timestamp', '`Date` objects', 'at', 'string'),
        kind('bool', 'booleans', 'on', 'number'),
      ],
    },
    {
      // the options object's `type` wins over the first argument
      code: `import { Column } from 'typeorm';
             class E { @Column({ type: Number }) a!: string; @Column('varchar', { type: 'int' }) b!: string; }`,
      errors: [kind('Number', 'numbers', 'a', 'string'), kind('int', 'numbers', 'b', 'string')],
    },
    {
      code: `import { Column } from 'typeorm';
             class E { @Column('int', { array: true }) a!: number; @Column('int', { array: true }) b!: string[]; }`,
      errors: [kind('int[]', 'arrays', 'a', 'number'), kind('int[]', 'arrays of numbers', 'b', 'string[]')],
    },
    {
      code: `import { CreateDateColumn, DeleteDateColumn, VersionColumn } from 'typeorm';
             class E { @CreateDateColumn() a!: string; @VersionColumn() v!: string; @DeleteDateColumn() d!: string | null; }`,
      errors: [
        kind('timestamp', '`Date` objects', 'a', 'string'),
        kind('integer', 'numbers', 'v', 'string'),
        kind('timestamp', '`Date` objects', 'd', 'string | null'),
      ],
    },
    {
      // a relation elsewhere in the class does not silence unrelated columns
      code: `import { Column, ManyToOne } from 'typeorm';
             class Account { id!: string; }
             class E { @ManyToOne(() => Account) account!: Account; @Column('decimal') balance!: number; }`,
      errors: [kind('decimal', 'strings', 'balance', 'number')],
    },
    {
      code: `import { Column } from 'typeorm';
             class E { @Column('decimal') a!: string; @Column('bigint') b!: number; @Column('timestamptz') c!: Date; }`,
      options: [{ decimal: 'number', bigint: 'string', timestamp: 'string' }],
      errors: [
        kind('decimal', 'numbers', 'a', 'string'),
        kind('bigint', 'strings', 'b', 'number'),
        kind('timestamptz', 'strings', 'c', 'Date'),
      ],
    },
    {
      code: `import * as orm from 'typeorm';
             import { Column as Col } from 'typeorm';
             class E { @orm.Column('int') a!: string; @Col('int') b!: string; }`,
      errors: [kind('int', 'numbers', 'a', 'string'), kind('int', 'numbers', 'b', 'string')],
    },
  ],
});
