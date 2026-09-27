# enum-matches-type

Require `@IsEnum()` / `@IsIn()` to agree with the TypeScript type of the property.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

`@IsEnum(Status) currency: Currency` compiles fine and silently validates the wrong set of values.
The same happens when an enum gains a value that the property type does not allow, or when
`@IsIn([...])` lists a value the type cannot hold.

## Examples

❌ Incorrect

```ts
class Dto {
  @IsEnum(Status) currency: Currency;           // different enum
  @IsEnum(Status) status: number;               // string enum on a number property
  @IsEnum(Status) closed: Status.Closed;        // enum accepts values the property cannot hold
  @IsIn(['asc', 'desc', 'random']) order: 'asc' | 'desc';
}
```

✅ Correct

```ts
const Side = { Buy: 'buy', Sell: 'sell' } as const;
type Side = (typeof Side)[keyof typeof Side];

class Dto {
  @IsEnum(Status) status: Status;
  @IsEnum(Status) status2: `${Status}`;         // same runtime values
  @IsEnum(Side) side: Side;                     // const objects work too
  @IsEnum(STEPS) step: Step;                    // `as const` arrays of values work too
  @IsEnum(Color) color: string;                 // plain string: imprecise, but not a runtime bug
  @IsEnum(Status, { each: true }) history: Status[];
  @IsIn(['asc', 'desc']) order: 'asc' | 'desc';
}
```

## Notes

- Values are compared the way they exist at runtime: `Status.Open = 'open'` and `'open'` are equal.
- For an object or array without `as const` the values are widened, so only a kind mismatch
  (`number` property, string values) or a different enum is reported.
- A plain `string` / `number` property holding enum values of the same kind is not reported: the
  validator is stricter than the type, which is safe at runtime.
- Non-literal `@IsIn()` arguments (variables, spreads) are skipped.
- An array validated without `{ each: true }` is reported only by [`each-matches-array`](./each-matches-array.md).
- A type inferred from a default value (`readonly order = SortOrder.Asc`) is not treated as a contract:
  only annotated types are checked for "enum wider than the property".

## When not to use it

- DTOs whose property type is a literal union or another enum that intentionally differs from the
  validated values (plain `string` / `number` properties are not reported). Type the property with the
  enum (recommended) or disable the rule for those DTOs:

  ```js
  // eslint.config.mjs
  { files: ['src/**/*.query.dto.ts'], rules: { 'nest-drift/enum-matches-type': 'off' } }
  ```
