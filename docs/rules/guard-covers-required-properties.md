# guard-covers-required-properties

Require a type guard on unknown input to check every required property of the guarded type.

🔒 Enabled in `strict` only. 💭 Requires type information.

## Why

A guard that validates external input (`unknown`, `object`, `Record<string, unknown>`) and checks only
some fields lets malformed payloads through — the missing field is `undefined` at runtime while the
type promises a value.

## Examples

❌ Incorrect

```ts
interface Order { id: string; total: number; note?: string }
const isOrder = (x: unknown): x is Order => typeof x === 'object' && x !== null && 'id' in x; // `total` never checked
```

✅ Correct

```ts
const isOrder = (x: unknown): x is Order =>
  typeof x === 'object' && x !== null &&
  typeof (x as Order).id === 'string' && typeof (x as Order).total === 'number';
```

## What counts as checked

Any of `x.k`, `x?.k`, `x['k']`, `'k' in x`, destructuring `const { k } = x`, `Object.hasOwn(x, 'k')`,
`Reflect.has(x, 'k')`, `Object.prototype.hasOwnProperty.call(x, 'k')`, `x.hasOwnProperty('k')` — also
through a `const` alias of `x`.

## Silent when

- the value is handed to something else: passed to a function (validators, other guards, `Object.keys`),
  a method is called on it, `x instanceof C`, copied into a `let`, or destructured with a rest element;
- keys come from a list (`REQUIRED.every((k) => k in x)`, `for (const k of KEYS)`, `x[k]`), or `x` is
  compared by identity (`x === DEFAULT`);
- the guard checks a discriminant (`x.kind === Kind.Circle`) — the conventional way to prove a union member;
- the parameter is already a concrete type, the target is a union, a lib type (`Error`, `Date`), an array,
  or has more than `maxProperties` required properties.

Methods, accessors, `private` / `protected` / `#private` members and optional properties are not required.

## Options

```ts
{ maxProperties?: number } // default 30
```

## When not to use it

It is off by default because many codebases intentionally check a single field. Enable it (or use the
`strict` config) where guards validate untrusted input by hand.
