# eslint-plugin-nest-drift

ESLint rules that catch **drift between decorators and TypeScript types** in NestJS DTOs.

```ts
class CreatePaymentDto {
  @IsString()           // ← validates a string…
  amount: number;       // ← …but the type says number. TypeScript is fine with it. This plugin is not.
}
```

TypeScript never looks inside `class-validator`, `class-transformer` or `@nestjs/swagger` decorators.
When a type changes and a decorator does not, the code compiles and the bug shows up at runtime —
rejected requests, unvalidated data, or a Swagger document that lies to every client generated from it.

## Install

```bash
npm i -D eslint-plugin-nest-drift
```

Requires ESLint 8.57+ or 9+, TypeScript 5.4 – 6.0 and
[typed linting](https://typescript-eslint.io/getting-started/typed-linting).

**Flat config (ESLint 9+):**

```js
// eslint.config.mjs
import tseslint from 'typescript-eslint';
import nestDrift from 'eslint-plugin-nest-drift';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  nestDrift.configs.recommended,
];
```

**Legacy `.eslintrc` (ESLint 8.57):**

```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "extends": ["plugin:nest-drift/legacy-recommended"]
}
```

Errors appear in your editor through the standard ESLint extension and fail CI through `eslint .`.

## Rules

💼 in `recommended` · 💭 requires type information

| Rule | Catches | 💼 | 💭 |
|---|---|---|---|
| [validator-matches-type](docs/rules/validator-matches-type.md) | `@IsString()` on `number`, `@IsInt()` on `bigint`, `@IsDateString()` on `Date` | 💼 | 💭 |
| [enum-matches-type](docs/rules/enum-matches-type.md) | `@IsEnum(Status)` on `Currency`, `@IsIn()` values outside the type | 💼 | 💭 |
| [nested-type-matches](docs/rules/nested-type-matches.md) | `@Type(() => Foo)` on `Bar[]`, `@Type(() => Number)` on `string` | 💼 | 💭 |
| [each-matches-array](docs/rules/each-matches-array.md) | array validated without `{ each: true }`, `each` on a scalar | 💼 | 💭 |
| [api-property-matches-type](docs/rules/api-property-matches-type.md) | `@ApiProperty({ type: Number })` on `string`, wrong `enum`, `isArray` on a scalar | 💼 | 💭 |
| [nullable-matches-type](docs/rules/nullable-matches-type.md) | `string \| null` rejected by validators or undocumented in Swagger | 💼 | 💭 |

Rules stay silent when they cannot be sure: `any`, `unknown`, generics, your own decorators,
discriminated `@Type`, non-literal options. False positives are treated as bugs — please
[open an issue](https://github.com/kerimakmyradov/eslint-plugin-nest-drift/issues).

## Disabling a rule

Every rule page has a **When not to use it** section. To silence a single intentional mismatch,
disable the rule on that line and say why:

```ts
// eslint-disable-next-line nest-drift/api-property-matches-type -- serialized as string by BigIntInterceptor
@ApiProperty({ type: String }) id: bigint;
```

To turn a rule off for part of the codebase, add an override after `nestDrift.configs.recommended`:

```js
{ files: ['src/legacy/**/*.ts'], rules: { 'nest-drift/nullable-matches-type': 'off' } }
```

## Use it together with `@darraghor/eslint-plugin-nestjs-typed`

[`@darraghor/eslint-plugin-nestjs-typed`](https://github.com/darraghoriordan/eslint-plugin-nestjs-typed)
checks that decorators are **present and well-formed**: every property is whitelisted,
`@IsOptional()` matches `?`, `@ValidateNested()` has `@Type()`, arrays set `isArray`.

This plugin checks that decorators **mean the same thing as the type**. The two do not overlap —
install both.

## Writing your own rules

The engine is exported as `eslint-plugin-nest-drift/core` (decorator discovery with alias/re-export
resolution, runtime kind classification of TypeScript types, `@Type`/swagger reference resolution).
It is experimental until 1.0.

## Roadmap

- **0.2** — type guards: `isOrder(x): x is Order` that does not check every required property.
- **0.3** — entity ↔ DTO drift: a field added or changed in the entity but not in the DTO.

## License

MIT
