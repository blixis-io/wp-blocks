# Handoff: independent review of BWB-028 (versioning and compatibility contracts)

READ-ONLY, offline. Branch `docs/28-versioning-and-compatibility`. Read: `docs/architecture/VERSIONING-AND-COMPATIBILITY.md` (new), `tests/fixtures/src/versions.test.ts`, and the documents it draws on: ADR 0003, 0004, 0005, 0009, 0010, `docs/architecture/DOCUMENT-SCHEMA.md` (Versioning rules), `docs/architecture/EXTENSION-API.md`, `docs/architecture/DESIGN-TOKENS.md`, `docs/architecture/CSS-COMPILER.md`, `docs/engineering/FIXTURES.md`; code: `packages/element-registry/src/definition.ts` and `registry.ts` (requiresApi), `packages/core/src/document/migrate.ts`.

Questions:
1. Does the document contradict or silently change any ADR rule (document versioning, compat/breaking classification, cache keys, fallback classes, deprecation)? List contradictions and rules that are new decisions rather than restatements, and say whether each new decision is sound.
2. Extension API policy: "bump on every public-surface change", the `k + 2` support window and the deprecation rule `removed in M >= N + 2`. Are they coherent (can an add-on that declares requiresApi = k be broken by a bump that is only additive)? Is "unsupported beyond k + 2" consistent with "deprecated features keep working for two further versions"? Anything not implementable with the current registry (`requiresApi` only checks the upper bound)?
3. Element definition rules: the document does not store the definition version; is "a definition must always read content written by any earlier version" enough for add-on authors who have no migration hook? Are the compatible/breaking lists correct (e.g. changing a property classification, widening allowedParents, narrowing ranges, default changes)? Anything missing (rename of `type`, category changes, tier changes, fallback changes)?
4. Loosening limits as breaking for downgrades, CSS allow-list removal as breaking, tokens "live so not a version event": agree? Gaps for translations, global classes, snapshots, the REST API, theme `theme.json`?
5. The inventory test parses a markdown table: how brittle, and what drift is it unable to catch (constants not listed, `$id` URNs, `fixtureVersion`)? Is the checklist complete for a developer changing a schema (what would they forget)?
6. Factual accuracy: check each concrete claim against the repository (file names, commands, constants, issue numbers BWB-041/043/075, ADR references).

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
