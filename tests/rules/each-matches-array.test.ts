import { eachMatchesArray } from '../../src/rules/each-matches-array';
import { ruleTester } from '../rule-tester';

ruleTester.run('each-matches-array', eachMatchesArray, {
  valid: [
    // review: shared options objects
    `import { IsString } from 'class-validator';
     const EACH = { each: true };
     class Dto { @IsString(EACH) tags!: string[]; }`,
    // review: IsObject accepts Map / Set instances
    `import { IsObject } from 'class-validator';
     class Dto { @IsObject() config!: Map<string, string>; @IsObject() ids!: Set<string>; }`,
    // review: a domain class named Map is not a collection
    `import { IsObject } from 'class-validator';
     class Map { id!: string; }
     class Dto { @IsObject() map!: Map; }`,
    // review: branded arrays are arrays
    `import { IsString } from 'class-validator';
     class Dto { @IsString({ each: true }) tags!: string[] & { readonly __brand: 'Tags' }; }`,
    `import { IsString, IsInt } from 'class-validator';
     class Dto {
       @IsString({ each: true }) tags!: string[];
       @IsInt({ each: true }) ids?: readonly number[] | null;
       @IsString({ each: true }) codes!: Set<string>;
       @IsString({ each: true }) names!: Map<string, string>;
       @IsString({ each: true }) pair!: [string, string];
     }`,
    `import { IsString, IsEnum } from 'class-validator';
     enum S { A = 'a' }
     class Dto { @IsString() name!: string; @IsEnum(S) s!: S; }`,
    // array-level and nested validators do not need each
    `import { IsArray, ArrayMinSize, ValidateNested, IsOptional } from 'class-validator';
     class Item {}
     class Dto { @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested() items!: Item[]; }`,
    // mixed unions are ambiguous: silent
    `import { IsString } from 'class-validator';
     class Dto { @IsString() v!: string | string[]; @IsString({ each: true }) w!: string | string[]; }`,
    // any / generic: silent
    `import { IsString } from 'class-validator';
     class Dto<T> { @IsString({ each: true }) a!: any; @IsString({ each: true }) b!: T; }`,
    // custom decorator: silent
    `import { IsMoney } from './validators';
     class Dto { @IsMoney() amounts!: string[]; }`,
  ],
  invalid: [
    {
      code: `import { IsString } from 'class-validator';
             class Dto { @IsString({ each: true }) tag!: string; }`,
      errors: [{ messageId: 'eachOnNonCollection', data: { decorator: 'IsString', property: 'tag', actual: 'string' } }],
    },
    {
      code: `import { IsString } from 'class-validator';
             class Dto { @IsString() tags!: string[]; }`,
      errors: [{ messageId: 'collectionWithoutEach', data: { decorator: 'IsString', property: 'tags', actual: 'string[]' } }],
    },
    {
      code: `import { IsEnum } from 'class-validator';
             enum S { A = 'a' }
             class Dto { @IsEnum(S) statuses!: S[]; }`,
      errors: [{ messageId: 'collectionWithoutEach' }],
    },
    {
      code: `import { IsIn } from 'class-validator';
             class Dto { @IsIn(['a', 'b']) modes?: Set<string>; }`,
      errors: [{ messageId: 'collectionWithoutEach' }],
    },
    {
      code: `import { IsInt, Min } from 'class-validator';
             class Dto { @IsInt() @Min(0) ids!: number[] | null; }`,
      errors: [{ messageId: 'collectionWithoutEach' }, { messageId: 'collectionWithoutEach' }],
    },
    // IsObject rejects arrays at runtime
    {
      code: `import { IsObject } from 'class-validator';
             class Dto { @IsObject() meta!: Record<string, string>[]; }`,
      errors: [{ messageId: 'collectionWithoutEach' }],
    },
  ],
});
