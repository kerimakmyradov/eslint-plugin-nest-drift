import { nullableMatchesType } from '../../src/rules/nullable-matches-type';
import { looseRuleTester, ruleTester } from '../rule-tester';

ruleTester.run('nullable-matches-type', nullableMatchesType, {
  valid: [
    // review: validators that accept null
    `import { Allow, IsEmpty, IsIn, Equals } from 'class-validator';
     class Dto {
       @Allow() a!: string | null;
       @IsEmpty() b!: string | null;
       @IsIn(['x', null]) c!: 'x' | null;
       @Equals(null) d!: null;
     }`,
    // review: non-literal / spread options cannot be judged
    `import { ApiProperty } from '@nestjs/swagger';
     const NULLABLE = { nullable: true } as const;
     const OPTS = { type: String, nullable: true };
     class Dto {
       @ApiProperty({ ...NULLABLE, type: String }) note!: string | null;
       @ApiProperty(OPTS) deletedAt!: Date | null;
     }`,
    `import { IsString, IsOptional, ValidateIf } from 'class-validator';
     import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
     class Dto {
       @IsOptional() @IsString() a?: string | null;
       @ValidateIf((o) => o.a !== null) @IsString() b!: string | null;
       @IsString() c!: string;
       @IsOptional() @IsString() d?: string; // undefined only: not our concern
       @ApiProperty({ nullable: true }) e!: string | null;
       @ApiPropertyOptional() f?: string;
       @ApiProperty() g!: number;
     }`,
    // properties without known decorators are ignored
    `class Entity { deletedAt!: Date | null; }`,
    // non-literal nullable option / any / generic
    `import { ApiProperty } from '@nestjs/swagger';
     import { IsString } from 'class-validator';
     declare const flag: boolean;
     class Dto<T> {
       @ApiProperty({ nullable: flag }) a!: string | null;
       @IsString() b!: any;
       @IsString() c!: T;
     }`,
    // custom decorator only: silent
    `import { IsMoney } from './validators';
     class Dto { @IsMoney() amount!: string | null; }`,
  ],
  invalid: [
    {
      code: `import { IsString } from 'class-validator';
             class Dto { @IsString() note!: string | null; }`,
      errors: [{ messageId: 'nullRejected', data: { property: 'note', actual: 'string | null' } }],
    },
    {
      code: `import { IsString, MaxLength } from 'class-validator';
             class Dto { @IsString() @MaxLength(10) note!: string | null; }`,
      errors: [{ messageId: 'nullRejected' }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty() deletedAt!: Date | null; }`,
      errors: [{ messageId: 'swaggerMissingNullable', data: { decorator: 'ApiProperty', property: 'deletedAt', actual: 'Date | null' } }],
    },
    {
      code: `import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty({ nullable: false }) note!: string | null; }`,
      errors: [{ messageId: 'swaggerMissingNullable' }],
    },
    {
      code: `import { ApiPropertyOptional } from '@nestjs/swagger';
             class Dto { @ApiPropertyOptional({ nullable: true }) note?: string; }`,
      errors: [{ messageId: 'swaggerNullableOnNonNull' }],
    },
    {
      code: `import { IsString } from 'class-validator';
             import { ApiProperty } from '@nestjs/swagger';
             class Dto { @ApiProperty() @IsString() note!: string | null; }`,
      errors: [{ messageId: 'swaggerMissingNullable' }, { messageId: 'nullRejected' }],
    },
  ],
});

// review: with strictNullChecks off TypeScript erases \`| null\`, so the rule cannot judge anything.
looseRuleTester.run('nullable-matches-type (strictNullChecks off)', nullableMatchesType, {
  valid: [
    `import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
     import { IsOptional, IsString, IsEnum } from 'class-validator';
     enum S { A = 'a' }
     class Dto {
       @ApiProperty({ nullable: true }) @IsOptional() @IsString() note: string | null;
       @ApiPropertyOptional({ nullable: true, enum: S }) @IsOptional() @IsEnum(S) s?: S | null;
       @ApiProperty({ type: String, nullable: true }) deletedAt: string | null;
       @IsString() plain: string | null;
     }`,
  ],
  invalid: [],
});
