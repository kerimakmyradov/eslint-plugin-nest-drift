---
'eslint-plugin-nest-drift': minor
---

Type guard rules: `guard-discriminant-matches-type` and `guard-in-check-matches-type` (in `recommended`) report guards whose discriminant or `in` checks contradict the guarded type; the opt-in `guard-covers-required-properties` reports guards on unknown input that skip required properties. New `strict` and `legacy-strict` configs.
