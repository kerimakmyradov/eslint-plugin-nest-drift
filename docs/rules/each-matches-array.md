# each-matches-array

Require `{ each: true }` exactly when a validated property is an array, `Set` or `Map`.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

Without `{ each: true }`, `@IsString()` on `tags: string[]` checks the array itself and rejects every
request. With `{ each: true }` on a plain `string`, the option does nothing and usually means the
type was changed from an array and the decorator was forgotten.

## Examples

❌ Incorrect

```ts
class FilterDto {
  @IsString() tags: string[];
  @IsEnum(Status) statuses: Status[];
  @IsObject() meta: Record<string, string>[];
  @IsString({ each: true }) tag: string;
}
```

✅ Correct

```ts
class FilterDto {
  @IsString({ each: true }) tags: string[];
  @IsEnum(Status, { each: true }) statuses: Status[];
  @IsString({ each: true }) codes: Set<string>;
  @IsArray() @ArrayMinSize(1) items: Item[];   // array-level validators need no `each`
  @IsString({ each: true }) value: string | string[]; // mixed unions are fine
}
```

## Notes

- `@ValidateNested()` already iterates arrays and is not checked. Use
  [`@darraghor/eslint-plugin-nestjs-typed`](https://github.com/darraghoriordan/eslint-plugin-nestjs-typed)
  for its style rules.
- A union such as `string | string[]` never triggers the "missing `each`" report.
