# Handoff: independent review of BWB-026 (global design token schema and resolver)

READ-ONLY, offline. Branch `feat/26-design-token-schema`. Read: `docs/architecture/DESIGN-TOKENS.md`, `packages/design-tokens/src/*.ts` (schema, graph) and tests, `packages/design-tokens/schema/token-set.schema.json`, `packages/style-engine/src/tokens.ts` and `tokens.test.ts`, the changes in `grammar.ts`/`validate.ts` (strings allowed in `--blx-*` custom properties), ADR 0004 (tokens are live), ADR 0005 (token layers, modes), ADR 0010 (package boundaries), PRD FR-004.

Questions:
1. Security: can a token value reach CSS output unvalidated (compile's token path, `tokensForCompile`, the resolver's textual substitution)? Strings are now allowed in custom properties and `var()` fallbacks: any way to break out of a quoted name or build `url(` from pieces? Does textual substitution in `resolveTokens` produce values that `validateDeclaration` would reject (so previews or PHP could differ from what CSS gets)? Reserved keys, hostile input, prototype pollution (`byName` map, `Object.fromEntries`).
2. Reference semantics: aliases, fallbacks (token missing vs token present but unresolvable), nested fallbacks, cycles per mode, memoization correctness (a failure cached on one path and reused on another; cycle results not cached), depth 16 and 8 KiB limits, complexity with 500 tokens (diamonds), a token referencing itself through a fallback.
3. Modes: `dark` override semantics, a dark value referencing a token that only has a light value, `category-mismatch` rule limited to lone aliases (is that sufficient or inconsistent?), `auto` handling in `tokensForCompile`.
4. Package boundary: design-tokens depends only on Zod; style-engine owns validation. Is anything duplicated or leaking? Is putting `validateTokenSet` in style-engine the right home given ADR 0010 (check `tooling/boundaries.json`)? Does PHP (BWB-027) get enough from the JSON Schema plus docs to reimplement validation and resolution identically?
5. Schema: looseObject choice (forward compatibility vs strictness), name pattern, limits, `tokenVersion` semantics, JSON Schema generation (`io: input`), `schemaVersion` literal 1 and the migration story.
6. Tests: which behaviours have no failing-case test; which mutations (graph memo, category map, dark handling, alias regex) would still pass?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
