import { enumMatchesType } from '../../src/rules/enum-matches-type';
import { ruleTester } from '../rule-tester';

ruleTester.run('enum-matches-type', enumMatchesType, {
  valid: [
    `import { IsEnum } from 'class-validator';
     enum Status { Open = 'open', Closed = 'closed' }
     enum Level { Low, High }
     class Dto {
       @IsEnum(Status) status!: Status;
       @IsEnum(Level) level?: Level | null;
       @IsEnum(Status, { each: true }) history!: Status[];
     }`,
    // literal union equal to the enum values
    `import { IsEnum } from 'class-validator';
     enum Status { Open = 'open', Closed = 'closed' }
     class Dto { @IsEnum(Status) status!: \`\${Status}\`; }`,
    // const object used as enum
    `import { IsEnum } from 'class-validator';
     const Side = { Buy: 'buy', Sell: 'sell' } as const;
     type Side = (typeof Side)[keyof typeof Side];
     class Dto { @IsEnum(Side) side!: Side; }`,
    // widened const object (no \`as const\`): only the property → enum direction is checked
    `import { IsEnum } from 'class-validator';
     const Side = { Buy: 'buy', Sell: 'sell' };
     class Dto { @IsEnum(Side) side!: 'buy' | 'sell'; }`,
    // IsIn with literals of the property type
    `import { IsIn } from 'class-validator';
     class Dto {
       @IsIn(['asc', 'desc']) order!: 'asc' | 'desc';
       @IsIn([1, 2, 3]) page!: number;
       @IsIn(['a', 'b'], { each: true }) modes!: string[];
     }`,
    // non-literal IsIn arguments are skipped
    `import { IsIn } from 'class-validator';
     const ORDERS = ['asc', 'desc'];
     class Dto { @IsIn(ORDERS) order!: 'asc' | 'desc'; @IsIn([...ORDERS]) o2!: 'asc'; }`,
    // any / unknown enum argument / generic
    `import { IsEnum } from 'class-validator';
     declare const E: any;
     class Dto<T> { @IsEnum(E) a!: string; @IsEnum(E) b!: T; }`,
  ],
  invalid: [
    {
      code: `import { IsEnum } from 'class-validator';
             enum Status { Open = 'open' }
             enum Currency { Usd = 'usd' }
             class Dto { @IsEnum(Status) currency!: Currency; }`,
      errors: [{ messageId: 'enumMismatch', data: { enumName: 'Status', property: 'currency', actual: 'Currency' } }],
    },
    // property wider than the enum
    {
      code: `import { IsEnum } from 'class-validator';
             enum Status { Open = 'open' }
             class Dto { @IsEnum(Status) status!: string; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    // enum wider than the property
    {
      code: `import { IsEnum } from 'class-validator';
             enum Status { Open = 'open', Closed = 'closed' }
             class Dto { @IsEnum(Status) status!: Status.Open; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    // each: element compared
    {
      code: `import { IsEnum } from 'class-validator';
             enum Status { Open = 'open' }
             enum Currency { Usd = 'usd' }
             class Dto { @IsEnum(Status, { each: true }) list!: Currency[]; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    {
      code: `import { IsIn } from 'class-validator';
             class Dto { @IsIn(['asc', 'desc', 'random']) order!: 'asc' | 'desc'; }`,
      errors: [{ messageId: 'inValueNotInType', data: { value: "'random'", property: 'order', actual: '"asc" | "desc"' } }],
    },
    {
      code: `import { IsIn } from 'class-validator';
             class Dto { @IsIn([1, '2']) page!: number; }`,
      errors: [{ messageId: 'inValueNotInType' }],
    },
  ],
});
