## Review of BWB-019

**Blocker:** None found in the document shape. Publication pointers are correctly absent from the working document: ADR 0003 stores them separately, and ADR 0004 publishes immutable layout and locale snapshots.

### Major

- [style.ts](packages/core/src/schema/style.ts:11): `StyleRuleSchema` uses `z.object`, which strips unknown fields. A rule with `"future":"keep"` passes both validators, but Zod removes that field on parse. **Fix:** define whether style rules support compatible optional additions; if they do, preserve their unknown fields and add a round-trip test. The current [versioning rule](docs/architecture/DOCUMENT-SCHEMA.md:42) is too broad otherwise.

- [primitives.ts](packages/core/src/schema/primitives.ts:11), [document.ts](packages/core/src/schema/document.ts:49): Parsed JSON containing `__proto__` inside a property value or as an unknown document field passes shape validation, then loses that key during Zod parsing. `constructor` is accepted as a property ID. I did not observe prototype pollution, but the silent loss violates the round-trip contract and reserved keys can be hazardous to later consumers. **Fix:** specify and enforce a recursive reserved-key policy in both languages, or prove preservation with safe map handling; add JSON-text fixtures for these keys.

- [DOCUMENT-SCHEMA.md](docs/architecture/DOCUMENT-SCHEMA.md:29): The 2 MB, depth, node, and declaration-count limits are deferred to BWB-020; unknown fields and JSON values remain unbounded in this schema. **Fix:** make the pre-decode byte limit and pre-validation depth/complexity checks an explicit required gate for every PHP and TypeScript entry point. Add the 64-declaration cap to the schema if practical; JSON Schema can express that individual limit with `maxProperties`. Do not treat successful shape validation as safe input.

- [eslint.config.mjs](eslint.config.mjs:68): The core rule blocks `node:*` imports but permits bare built-ins such as `import fs from 'fs'`; I confirmed that with ESLint on stdin. **Fix:** restrict bare Node built-ins too, and cover the boundary with a lint fixture.

### Minor

- [schema.test.ts](packages/core/src/schema/schema.test.ts:72): The agreement corpus catches several weakened patterns, enums, and required fields, but misses `sourceHash`, `classRefs` keys, translation value keys, declaration-name boundaries, timestamp calendar validity, reserved keys, and style-rule round trips. Add focused positive and negative cases. Also test missing `values`, `status`, `declarations`, `updatedAt`, and `editorVersion` individually.

- [DOCUMENT-SCHEMA.md](docs/architecture/DOCUMENT-SCHEMA.md:29): Expand the delegated-check list to include unique locales, presence of the default-locale translation stream, class reference consistency, registered breakpoints and `blixis/*` ownership, and real calendar-date validation if `updatedAt` promises an actual timestamp. The syntax pattern currently accepts `2026-02-31T00:00:00Z`.

## Agreements and limits

The main fields, default-locale stream, `orphaned` status, class references, sparse style selectors, and separate publication model match ADRs 0003–0005. All seven WordPress locale examples in the request match the locale pattern. The regexes use bounded components; I found no evident ReDoS pattern. `blixis/unknown` being shape-valid is consistent with registry-level ownership checks; `-webkit-x` is rejected, while permitted declaration names still require the later CSS allow-list. Documents, elements, and classes share an ID *format*, but occupy separate namespaces.

The generated schema is current. `$defs` references, `propertyNames`, and `additionalProperties: {}` have coherent 2020-12 meanings; this artifact has no problematic `$ref` siblings. **PHP behavior remains unverified:** no PHP JSON Schema validator is installed or pinned here, so BWB-027 needs to select a 2020-12-capable implementation and run the same corpus against it. I could not verify WordPress locale catalog completeness offline.

Read-only checks: 58 core tests passed; `schema:check` passed. The working tree remained clean.