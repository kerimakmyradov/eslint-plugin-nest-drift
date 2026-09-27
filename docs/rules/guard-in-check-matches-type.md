# guard-in-check-matches-type

Require `'key' in x` checks in type guards to agree with the guarded type.

💼 Enabled in `recommended` and `strict`. 💭 Requires type information.

## Why

`'k' in x` is the usual way to tell union members apart. It silently goes wrong when the guard
promises a type that does not have `k`, excludes a property the type always has, or checks a
property every member has — then the guard is always true and narrows nothing.

## Examples

❌ Incorrect

```ts
const isDraft = (d: Draft | Archived): d is Draft => 'archivedAt' in d;         // Draft has no archivedAt
const isV2 = (c: ConfigV1 | ConfigV2): c is ConfigV2 => !('schemaVersion' in c); // V2 always has it
const isArchived = (d: Draft | Archived): d is Archived => 'title' in d;         // both have title
```

✅ Correct

```ts
const isArchived = (d: Draft | Archived): d is Archived => 'archivedAt' in d;
const isV1 = (c: ConfigV1 | ConfigV2): c is ConfigV1 => !('schemaVersion' in c);
const isA = (x: A | B): x is A => 'flag' in x && x.kind === 'a';
```

## Notes

- Optional properties count as declared; inherited members like `toString` are found; numeric keys
  (`'0' in arr`) are matched against numeric index signatures.
- `notDiscriminating` is reported only for single-expression guards made solely of `'k' in x` checks,
  when every member of the parameter's union requires every checked key and the guard excludes at
  least one member.
- Class fields that may be absent at runtime are treated as optional: `declare` fields, and fields
  without an initializer when `useDefineForClassFields` is off (the default below ES2022).
- Same `ignoreProperties` option as [`guard-discriminant-matches-type`](./guard-discriminant-matches-type.md).

## When not to use it

If your unions rely on properties added at runtime but absent from the types, list them in
`ignoreProperties`.
