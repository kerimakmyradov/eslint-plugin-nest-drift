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
  @IsEnum(Status) status: string;               // property accepts values the enum rejects
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
  @IsEnum(Status, { each: true }) history: Status[];
  @IsIn(['asc', 'desc']) order: 'asc' | 'desc';
}
```

## Notes

- Values are compared the way they exist at runtime: `Status.Open = 'open'` and `'open'` are equal.
- For an object without `as const` only the "property wider than enum" direction is checked.
- Non-literal `@IsIn()` arguments (variables, spreads) are skipped.
- An array validated without `{ each: true }` is reported only by [`each-matches-array`](./each-matches-array.md).
- A type inferred from a default value (`readonly order = SortOrder.Asc`) is not treated as a contract:
  only annotated types are checked for "enum wider than the property".
