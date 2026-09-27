import { guardDiscriminantMatchesType } from '../../src/rules/guard-discriminant-matches-type';
import { looseRuleTester, ruleTester } from '../rule-tester';

const SHAPES = `
enum Kind { Circle = 'circle', Square = 'square' }
interface CircleShape { kind: Kind.Circle; radius: number }
interface SquareShape { kind: Kind.Square; side: number }
interface SquareOptions { side: number; rounded: boolean }
`;

ruleTester.run('guard-discriminant-matches-type', guardDiscriminantMatchesType, {
  valid: [
    // cast + optional chaining + enum discriminant
    `${SHAPES}
     const isCircle = (x: unknown): x is CircleShape => (x as { kind?: unknown })?.kind === Kind.Circle;`,
    // raw string compared with an enum-typed property (same runtime value)
    `enum Status { Open = 'open', Closed = 'closed' }
     interface Row { status: Status }
     const isOpen = (x: unknown): x is Row => (x as Row).status === 'open';`,
    // cross-enum with equal runtime values
    `enum A { Open = 'open' } enum B { Open = 'open' }
     interface Row { status: A }
     const isOpen = (x: unknown): x is Row => (x as Row).status === B.Open;`,
    // template-literal property type
    `enum Kind { Circle = 'circle' }
     interface Wire { kind: \`\${Kind}\` }
     const isWire = (x: unknown): x is Wire => (x as Wire).kind === Kind.Circle;`,
    // union target, discriminant of one member
    `${SHAPES}
     const isShape = (x: unknown): x is CircleShape | SquareShape => (x as CircleShape).kind === Kind.Square;`,
    // absence checks, loose equality and inequality are ignored
    `${SHAPES}
     const a = (x: unknown): x is SquareOptions => (x as { kind?: unknown }).kind === undefined;
     const b = (x: unknown): x is SquareOptions => (x as { kind?: unknown }).kind == 'circle';
     const c = (x: unknown): x is SquareOptions => (x as { kind?: unknown }).kind !== 'circle';`,
    // shapeless targets and primitives
    `const a = (x: unknown): x is object => (x as { kind?: unknown }).kind === 'a';
     const b = (x: unknown): x is {} => (x as { kind?: unknown }).kind === 'a';
     const c = (v: unknown): v is string => typeof v === 'string';
     const d = (x: unknown): x is Record<string, unknown> => (x as { kind?: unknown }).kind === 'a';`,
    // a member without the property: open type, cannot judge
    `interface Foo { kind: 'foo' } interface Legacy { id: string }
     const isBar = (x: unknown): x is Foo | Legacy => (x as Foo).kind === 'bar' as const;`,
    // framework discriminators are ignored by default
    `interface User { id: string }
     const a = (x: unknown): x is User => (x as { __typename?: string }).__typename === 'User';
     const b = (x: unknown): x is User => (x as { _tag?: string })._tag === 'User';`,
    // generic target, opaque || and non-literal values
    `const g = <T>(x: unknown): x is T => (x as { kind?: unknown }).kind === 'a';
     interface Foo { kind: 'foo' }
     declare const k: string;
     const a = (x: unknown): x is Foo => (x as Foo).kind === 'foo' || (x as Foo).kind === 'bar' as const;
     const b = (x: unknown): x is Foo => (x as Foo).kind === k;`,
    // bodiless declarations are skipped
    `${SHAPES}
     declare function isSquare(x: unknown): x is SquareOptions;
     function isSquare2(x: unknown): x is SquareOptions;
     function isSquare2(x: unknown) { return true; }
     abstract class Base { abstract is(x: unknown): x is SquareOptions; }`,
    // inferred predicates (no annotation) are TypeScript's job
    `${SHAPES}
     declare const list: (CircleShape | SquareShape)[];
     const circles = list.filter((s) => s.kind === Kind.Circle);`,
  ],
  invalid: [
    // the wrong-target guard: promises the options type, which has no discriminant
    {
      code: `${SHAPES}
const isSquare = (x: unknown): x is SquareOptions => (x as { kind?: unknown })?.kind === Kind.Square;`,
      errors: [{ messageId: 'missingProperty', data: { key: 'kind', target: 'SquareOptions' } }],
    },
    // value of another member
    {
      code: `${SHAPES}
const isCircle = (x: unknown): x is CircleShape => (x as CircleShape).kind === Kind.Square;`,
      errors: [{ messageId: 'valueMismatch', data: { key: 'kind', target: 'CircleShape', value: 'Kind.Square', actual: 'Kind.Circle' } }],
    },
    // .filter callback, method and function declaration with early return
    {
      code: `${SHAPES}
declare const list: unknown[];
const squares = list.filter((x): x is SquareOptions => (x as SquareShape).kind === Kind.Square);
class Checks { isSquare(x: unknown): x is SquareOptions { return (x as SquareShape)['kind'] === Kind.Square; } }
function check(x: unknown): x is CircleShape {
  if (x === null) return false;
  return typeof x === 'object' && (x as CircleShape).kind === 'square';
}`,
      errors: [{ messageId: 'missingProperty' }, { messageId: 'missingProperty' }, { messageId: 'valueMismatch' }],
    },
    // const alias of the parameter
    {
      code: `${SHAPES}
function isSquare(x: unknown): x is SquareOptions {
  const o = x as Record<string, unknown>;
  return o.kind === Kind.Square;
}`,
      errors: [{ messageId: 'missingProperty' }],
    },
    // ignoreProperties can be emptied
    {
      code: `interface User { id: string }
const a = (x: unknown): x is User => (x as { __typename?: string }).__typename === 'User';`,
      options: [{ ignoreProperties: [] }],
      errors: [{ messageId: 'missingProperty' }],
    },
  ],
});

looseRuleTester.run('guard-discriminant-matches-type (strictNullChecks off)', guardDiscriminantMatchesType, {
  valid: [
    `${SHAPES}
     const isCircle = (x: unknown): x is CircleShape => (x as { kind?: unknown })?.kind === Kind.Circle;`,
  ],
  invalid: [
    {
      code: `${SHAPES}
const isSquare = (x: unknown): x is SquareOptions => (x as { kind?: unknown })?.kind === Kind.Square;`,
      errors: [{ messageId: 'missingProperty' }],
    },
  ],
});
