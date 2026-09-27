import { enumMatchesType } from '../../src/rules/enum-matches-type';
import { ruleTester } from '../rule-tester';

ruleTester.run('enum-matches-type', enumMatchesType, {
  valid: [
    // widened arrays against literal-typed properties with the same runtime values
    `import { IsEnum } from 'class-validator';
     enum Step { Day = 'day', Week = 'week' }
     const VALUES = Object.values(Step);
     const STEPS = [Step.Day, Step.Week];
     class Dto { @IsEnum(VALUES) a!: \`\${Step}\`; @IsEnum(STEPS) b!: 'day' | 'week'; }`,
    // a widened (non-const) array of values: its element type is the whole enum, so no subset claim
    `import { IsEnum } from 'class-validator';
     enum Step { Day = 'day', Week = 'week', Month = 'month' }
     const STEPS = [Step.Day, Step.Week];
     const TYPED: readonly Step[] = [Step.Day];
     class Dto { @IsEnum(STEPS) a!: Step.Day | Step.Week; @IsEnum(TYPED) b!: Step.Day; }`,
    // template literal and heterogeneous values
    `import { IsEnum } from 'class-validator';
     enum Size { S = '1px', M = '2px' }
     enum Mixed { A = 1, B = 'b' }
     class Dto { @IsEnum(Size) size!: \`\${number}px\`; @IsEnum(Mixed) mixed!: string | number; }`,
    // a plain primitive of the same kind is only an imprecise type, not a runtime bug
    `import { IsEnum } from 'class-validator';
     enum Color { Red = 'red', Blue = 'blue' }
     enum Level { Low, High }
     class Dto { @IsEnum(Color) color!: string; @IsEnum(Level) level!: number; }`,
    // an \`as const\` array of values is a valid enum argument
    `import { IsEnum } from 'class-validator';
     enum Step { Day = 'day', Week = 'week', Month = 'month' }
     const STEPS = [Step.Day, Step.Week] as const;
     class Dto { @IsEnum(STEPS) step!: Step.Day | Step.Week; }`,
    // review: missing each on an array is each-matches-array's report, not ours
    `import { IsEnum, IsIn } from 'class-validator';
     enum Status { Open = 'open' }
     class Dto { @IsEnum(Status) statuses!: Status[]; @IsIn(['a', 'b']) modes!: ('a' | 'b')[]; }`,
    // review: an inferred readonly default narrows the type; that is not a declared contract
    `import { IsEnum, IsOptional } from 'class-validator';
     enum SortOrder { Asc = 'asc', Desc = 'desc' }
     class Query { @IsOptional() @IsEnum(SortOrder) readonly order = SortOrder.Asc; }`,
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
    // a primitive of another kind than the enum values
    {
      code: `import { IsEnum } from 'class-validator';
             enum Status { Open = 'open' }
             class Dto { @IsEnum(Status) status!: number; }`,
      errors: [{ messageId: 'enumMismatch' }],
    },
    // array enum argument whose values do not fit the property
    {
      code: `import { IsEnum } from 'class-validator';
             enum Step { Day = 'day', Week = 'week' }
             enum Other { Year = 'year' }
             const STEPS = [Step.Day, Step.Week] as const;
             class Dto { @IsEnum(STEPS) step!: Other; }`,
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
