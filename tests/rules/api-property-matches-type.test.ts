import { apiPropertyMatchesType } from '../../src/rules/api-property-matches-type';
import { ruleTester } from '../rule-tester';

ruleTester.run('api-property-matches-type', apiPropertyMatchesType, {
  valid: [
    // values the checker cannot type are not judged
    `import { ApiProperty } from '@nestjs/swagger';
     declare const cfg: any;
     declare const untyped: Record<string, any>;
     const Roles = { Admin: cfg.admin, User: 'user' };
     const VALUES = Object.values(untyped);
     class Dto { @ApiProperty({ enum: Roles }) role!: string; @ApiProperty({ enum: VALUES }) value!: string; }`,
    `import { ApiProperty } from '@nestjs/swagger';
     enum Step { Day = 'day', Week = 'week', Month = 'month' }
     const STEPS = [Step.Day, Step.Week];
     class Dto { @ApiProperty({ enum: STEPS }) step!: Step.Day | Step.Week; }`,
    // enum documented on a plain string / number, and enum given as an `as const` array
    `import { ApiProperty } from '@nestjs/swagger';
     enum Status { Open = 'open' }
     enum Level { Low, High }
     enum Step { Day = 'day', Week = 'week', Month = 'month' }
     const STEPS = [Step.Day, Step.Week] as const;
     class Dto {
       @ApiProperty({ enum: Status }) status!: string;
       @ApiProperty({ enum: Level }) level!: number;
       @ApiProperty({ enum: STEPS }) step!: Step;
     }`,
    // review: raw OpenAPI array forms
    `import { ApiProperty } from '@nestjs/swagger';
     import { Type } from 'class-transformer';
     import { ValidateNested } from 'class-validator';
     class Foo { a!: string; }
     class Dto {
       @ApiProperty({ type: 'array', items: { type: 'string' } }) tags!: string[];
       @ApiProperty({ type: 'array', items: { $ref: '#/components/schemas/Foo' } }) @ValidateNested({ each: true }) @Type(() => Foo) foos!: Foo[];
       @ApiProperty({ type: Array }) list!: string[];
     }`,
    // review: file uploads documented as binary strings
    `import { ApiProperty } from '@nestjs/swagger';
     interface UploadedFile { fieldname: string; buffer: Uint8Array }
     class Dto {
       @ApiProperty({ type: 'string', format: 'binary' }) file!: UploadedFile;
       @ApiProperty({ type: 'string', format: 'binary', isArray: true }) files!: UploadedFile[];
     }`,
    // review: objects serialised to strings through toJSON
    `import { ApiProperty } from '@nestjs/swagger';
     declare class ObjectId { toJSON(): string }
     declare class Decimal { toJSON(): string }
     class Dto { @ApiProperty({ type: String }) _id!: ObjectId; @ApiProperty({ type: 'string' }) amount!: Decimal; }`,
    `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
     class Item { sku!: string; }
     enum Status { Open = 'open' }
     class Dto {
       @ApiProperty() plain!: string;
       @ApiProperty({ type: String }) name!: string;
       @ApiProperty({ type: Number }) count!: number;
       @ApiProperty({ type: 'integer' }) page!: number;
       @ApiProperty({ type: Boolean }) active!: boolean;
       @ApiProperty({ type: () => Item }) item!: Item;
       @ApiProperty({ type: Item }) item2!: Item;
       @ApiProperty({ type: [Item] }) items!: Item[];
       @ApiProperty({ type: Item, isArray: true }) items2!: Item[];
       @ApiPropertyOptional({ type: String, nullable: true }) note?: string | null;
       @ApiProperty({ enum: Status }) status!: Status;
       @ApiProperty({ enum: Status, isArray: true }) statuses!: Status[];
     }`,
    // JSON dates are strings: both directions accepted
    `import { ApiProperty } from '@nestjs/swagger';
     class Dto {
       @ApiProperty({ type: 'string', format: 'date-time' }) createdAt!: Date;
       @ApiProperty({ type: Date }) updatedAt!: string;
     }`,
    // array property with a scalar type and no isArray: darraghor's rule, not ours
    `import { ApiProperty } from '@nestjs/swagger';
     class Dto { @ApiProperty({ type: String }) tags!: string[]; }`,
    // any / generic / unknown type reference
    `import { ApiProperty } from '@nestjs/swagger';
     declare const SomeSchema: any;
     class Dto<T> {
       @ApiProperty({ type: String }) a!: any;
       @ApiProperty({ type: String }) b!: T;
       @ApiProperty({ type: SomeSchema }) c!: number;
       @ApiProperty({ type: 'uuid' }) d!: number;
     }`,
  ],
  invalid: [
    // widened values of the wrong kind are still reported
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             const Side = { Buy: 'buy', Sell: 'sell' };
             class Dto { @ApiProperty({ enum: Side }) side!: number; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             enum Step { Day = 'day' }
             enum Other { Year = 'year' }
             const STEPS = [Step.Day] as const;
             class Dto { @ApiProperty({ enum: STEPS }) step!: Other; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             enum Status { Open = 'open' }
             class Dto { @ApiProperty({ enum: Status }) status!: number; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    // review: raw OpenAPI array whose items contradict the element type
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty({ type: 'array', items: { type: 'number' } }) tags!: string[]; }`,
      errors: [{ messageId: 'typeMismatch', data: { decorator: 'ApiProperty', documented: "'number'", property: 'tags', actual: 'string[]' } }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty({ type: 'array' }) tag!: string; }`,
      errors: [{ messageId: 'isArrayOnNonCollection' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty({ type: Number }) id!: string; }`,
      errors: [{ messageId: 'typeMismatch', data: { decorator: 'ApiProperty', documented: 'Number', property: 'id', actual: 'string' } }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty({ type: 'integer' }) amount!: string; }`,
      errors: [{ messageId: 'typeMismatch' }],
    },
    {
      code: `import { ApiPropertyOptional } from '@nestjs/swagger';
             class Foo { a!: string; } class Bar { b!: number; }
             class Dto { @ApiPropertyOptional({ type: () => Foo }) bar?: Bar; }`,
      errors: [{ messageId: 'typeMismatch' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Foo { a!: string; } class Bar { b!: number; }
             class Dto { @ApiProperty({ type: [Foo] }) bars!: Bar[]; }`,
      errors: [{ messageId: 'typeMismatch' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty({ type: String, isArray: true }) tag!: string; }`,
      errors: [{ messageId: 'isArrayOnNonCollection' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             enum Status { Open = 'open' }
             enum Currency { Usd = 'usd' }
             class Dto { @ApiProperty({ enum: Status }) currency!: Currency; }`,
      errors: [{ messageId: 'enumMismatch', data: { decorator: 'ApiProperty', enumName: 'Status', property: 'currency', actual: 'Currency' } }],
    },
  ],
});
