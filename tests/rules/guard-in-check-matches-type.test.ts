import { guardInCheckMatchesType } from '../../src/rules/guard-in-check-matches-type';
import { es2021RuleTester, looseRuleTester, ruleTester } from '../rule-tester';

const DOCS = `
interface Draft { id: string; title: string }
interface Archived { id: string; title: string; archivedAt: Date }
interface ConfigV1 { url: string }
interface ConfigV2 { url: string; schemaVersion: 2 }
`;

ruleTester.run('guard-in-check-matches-type', guardInCheckMatchesType, {
  valid: [
    // numeric keys are admitted by numeric index signatures
    `const a = (x: unknown): x is string[] => Array.isArray(x) && '0' in x;
     const b = (x: unknown): x is readonly number[] => Array.isArray(x) && '1' in x;
     const c = (x: object): x is Uint8Array => '0' in x;`,
    `${DOCS}
     const isArchived = (d: Draft | Archived): d is Archived => 'archivedAt' in d;
     const isV1 = (c: ConfigV1 | ConfigV2): c is ConfigV1 => !('schemaVersion' in c);`,
    // optional property counts as declared
    `interface Item { id: string; note?: string }
     const hasNote = (x: unknown): x is Item => typeof x === 'object' && x !== null && 'note' in x;`,
    // apparent members exist on every object
    `interface Item { id: string }
     const a = (x: object): x is Item => 'toString' in x;`,
    // an in-check combined with another condition is not reported as non-discriminating
    `interface A { kind: 'a'; flag: boolean } interface B { kind: 'b'; flag: boolean }
     const isA = (x: A | B): x is A => 'flag' in x && x.kind === 'a';`,
    // early return makes the guard multi-statement: no non-discriminating report
    `interface A { kind: 'a'; k: string } interface B { kind: 'b'; k: string }
     function isA(x: A | B): x is A { if (x.kind !== 'a') return false; return 'k' in x; }`,
    // negated-only guards are not "always true"
    `interface A { k: string } interface B { k: string; j: number }
     const isA = (x: A | B): x is A => !('j' in x);`,
    // guard to the whole union narrows nothing but also promises nothing wrong
    `interface A { k: string } interface B { k: string }
     const both = (x: A | B): x is A | B => 'k' in x;`,
    // a \`declare\` field is never emitted, so it may be absent at runtime
    `class Entity { id = ''; declare version: number; }
     const unversioned = (x: Entity | { raw: true }): x is Entity => !('version' in x);`,
    // index signatures, shapeless targets, generics, framework keys
    `interface Bag { [key: string]: unknown }
     const a = (x: unknown): x is Bag => typeof x === 'object' && x !== null && 'anything' in x;
     const b = (x: unknown): x is object => typeof x === 'object' && x !== null && 'k' in x;
     const c = <T,>(x: unknown): x is T => typeof x === 'object' && x !== null && 'k' in x;
     interface User { id: string }
     const d = (x: object): x is User => '__typename' in x;`,
  ],
  invalid: [
    {
      code: `${DOCS}
const isArchived = (d: Draft | Archived): d is Draft => 'archivedAt' in d;`,
      errors: [{ messageId: 'missingProperty', data: { key: 'archivedAt', target: 'Draft', param: 'd' } }],
    },
    {
      code: `${DOCS}
const isV2 = (c: ConfigV1 | ConfigV2): c is ConfigV2 => !('schemaVersion' in c);`,
      errors: [{ messageId: 'requiredButExcluded', data: { key: 'schemaVersion', target: 'ConfigV2', param: 'c' } }],
    },
    {
      code: `${DOCS}
const isArchived = (d: Draft | Archived): d is Archived => 'title' in d;`,
      errors: [{ messageId: 'notDiscriminating' }],
    },
    // with ES2022 define semantics an uninitialised field exists (as undefined)
    {
      code: `class Entity { id!: string; }
const isFresh = (x: Entity | { raw: true }): x is Entity => !('id' in x);`,
      errors: [{ messageId: 'requiredButExcluded' }],
    },
    // method, alias and element access forms
    {
      code: `${DOCS}
class Checks {
  isDraft(d: Draft | Archived): d is Draft {
    const doc = d as Draft | Archived;
    return 'archivedAt' in doc;
  }
}`,
      errors: [{ messageId: 'missingProperty' }],
    },
  ],
});

looseRuleTester.run('guard-in-check-matches-type (strictNullChecks off)', guardInCheckMatchesType, {
  valid: [
    // loose fixture targets ES2022 too, so only \`declare\` fields are absent there
    `class Entity { id = ''; declare version: number; }
     const unversioned = (x: Entity | { raw: true }): x is Entity => !('version' in x);`,
    `${DOCS}
     const isArchived = (d: Draft | Archived): d is Archived => 'archivedAt' in d;`,
  ],
  invalid: [
    {
      code: `${DOCS}
const isArchived = (d?: Draft | Archived): d is Draft => 'archivedAt' in d;`,
      errors: [{ messageId: 'missingProperty' }],
    },
  ],
});

es2021RuleTester.run('guard-in-check-matches-type (ES2021 class fields)', guardInCheckMatchesType, {
  valid: [
    // without define semantics an uninitialised field is absent until assigned
    `class Entity { id!: string; }
     const isFresh = (x: Entity | { raw: true }): x is Entity => !('id' in x);`,
  ],
  invalid: [
    {
      code: `class Entity { id = ''; }
const isFresh = (x: Entity | { raw: true }): x is Entity => !('id' in x);`,
      errors: [{ messageId: 'requiredButExcluded' }],
    },
  ],
});
