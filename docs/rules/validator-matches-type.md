# validator-matches-type

Require class-validator type decorators to match the TypeScript type of the property.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

TypeScript does not look inside decorators. `@IsString() amount: number` compiles, but every request
with a numeric `amount` is rejected at runtime — or, worse, a string slips through into code that
does arithmetic with it.

## Examples

❌ Incorrect

```ts
class CreatePaymentDto {
  @IsString() amount: number;
  @IsNumber() fee: string;          // decimal string
  @IsInt() id: bigint;              // class-validator rejects bigint
  @IsDateString() createdAt: Date;  // validates a string, property holds a Date
  @IsInt({ each: true }) ids: string[];
}
```

✅ Correct

```ts
type Money = number & { readonly __brand: 'Money' };

class CreatePaymentDto {
  @IsNumber() amount: Money;         // branded primitives count as the primitive
  @IsString() fee: `${number}`;      // template literal types are strings
  @IsDate() createdAt: Date;
  @IsInt({ each: true }) ids: number[];
}
```

## What is checked

| Decorators | Accepted TypeScript types |
|---|---|
| `IsString`, `IsUUID`, `IsEmail`, `IsUrl`, `IsISO8601`, `IsDateString`, `IsNumberString`, `IsDecimal`, `Length`, `MinLength`, `MaxLength`, `Matches` | `string`, string literals, string enums, template literals |
| `IsNumber`, `IsInt`, `IsPositive`, `IsNegative`, `Min`, `Max` | `number`, number literals, numeric enums |
| `IsBoolean` | `boolean` |
| `IsDate`, `MinDate`, `MaxDate` | `Date` |
| `IsArray`, `ArrayMinSize`, `ArrayMaxSize`, `ArrayNotEmpty` | arrays, tuples |
| `IsObject` | objects (including `Date`) |

- `null` / `undefined` in the type are ignored here — see [`nullable-matches-type`](./nullable-matches-type.md).
- With `{ each: true }` the element type of an array, `Set` or `Map` is checked.
- An array property validated without `{ each: true }` is reported by [`each-matches-array`](./each-matches-array.md), not here.
- Properties typed `any`, `unknown` or with a type parameter are skipped.
- Only decorators imported from `class-validator` are checked (aliases and re-exports included); your own decorators are ignored.

## When not to use it

If you validate with custom decorators only, this rule has nothing to check.
