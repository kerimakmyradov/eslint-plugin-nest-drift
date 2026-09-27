# nullable-matches-type

Require `| null` in the TypeScript type to agree with class-validator and swagger nullability.

💼 Enabled in `recommended`. 💭 Requires type information.

## Why

- `@IsString() note: string | null` — the type promises `null` is fine, the validator rejects it.
- `@ApiProperty() deletedAt: Date | null` — clients are told the field is never `null`.
- `@ApiProperty({ nullable: true }) note: string` — clients handle a `null` that never comes, or the
  type forgot about it.

## Examples

❌ Incorrect

```ts
class Dto {
  @IsString() note: string | null;
  @ApiProperty() deletedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) comment?: string;
}
```

✅ Correct

```ts
class Dto {
  @IsOptional() @IsString() note: string | null;
  @ValidateIf((o) => o.note !== null) @IsString() note2: string | null;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
  @ApiPropertyOptional() comment?: string;
}
```

## Notes

- Only `null` is checked. `?` / `undefined` vs `@IsOptional()` and `required` are covered by
  `@darraghor/eslint-plugin-nestjs-typed`.
- A non-literal `nullable: someFlag`, a spread or a shared options object is skipped.
- `@Allow()`, `@IsEmpty()`, `@IsIn([..., null])` and `@Equals(null)` also accept `null`.
- Projects without `strictNullChecks` (`strict: false`): TypeScript erases `| null` there, so the rule
  turns itself off — it cannot see nullability at all.

## When not to use it

If your global `ValidationPipe` uses `skipNullProperties` or `skipMissingProperties`, `null` passes
validation everywhere by design. Keep the swagger half by leaving the rule on and ignoring
`nullRejected`, or turn the rule off.
