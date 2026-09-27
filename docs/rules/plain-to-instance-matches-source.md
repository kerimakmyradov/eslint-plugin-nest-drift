# plain-to-instance-matches-source

Require `plainToInstance()` DTO properties to agree with the properties of the source object.

💼 Enabled in `recommended` (`missingInSource` in `strict`). 💭 Requires type information.

## Why

Response DTOs are usually hand-written classes filled with `plainToInstance(FooDto, entity)`. The
call accepts anything, so a DTO field typed `number` happily receives the entity's `string` (a
`decimal` column), and a field renamed in the entity silently becomes `undefined`.

## Examples

❌ Incorrect

```ts
class Payment { amount: string; accountId: number; }            // entity
class PaymentDto { amount: number; accountId: string; }

plainToInstance(PaymentDto, payment);  // amount: string → number, accountId: number → string
```

```ts
// with { checkMissing: true } (strict configs)
@Exclude()
class PaymentDto {
  @Expose() id: string;
  @Expose() total: number;              // Payment has no `total`: always undefined
}

plainToInstance(PaymentDto, payment);
```

✅ Correct

```ts
class PaymentDto {
  amount: string;
  createdAt: string;                                            // Date → string is serialisation
  @Transform(({ value }) => Number(value)) accountId: number;   // converted explicitly
}

const dto = plainToInstance(PaymentDto, payment);
dto.total = computeTotal(payment);                              // filled afterwards: not reported
```

## What is compared

- Calls of `plainToInstance` / `plainToClass` imported from `class-transformer` with a
  non-generic DTO class and a source whose type is an object with declared properties
  (arrays are unwrapped: `plainToInstance(Dto, rows)`).
- **`kindMismatch`**: the primitive kinds (`string`, `number`, `boolean`, `bigint`) of the source
  property and the DTO property are disjoint. Dates, objects, arrays and uncheckable types are not
  compared; numeric enums count as `number`, string enums as `string`.
- **`missingInSource`** (option `checkMissing`): only when the DTO copies exposed properties only
  (class-level `@Exclude()` on the DTO itself, `excludeExtraneousValues: true` or
  `strategy: 'excludeAll'`), only for sources that are class instances (entities), and only for
  required DTO properties.

## Options

```js
'nest-drift/plain-to-instance-matches-source': ['error', { checkMissing: false }]
```

The `strict` configs pass `{ checkMissing: true }`. It is off in `recommended` because a common
pattern is "map the entity, then fill computed fields elsewhere" (e.g. in the controller).

## Notes

- Properties with `@Exclude()`, `@Transform()`, `@Type()` or `@Expose()` with `name`, `groups`,
  `since`, `until` or `toPlainOnly` are skipped. Property decorators of base classes count (as in
  class-transformer); a class-level `@Exclude()` on a base class does not.
- A DTO extending something other than a plain class (`extends PartialType(Base)`), a DTO from a
  compiled `.d.ts`, and calls with options that change which keys are copied (`groups`, `version`,
  `exposeDefaultValues`, …) or with `enableImplicitConversion` (for kinds) are skipped: the rule
  cannot see what gets copied.
- Properties written after the call in the same function (`dto.amount = …`, including inside a
  `forEach`, or `{ ...dto, amount }`) are skipped; a result passed to `Object.assign` skips the call.

## When not to use it

- DTOs filled by manual mappers or interceptors that convert values after `plainToInstance()` in
  another function. Convert in the DTO with `@Transform()` (recommended) or disable the rule there:

  ```js
  { files: ['src/legacy/**/*.ts'], rules: { 'nest-drift/plain-to-instance-matches-source': 'off' } }
  ```
