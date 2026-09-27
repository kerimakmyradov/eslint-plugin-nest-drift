import { apiPropertyMatchesType } from '../../src/rules/api-property-matches-type';
import { ruleTester } from '../rule-tester';

ruleTester.run('api-property-matches-type', apiPropertyMatchesType, {
  valid: [
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
