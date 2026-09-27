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
- A non-literal `nullable: someFlag` is skipped.
