## BWB-020 review — `feat/20-document-validation`

### Blocker

- **Parsed-object input can pass forbidden data.** [validate.ts](packages/core/src/document/validate.ts:85) reads the object in several passes, then `structuredClone` reads it again in [migrate.ts](packages/core/src/document/migrate.ts:38). I reproduced an enumerable getter returning safe data for the checks and an object containing `__proto__` for the clone: `validateDocument` returned `ok: true` with that reserved key in `document`. The same technique admitted a non-NFC string. **Fix:** accept text at untrusted entry points, or make one bounded, inert snapshot of parsed input and run every gate on that snapshot. Reject accessors and handle Proxy failures. Add a failing-case regression test.

### Major

- **Parsed-object size is a caller precondition, with no protection in this API.** [validate.ts](packages/core/src/document/validate.ts:62) documents this, but a huge string can reach NFC checks and cloning without a 2 MiB gate. The API cannot enforce the wire-byte limit after decoding. **Fix:** require a verified byte count or source text at each untrusted caller, and test that integration; clarify the statement that `validateDocument` applies *all* limits.

- **Hostile objects can throw outside the result contract.** `Object.values` in [validate.ts](packages/core/src/document/validate.ts:50) invokes getters before the `try` block. A throwing getter made `validateDocument` throw instead of returning `{ok:false}`. Direct `migrateDocument` also lets `structuredClone` throw `DataCloneError` outside its catch. **Fix:** catch enumeration and cloning failures and return a stable issue code, alongside the snapshot change above.

- **Migration output is not checked against the pre-migration safety gates.** [validate.ts](packages/core/src/document/validate.ts:111) sends a migration result straight to Zod. Once real migrations exist, a step can introduce reserved keys, invalid values, excessive depth or size. [migrate.ts](packages/core/src/document/migrate.ts:41) also silently selects the first duplicate `from` entry. **Fix:** reject duplicate registry steps and reapply all safety gates to each output before schema parsing. The identity-migration test in [validate.test.ts](packages/core/src/document/validate.test.ts:491) does not establish no data loss for a real migration.

### Minor

- **Issue collection exceeds the reporting cap.** [semantic.ts](packages/core/src/document/semantic.ts:39) can accumulate many errors; [validate.ts](packages/core/src/document/validate.ts:125) slices only afterward. Stop collecting at the cap. The class walk skipped after a tree-limit error is safe because validation already fails.

- **Timestamp years `0000`–`0099` are rejected despite matching the schema.** `Date.UTC` remaps those years in [semantic.ts](packages/core/src/document/semantic.ts:18). Set the UTC full year explicitly, or exclude those years in the contract. The regex already excludes second `60`; leap-day checks for later years work.

- **The value-count failure is classified as `too-deep`.** [validate.ts](packages/core/src/document/validate.ts:85) uses that code for `too-many-values`. Give it its own code or make the message and classification consistent.

### Agreements and limits of review

The gate order matches [DOCUMENT-SCHEMA.md](docs/architecture/DOCUMENT-SCHEMA.md:50): value-rule errors precede reserved-key errors. The style-rule key is unambiguous under the current patterns. The 128-container JSON limit leaves room for a 32-element tree; PHP’s `json_decode` needs `MAX_DEPTH + 1` and accepts 128 levels with that setting. I found no apparent catastrophic backtracking in the schema patterns. `compareCodePoints` handles astral characters correctly; lone surrogates are rejected before canonical serialization.

The focused core suite passed (**151 tests**), and the targeted TypeScript/PHP parity suite passed (**42 tests**). A broader fixtures run could not complete its golden-file tests because this read-only sandbox denied temporary-file writes. I could not verify byte enforcement at future REST/editor callers or the PHP document validator planned for BWB-027. Existing tests do not fail for the getter bypass, an oversized parsed object, duplicate migration steps, post-migration unsafe output, the 128-level PHP boundary, or early issue-collection limits.