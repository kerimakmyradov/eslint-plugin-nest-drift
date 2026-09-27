---
'eslint-plugin-nest-drift': patch
---

Fix false positives around enums: `as const` arrays passed as `enum` / `@IsEnum()` are read as lists of values; a plain `string` / `number` property holding enum values is no longer reported by `enum-matches-type`; `api-property-matches-type` only reports documented enum values the property cannot hold.
