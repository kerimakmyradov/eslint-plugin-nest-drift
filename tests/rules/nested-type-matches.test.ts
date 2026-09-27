import { nestedTypeMatches } from '../../src/rules/nested-type-matches';
import { ruleTester } from '../rule-tester';

ruleTester.run('nested-type-matches', nestedTypeMatches, {
  valid: [
    `import { Type } from 'class-transformer';
     class Address { city!: string; }
     class Item { sku!: string; }
     class Dto {
       @Type(() => Address) address!: Address;
       @Type(() => Address) billing?: Address | null;
       @Type(() => Item) items!: Item[];
       @Type(() => Item) bySku!: Map<string, Item>;
     }`,
    // subclass instance fits a base-class / interface property
    `import { Type } from 'class-transformer';
     interface HasCity { city: string }
     class Address { city!: string; }
     class Base { id!: string; }
     class Derived extends Base { extra!: number; }
     class Dto { @Type(() => Address) a!: HasCity; @Type(() => Derived) b!: Base; }`,
    // built-in constructors used for query-param conversion
    `import { Type } from 'class-transformer';
     class Query {
       @Type(() => Number) page!: number;
       @Type(() => Boolean) active?: boolean;
       @Type(() => Date) from!: Date;
       @Type(() => String) q!: string;
       @Type(() => Number) ids!: number[];
     }`,
    // discriminator options are out of scope
    `import { Type } from 'class-transformer';
     class A { kind!: 'a'; } class B { kind!: 'b'; }
     class Dto { @Type(() => A, { discriminator: { property: 'kind', subTypes: [] } }) v!: A | B; }`,
    // generic class / any / unresolvable thunk: silent
    `import { Type } from 'class-transformer';
     class Box<T> { value!: T; }
     declare function pick(): any;
     class Dto<T> {
       @Type(() => Box) a!: Box<string>;
       @Type(() => pick()) b!: string;
       @Type(() => Box) c!: any;
       @Type(() => Box) d!: T;
     }`,
  ],
  invalid: [
    {
      code: `import { Type } from 'class-transformer';
             class Foo { a!: string; }
             class Bar { b!: number; }
             class Dto { @Type(() => Foo) bar!: Bar; }`,
      errors: [{ messageId: 'mismatch', data: { target: 'Foo', property: 'bar', actual: 'Bar' } }],
    },
    {
      code: `import { Type } from 'class-transformer';
             class Foo { a!: string; }
             class Bar { b!: number; }
             class Dto { @Type(() => Foo) bars!: Bar[]; }`,
      errors: [{ messageId: 'mismatch' }],
    },
    {
      code: `import { Type } from 'class-transformer';
             class Query { @Type(() => Number) page!: string; }`,
      errors: [{ messageId: 'mismatch', data: { target: 'Number', property: 'page', actual: 'string' } }],
    },
    {
      code: `import { Type } from 'class-transformer';
             class Query { @Type(() => Date) from!: string; }`,
      errors: [{ messageId: 'mismatch' }],
    },
  ],
});
