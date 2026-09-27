import { guardCoversRequiredProperties } from '../../src/rules/guard-covers-required-properties';
import { looseRuleTester, ruleTester } from '../rule-tester';

const ORDER = `interface Order { id: string; total: number; note?: string }`;

ruleTester.run('guard-covers-required-properties', guardCoversRequiredProperties, {
  valid: [
    // every required property is checked; optional ones may be skipped
    `${ORDER}
     const isOrder = (x: unknown): x is Order =>
       typeof x === 'object' && x !== null && !Array.isArray(x) &&
       typeof (x as Order).id === 'string' && typeof (x as Order).total === 'number';`,
    // in-checks, has-own forms, destructuring and aliases all count
    `${ORDER}
     function a(x: unknown): x is Order { return typeof x === 'object' && x !== null && 'id' in x && Object.hasOwn(x, 'total'); }
     function b(x: object): x is Order { return Reflect.has(x, 'id') && Object.prototype.hasOwnProperty.call(x, 'total'); }
     function c(x: Record<string, unknown>): x is Order { const { id, total } = x; return typeof id === 'string' && typeof total === 'number'; }
     function d(x: unknown): x is Order { const o = x as Record<string, unknown>; return typeof o.id === 'string' && typeof o['total'] === 'number'; }
     function e(x: {}): x is Order { return x.hasOwnProperty('id') && x.hasOwnProperty('total'); }`,
    // delegation: validators, other guards, method calls, instanceof, rest, let-copies
    `${ORDER}
     declare function validate(v: unknown): boolean;
     declare const schema: { safeParse(v: unknown): { success: boolean } };
     class OrderClass { id = ''; total = 0; }
     const a = (x: unknown): x is Order => validate(x);
     const b = (x: unknown): x is Order => schema.safeParse(x).success;
     const c = (x: unknown): x is Order => x instanceof OrderClass;
     const d = (x: unknown): x is Order => Object.keys(x as object).length === 2;
     function e(x: Record<string, unknown>): x is Order { const { id, ...rest } = x; return typeof id === 'string' && validate(rest); }
     function f(x: unknown): x is Order { let o = x; return validate(o); }
     const g = (x: { toJSON(): unknown }): x is Order & { toJSON(): unknown } => x.toJSON() !== null;`,
    // only loose parameters, single-member shaped targets
    `${ORDER}
     interface Shipment { id: string; amount: number }
     const a = (x: Order | Shipment): x is Order => 'total' in x;
     const b = (x: unknown): x is Order | Shipment => typeof x === 'object';
     const c = (x: unknown): x is object => typeof x === 'object';`,
    // methods, accessors and private members are not data properties
    `class Money { amount = 0; private cents = 0; get label() { return ''; } format() { return ''; } }
     const isMoney = (x: unknown): x is Money => typeof (x as Money).amount === 'number';`,
    // lib types and arrays are out of scope
    `const a = (x: unknown): x is Error => x !== null && typeof x === 'object' && 'message' in x;
     const b = (x: unknown): x is string[] => Array.isArray(x);`,
    // discriminant guards establish a union member by convention
    `enum Kind { Circle = 'circle' }
     interface CircleShape { kind: Kind.Circle; radius: number; label: string }
     const isCircle = (x: unknown): x is CircleShape => (x as { kind?: unknown })?.kind === Kind.Circle;`,
    // maxProperties
    {
      code: `${ORDER}
             const isOrder = (x: unknown): x is Order => typeof x === 'object';`,
      options: [{ maxProperties: 1 }],
    },
  ],
  invalid: [
    {
      code: `${ORDER}
const isOrder = (x: unknown): x is Order => typeof x === 'object' && x !== null && 'id' in x;`,
      errors: [{ messageId: 'uncheckedProperties', data: { target: 'Order', properties: '`total`' } }],
    },
    // one report listing every unchecked property
    {
      code: `${ORDER}
function isOrder(x: unknown): x is Order { return typeof x === 'object' && x !== null; }`,
      errors: [{ messageId: 'uncheckedProperties', data: { target: 'Order', properties: '`id`, `total`' } }],
    },
  ],
});

looseRuleTester.run('guard-covers-required-properties (strictNullChecks off)', guardCoversRequiredProperties, {
  valid: [
    `${ORDER}
     const isOrder = (x: unknown): x is Order => 'id' in (x as object) && 'total' in (x as object);`,
  ],
  invalid: [
    {
      code: `${ORDER}
const isOrder = (x: unknown): x is Order => typeof x === 'object' && 'id' in (x as object);`,
      errors: [{ messageId: 'uncheckedProperties' }],
    },
  ],
});
