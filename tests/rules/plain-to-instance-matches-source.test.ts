import { plainToInstanceMatchesSource } from '../../src/rules/plain-to-instance-matches-source';
import { ruleTester } from '../rule-tester';

const ENTITY = `class PaymentEntity { id!: string; amount!: string; accountId!: number; createdAt!: Date; status!: Status; note!: string | null; }
     enum Status { Open = 'open' }`;

const kind = (dto: string, property: string, source: string, expected: string, actual: string) => ({
  messageId: 'kindMismatch' as const,
  data: { dto, property, source, expected, actual },
});
const missing = (dto: string, property: string, source: string) => ({
  messageId: 'missingInSource' as const,
  data: { dto, property, source },
});

ruleTester.run('plain-to-instance-matches-source', plainToInstanceMatchesSource, {
  valid: [
    // matching and over-wide kinds, enums, dates, objects
    `import { plainToInstance } from 'class-transformer';
     ${ENTITY}
     enum Level { Low, High }
     class LevelEntity { level!: Level; tags!: string[]; meta!: { a: number }; }
     class Dto { id!: string; amount!: number | string; createdAt!: string; status!: string; note?: string; }
     class LevelDto { level!: number; tags!: number[]; meta!: string; }
     declare const e: PaymentEntity;
     declare const l: LevelEntity;
     plainToInstance(Dto, e);
     plainToInstance(LevelDto, l);`,
    // skipped properties: Transform, Type, Exclude, renamed / grouped Expose, non-literal Expose options
    `import { Exclude, Expose, plainToInstance, Transform, Type } from 'class-transformer';
     ${ENTITY}
     declare const opts: { name: string };
     class Dto {
       @Transform(({ value }) => Number(value)) amount!: number;
       @Type(() => Number) accountId!: string;
       @Exclude() id!: number;
       @Expose({ name: 'amount' }) total!: boolean;
       @Expose({ groups: ['admin'] }) createdAt!: number;
       @Expose(opts) note!: number;
     }
     declare const e: PaymentEntity;
     plainToInstance(Dto, e);`,
    // options that change which keys are copied, non-literal options, implicit conversion
    `import { plainToInstance } from 'class-transformer';
     ${ENTITY}
     class Dto { amount!: number; }
     declare const e: PaymentEntity;
     declare const options: object;
     declare const flag: boolean;
     plainToInstance(Dto, e, { groups: ['x'] });
     plainToInstance(Dto, e, options);
     plainToInstance(Dto, e, { excludeExtraneousValues: flag });
     plainToInstance(Dto, e, { enableImplicitConversion: true });`,
    // sources and DTOs that cannot be judged
    `import { plainToInstance } from 'class-transformer';
     ${ENTITY}
     class Dto { amount!: number; }
     class Generic<T> { amount!: T; }
     declare function PartialType<T>(c: new () => T): new () => Partial<T>;
     class Partial1 extends PartialType(Dto) { extra!: number; }
     declare const a: any;
     declare const r: Record<string, string>;
     declare const u: unknown;
     declare const s: string;
     declare const e: PaymentEntity;
     plainToInstance(Dto, a);
     plainToInstance(Dto, r);
     plainToInstance(Dto, u);
     plainToInstance(Dto, s);
     plainToInstance(Generic, e);
     plainToInstance(Partial1, e);`,
    // a user function with the same name is ignored
    `${ENTITY}
     declare function plainToInstance<T>(cls: new () => T, plain: unknown): T;
     class Dto { amount!: number; }
     declare const e: PaymentEntity;
     plainToInstance(Dto, e);`,
    // results patched afterwards: assignments, forEach over mapped arrays, spreads, Object.assign
    `import { plainToInstance } from 'class-transformer';
     ${ENTITY}
     class Dto { amount!: number; accountId!: string; }
     function one(e: PaymentEntity) {
       const dto = plainToInstance(Dto, e);
       dto.amount = Number(e.amount);
       return { ...dto, accountId: String(e.accountId) };
     }
     function many(rows: PaymentEntity[]) {
       const dtos = rows.map((r) => plainToInstance(Dto, r));
       dtos.forEach((d) => { d.amount = Number(d.amount); d['accountId'] = String(d.accountId); });
       return dtos;
     }
     function assigned(e: PaymentEntity) {
       const dto = plainToInstance(Dto, e);
       return Object.assign(dto, { amount: 1, accountId: '1' });
     }`,
    // missingInSource is opt-in
    `import { Exclude, Expose, plainToInstance } from 'class-transformer';
     ${ENTITY}
     @Exclude() class Dto { @Expose() id!: string; @Expose() total!: number; }
     declare const e: PaymentEntity;
     plainToInstance(Dto, e);`,
    {
      // with checkMissing: only exposed, required fields of class-instance sources
      code: `import { Exclude, Expose, plainToInstance } from 'class-transformer';
             ${ENTITY}
             interface PaymentRow { id: string; }
             class Loose { id!: string; total!: number; }
             @Exclude() class Dto { @Expose() id!: string; @Expose() total?: number; unexposed!: string; }
             @Exclude() class Defaults { @Expose() id!: string; @Expose() page = 1; }
             @Exclude() class Base { @Expose() id!: string; }
             class Child extends Base { total!: number; }
             @Exclude() class Strict { @Expose() id!: string; @Expose() total!: number; }
             declare const e: PaymentEntity;
             declare const row: PaymentRow;
             declare const literal: { id: string };
             plainToInstance(Dto, e);
             plainToInstance(Defaults, e, { exposeUnsetFields: false });
             plainToInstance(Loose, e);
             plainToInstance(Child, e);
             plainToInstance(Strict, row);
             plainToInstance(Strict, literal);
             function computed(p: PaymentEntity) {
               const dto = plainToInstance(Strict, p);
               dto.total = 1;
               return dto;
             }`,
      options: [{ checkMissing: true }],
    },
  ],
  invalid: [
    {
      code: `import { plainToInstance } from 'class-transformer';
             ${ENTITY}
             class Dto { amount!: number; status!: number; accountId?: string; }
             declare const e: PaymentEntity;
             plainToInstance(Dto, e);`,
      errors: [
        kind('Dto', 'amount', 'PaymentEntity', 'number', 'string'),
        kind('Dto', 'status', 'PaymentEntity', 'number', 'Status'),
        kind('Dto', 'accountId', 'PaymentEntity', 'string | undefined', 'number'),
      ],
    },
    {
      // arrays, nullable sources, plainToClass, aliases and namespace imports
      code: `import * as ct from 'class-transformer';
             import { plainToClass, plainToInstance as toDto } from 'class-transformer';
             ${ENTITY}
             class Dto { amount!: number; }
             declare const rows: PaymentEntity[];
             declare const maybe: PaymentEntity | null;
             toDto(Dto, rows);
             plainToClass(Dto, maybe);
             ct.plainToInstance(Dto, rows, { excludeExtraneousValues: false });`,
      errors: [
        kind('Dto', 'amount', 'PaymentEntity', 'number', 'string'),
        kind('Dto', 'amount', 'PaymentEntity', 'number', 'string'),
        kind('Dto', 'amount', 'PaymentEntity', 'number', 'string'),
      ],
    },
    {
      // cross-file DTO; inherited property decorators; expose mode leaves unexposed fields alone
      code: `import { plainToInstance } from 'class-transformer';
             import { ExposedPaymentDto, PaymentDto } from './dtos';
             ${ENTITY}
             declare const e: PaymentEntity;
             declare const plain: { internal: number; amount: string };
             plainToInstance(PaymentDto, e);
             plainToInstance(ExposedPaymentDto, plain);`,
      errors: [
        kind('PaymentDto', 'amount', 'PaymentEntity', 'number', 'string'),
        kind('ExposedPaymentDto', 'amount', '{ internal: number; amount: string; }', 'number', 'string'),
      ],
    },
    {
      code: `import { Exclude, Expose, plainToInstance } from 'class-transformer';
             import { BaseResponseDto, ExposedPaymentDto } from './dtos';
             ${ENTITY}
             @Exclude() class Dto extends BaseResponseDto { @Expose() total!: number; @Expose() note?: string; }
             class Plain { @Expose() id!: string; @Expose() total!: number; }
             declare const e: PaymentEntity;
             plainToInstance(Dto, e);
             plainToInstance(ExposedPaymentDto, e, { exposeUnsetFields: false });
             plainToInstance(Plain, e, { excludeExtraneousValues: true });`,
      options: [{ checkMissing: true }],
      errors: [
        missing('Dto', 'total', 'PaymentEntity'),
        kind('ExposedPaymentDto', 'amount', 'PaymentEntity', 'number', 'string'),
        kind('ExposedPaymentDto', 'accountId', 'PaymentEntity', 'string', 'number'),
        missing('Plain', 'total', 'PaymentEntity'),
      ],
    },
  ],
});
