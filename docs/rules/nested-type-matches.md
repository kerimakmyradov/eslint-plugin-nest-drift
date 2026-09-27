# nested-type-matches

Require class-transformer's `@Type(() => X)` to match the TypeScript type of the property.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

`@Type` decides which class `plainToInstance` creates. When it points to the wrong class, nested
validation runs against the wrong rules and your service receives an object of an unexpected shape.

## Examples

❌ Incorrect

```ts
class OrderDto {
  @ValidateNested() @Type(() => Discount) lines: OrderLine[];
  @Type(() => Number) page: string;
  @Type(() => Date) from: string;
}
```

✅ Correct

```ts
class OrderDto {
  @ValidateNested() @Type(() => OrderLine) lines: OrderLine[];
  @Type(() => Address) billing?: Address | null;
  @Type(() => Number) page: number;
  @Type(() => Date) from: Date;
}
```

## Notes

- For arrays, `Set` and `Map` the element type is compared.
- A subclass is accepted for a base-class or interface property.
- `@Type` with a second argument (`discriminator`, `keepDiscriminatorProperty`) is skipped.
- Generic classes and thunks that are not a plain class reference are skipped.
