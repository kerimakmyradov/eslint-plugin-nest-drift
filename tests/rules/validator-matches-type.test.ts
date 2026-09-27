import { validatorMatchesType } from '../../src/rules/validator-matches-type';
import { ruleTester } from '../rule-tester';

ruleTester.run('validator-matches-type', validatorMatchesType, {
  valid: [
    // plain matches
    `import { IsString, IsInt, IsBoolean, IsDate } from 'class-validator';
     class Dto {
       @IsString() name!: string;
       @IsInt() count!: number;
       @IsBoolean() active!: boolean;
       @IsDate() createdAt!: Date;
     }`,
    // nullish constituents are ignored here (nullable-matches-type owns them)
    `import { IsString } from 'class-validator';
     class Dto { @IsString() note?: string | null; }`,
    // string enum, string literal union, template literal
    `import { IsString } from 'class-validator';
     enum Side { Buy = 'buy', Sell = 'sell' }
     class Dto {
       @IsString() side!: Side;
       @IsString() mode!: 'a' | 'b';
       @IsString() amount!: \`\${number}\`;
     }`,
    // numeric enum
    `import { IsInt } from 'class-validator';
     enum Level { Low, High }
     class Dto { @IsInt() level!: Level; }`,
    // branded primitive
    `import { IsNumber } from 'class-validator';
     type Money = number & { readonly __brand: 'Money' };
     class Dto { @IsNumber() amount!: Money; }`,
    // aliases
    `import { IsString } from 'class-validator';
     type Id = string;
     class Dto { @IsString() id!: Id; }`,
    // each on array / Set checks the element
    `import { IsString } from 'class-validator';
     class Dto {
       @IsString({ each: true }) tags!: string[];
       @IsString({ each: true }) codes!: Set<string>;
     }`,
    // array without each is left to each-matches-array
    `import { IsString } from 'class-validator';
     class Dto { @IsString() tags!: string[]; }`,
    // array validators on arrays
    `import { IsArray, ArrayMinSize } from 'class-validator';
     class Dto { @IsArray() @ArrayMinSize(1) items!: readonly number[]; }`,
    // IsObject accepts objects and Date
    `import { IsObject } from 'class-validator';
     class Dto { @IsObject() meta!: Record<string, unknown>; @IsObject() at!: Date; }`,
    // any / unknown / generic: silent
    `import { IsString } from 'class-validator';
     class Dto<T> {
       @IsString() a!: any;
       @IsString() b!: unknown;
       @IsString() c!: T;
       @IsString() d;
     }`,
    // custom decorator with a validator-like name: silent
    `function IsString(): PropertyDecorator { return () => undefined; }
     class Dto { @IsString() amount!: number; }`,
    // project decorator from a local file: silent
    `import { IsMoney } from './validators';
     class Dto { @IsMoney() amount!: string; }`,
    // kind-agnostic decorators are not checked
    `import { IsNotEmpty, IsDefined, IsOptional } from 'class-validator';
     class Dto { @IsNotEmpty() @IsDefined() @IsOptional() amount!: number; }`,
    // PartialType mixins do not crash and own properties are checked normally
    `import { IsString } from 'class-validator';
     import { PartialType } from '@nestjs/swagger';
     class Base { @IsString() name!: string; }
     class Update extends PartialType(Base) { @IsString() reason!: string; }`,
  ],
  invalid: [
    {
      code: `import { IsString } from 'class-validator';
             class Dto { @IsString() amount!: number; }`,
      errors: [
        {
          messageId: 'mismatch',
          data: { decorator: 'IsString', expected: 'string', property: 'amount', actual: 'number' },
        },
      ],
    },
    {
      code: `import { IsNumber } from 'class-validator';
             class Dto { @IsNumber() amount!: string; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // bigint is not a number for class-validator
    {
      code: `import { IsInt } from 'class-validator';
             class Dto { @IsInt() id!: bigint; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // Decimal-like class is an object, not a string
    {
      code: `import { IsString } from 'class-validator';
             class Decimal { constructor(readonly raw: string) {} }
             class Dto { @IsString() amount!: Decimal; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // branded string checked as number
    {
      code: `import { IsNumber } from 'class-validator';
             type Money = string & { readonly __brand: 'Money' };
             class Dto { @IsNumber() amount!: Money; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // mixed union
    {
      code: `import { IsString } from 'class-validator';
             class Dto { @IsString() value!: string | number; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // Date field validated as string
    {
      code: `import { IsDateString } from 'class-validator';
             class Dto { @IsDateString() createdAt!: Date; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // each: element type is checked
    {
      code: `import { IsInt } from 'class-validator';
             class Dto { @IsInt({ each: true }) ids!: string[]; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // aliased import
    {
      code: `import { IsString as Str } from 'class-validator';
             class Dto { @Str() amount!: number; }`,
      errors: [{ messageId: 'mismatch', data: { decorator: 'IsString', expected: 'string', property: 'amount', actual: 'number' } }],
    },
    // namespace import
    {
      code: `import * as v from 'class-validator';
             class Dto { @v.IsBoolean() flag!: string; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // local re-export
    {
      code: `import { IsText } from './validators';
             class Dto { @IsText() amount!: number; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // inherited DTO: the subclass's own property is checked
    {
      code: `import { IsString } from 'class-validator';
             class Base { @IsString() name!: string; }
             class Child extends Base { @IsString() age!: number; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    // two decorators, one wrong
    {
      code: `import { IsInt, Min, IsString } from 'class-validator';
             class Dto { @IsInt() @Min(0) @IsString() amount!: number; }`,
      errors: [{ messageId: 'mismatch', data: { decorator: 'IsString', expected: 'string', property: 'amount', actual: 'number' } }],
    },
  ],
});
