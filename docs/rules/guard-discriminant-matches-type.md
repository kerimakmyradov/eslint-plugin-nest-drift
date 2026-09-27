# guard-discriminant-matches-type

Require discriminant checks in type guards to agree with the guarded type.

💼 Enabled in `recommended` and `strict`. 💭 Requires type information.

## Why

TypeScript trusts a type predicate blindly. A guard that checks one union member's discriminant but
promises a different type compiles fine, and every caller then works with the wrong shape:

```ts
// checks the Square discriminant, but promises the *options* type — which has no `kind` at all
const isSquare = (x: unknown): x is SquareOptions => (x as { kind?: unknown })?.kind === Kind.Square;
```

## Examples

❌ Incorrect

```ts
const isSquare = (x: unknown): x is SquareOptions => (x as Shape).kind === Kind.Square; // no `kind` on SquareOptions
const isCircle = (x: unknown): x is CircleShape => (x as Shape).kind === Kind.Square;   // CircleShape has kind: Kind.Circle
```

✅ Correct

```ts
const isCircle = (x: unknown): x is CircleShape => (x as { kind?: unknown })?.kind === Kind.Circle;
const isOpen = (x: unknown): x is Row => (x as Row).status === 'open'; // 'open' === Status.Open at runtime
```

## What is checked

- Guards with an explicit `x is T` return type and a body (declarations, expressions, arrows, methods,
  `.filter((x): x is T => …)` callbacks). Inferred predicates are verified by TypeScript itself.
- Conjuncts of `&&` in every `return` of the guard of the form `x.k === V` / `V === x.k`, where `V` is a
  string / number / bigint / boolean literal or an enum member. `x` may be cast (`as`, `!`, `satisfies`),
  optional-chained, accessed as `x['k']`, or a `const` alias of the parameter.
- `missingProperty`: no member of `T` has `k`.
- `valueMismatch`: every member of `T` has `k`, and none of them accepts `V` (compared by runtime value).

Silent when `T` is `any` / `unknown` / generic / `object` / `{}` / a primitive, when `k` is only admitted by
an index signature, when the property is a branded primitive (`string & { __brand }`), when a member of
`T` lacks `k` (object types are open), and for `==`, `!==`, `undefined`, `null`.

## Options

```ts
{ ignoreProperties?: string[] } // default ['__typename', '__t', '_tag']
```

Discriminators that frameworks add at runtime without declaring them in your types (GraphQL
`__typename`, Mongoose `__t`, tagged unions `_tag`) are ignored. Add your own if needed.

## When not to use it

If your code discriminates on properties that exist at runtime but are deliberately left out of the
TypeScript types, list them in `ignoreProperties` rather than turning the rule off.
