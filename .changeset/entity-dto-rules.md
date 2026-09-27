---
'eslint-plugin-nest-drift': minor
---

TypeORM and DTO mapping rules: `column-matches-type` reports columns whose TypeScript type disagrees with what the driver returns (`decimal` read as string, `date` as string, uuid, enum and nullable columns); `plain-to-instance-matches-source` reports `plainToInstance()` calls that copy a value of another kind into a DTO field and, in the `strict` configs (`checkMissing`), exposed DTO fields the entity does not have.
