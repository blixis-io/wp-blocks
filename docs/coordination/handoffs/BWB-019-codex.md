# Handoff: independent review of BWB-019 (document schema)

READ-ONLY, offline. Branch `feat/19-document-schema`. Read: `docs/architecture/DOCUMENT-SCHEMA.md`, `packages/core/src/schema/*.ts`, `packages/core/scripts/generate-schema.ts`, `packages/core/schema/document.schema.json`, `packages/core/src/schema/schema.test.ts`, `tests/fixtures/documents/**`, ADR 0003, ADR 0004, ADR 0005, `docs/engineering/FIXTURES.md`, `eslint.config.mjs` (core block).

Questions:
1. Does the schema implement ADR 0003/0004/0005 faithfully? Missing or wrong fields (published pointers are not in the working document: is that right?), the loose-object policy for forward compatibility vs attacks (huge unknown fields, prototype-pollution keys like `__proto__`/`constructor` in props and unknown fields, deep nesting), `props` record keyed by PropertyId vs unknown element props, IDs shared between documentId/element/class ids.
2. Are the patterns (id, element type, locale, property id, breakpoint, timestamp, declaration name) correct and consistent between Zod and the generated JSON Schema? ReDoS risk? WordPress locales that do not match (`ckb`, `pt_PT_ao90`, `de_CH_informal`, `sr_RS`, `bal`, `art_xemoji`, `ca_valencia`?). Does it accept things it must not (e.g. type `blixis/` names clashing, declaration names like `-webkit-x`, vendor prefixes)?
3. Generated JSON Schema: `reused: 'ref'`, anonymous `__schemaN` definitions, `additionalProperties: {}` semantics, `propertyNames`, `unrepresentable: 'throw'`; will PHP validators (opis/json-schema, justinrainbow) handle `$defs` refs, `propertyNames`, 2020-12 `$ref` siblings? Anything that makes the schema unreliable for the PHP side (BWB-027)?
4. Versioning rules and the "what the schema does not check" list: gaps? Anything the schema should enforce but delegates?
5. Tests: would they fail if a pattern, enum or required field were weakened? The Zod/Ajv agreement corpus: what important case is missing?
6. Dependencies: zod 4.6.7 and ajv 8.20.0 exact pins; the ESLint core block (no Node APIs in core source).

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
