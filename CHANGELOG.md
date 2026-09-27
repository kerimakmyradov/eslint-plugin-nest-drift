# eslint-plugin-nest-drift

## 0.1.2

### Patch Changes

- e8adb24: Fix false positives around enums: `as const` arrays passed as `enum` / `@IsEnum()` are read as lists of values; a plain `string` / `number` property holding enum values is no longer reported by `enum-matches-type`; `api-property-matches-type` only reports documented enum values the property cannot hold.

## 0.1.1

### Patch Changes

- be2c63a: Docs: every rule now explains when to disable it, and the README shows how to silence a single intentional mismatch or turn a rule off for part of a codebase.

## 0.1.0

### Minor Changes

- a151f15: First release: `validator-matches-type`, `enum-matches-type`, `nested-type-matches`, `each-matches-array`, `api-property-matches-type`, `nullable-matches-type` and the `recommended` config.
