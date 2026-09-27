# api-property-matches-type

Require `@ApiProperty()` `type`, `enum` and `isArray` to match the TypeScript type of the property.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

The OpenAPI document is what frontends and integrators generate clients from. When
`@ApiProperty({ type: Number })` sits on `id: string`, every generated client is wrong while the
backend compiles happily.

## Examples

❌ Incorrect

```ts
class Dto {
  @ApiProperty({ type: Number }) id: string;
  @ApiProperty({ type: 'integer' }) amount: string;
  @ApiProperty({ type: [Foo] }) bars: Bar[];
  @ApiProperty({ type: String, isArray: true }) tag: string;
  @ApiProperty({ enum: Status }) currency: Currency;
}
```

✅ Correct

```ts
class Dto {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: () => Item }) item: Item;
  @ApiProperty({ type: [Item] }) items: Item[];
  @ApiProperty({ enum: Status, isArray: true }) statuses: Status[];
  @ApiProperty({ type: 'string', format: 'date-time' }) createdAt: Date; // JSON dates are strings
}
```

## Notes

- `string` and `Date` are interchangeable here, because JSON carries dates as strings.
- A missing `isArray` on an array property is **not** reported — `@darraghor/eslint-plugin-nestjs-typed`
  already covers it (`api-property-returning-array-should-set-array`).
- `nullable` is checked by [`nullable-matches-type`](./nullable-matches-type.md).
- Unknown swagger type names (`'uuid'`) and non-class references are skipped.
