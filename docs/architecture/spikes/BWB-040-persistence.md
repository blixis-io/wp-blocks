# BWB-040 persistence spike

Issue: [#40](https://github.com/blixis-io/wp-blocks/issues/40). This records the implemented storage contract and the WordPress behavior to measure in the real-site smoke test.

## CAS decision

Each working stream and the publication pointer owns one postmeta row. Existing-row writes use one prepared `UPDATE` constrained by `meta_id`, `post_id`, `meta_key`, and an exact-byte `BINARY meta_value` comparison. An affected-row count of one is success. A miss rereads the current revision and returns a conflict with the expected revision. This avoids a read-then-write race and prevents WordPress/MySQL's usual case-insensitive collation from treating distinct JSON bytes as equal. Different stream keys update different rows.

`wp_postmeta` has no unique `(post_id, meta_key)` constraint. First inserts and immutable snapshot inserts therefore take a MySQL connection-scoped `GET_LOCK` named by table, post ID, and key, then check for an existing row and insert while holding it. A single `INSERT ... WHERE NOT EXISTS` would still admit two concurrent inserts without a unique constraint. The lock is released in `finally`. Reads fail on duplicate rows rather than choosing a value. The lock requires all plugin writers to use this repository; direct `update_post_meta()` on builder keys violates the contract. Advisory lock behavior, database permissions, and connection routing need the real WordPress smoke.

The envelope cap is 2 MiB and JSON nesting is limited to 32 levels. `schemaVersion` and the stream revision field must be positive integers. The store advances the revision exactly once and retains unknown JSON fields. This is **envelope validation only**. `DocumentValidator` allows BWB-043 to add full PHP schema validation. The fixed-key WordPress `sanitize_callback` returns `''` for invalid input because WordPress's callback has no post ID and cannot abort the write or fetch the previous value. It is a defensive registration fallback, not a safe persistence API. The repository validates and throws before writing. Callers must use the repository, not direct post-meta updates.

## Core revisions and autosaves

WordPress obtains revisioned meta keys from registered `revisions_enabled` meta and the [`wp_post_revision_meta_keys` filter](https://developer.wordpress.org/reference/hooks/wp_post_revision_meta_keys/). Core's [revision save](https://developer.wordpress.org/reference/functions/wp_save_revisioned_meta_fields/) and [autosave](https://developer.wordpress.org/reference/functions/wp_autosave_post_revisioned_meta_fields/) paths iterate that list. The plugin does not mark fixed keys as `revisions_enabled`, and its filter removes any `_blixis_` key another extension adds. Dynamic locale and snapshot keys are not registered individually. Consequently, the intended behavior is that core does not copy or restore builder keys during revisions or autosaves. This is a code-path inference, **not a measured WP 7.0 result**. Verify it in the smoke test, including restore and autosave under an editor account.

The decision is to keep builder working streams and publication snapshots outside core revision restore. The plugin's own bounded revision ring and retention policy remain BWB-046 / ADR 0004 §5. This avoids a core restore overwriting a newer CAS revision or moving the publication pointer unexpectedly. A WordPress post revision alone will not roll back builder content.

## Interrupted publication

Publication inserts an immutable snapshot first, then CAS-advances `_blixis_published`. A failure between those steps leaves the old live pointer intact and the new snapshot unreferenced. Unit tests inject a pointer-write failure and confirm that the snapshot can be identified and collected. The collector holds the pointer lock and rereads its exact value before removing orphans, so a cooperating pointer advance cannot race collection. A first publication with no pointer can be cleaned by `collect( post, '' )`. No public renderer uses working streams or unreferenced snapshots.

The pointer stores positive integer snapshot revisions in `publishedLayoutRevision` and each `locales[locale]` entry's `contentSnapshot`, `baseLayout`, and optional `sourceContentRevision`; `defaultLocale` identifies source snapshots. The collector rejects malformed references rather than guessing which rows are safe to delete. It protects keys directly referenced by the live pointer, including pinned `baseLayout` and `sourceContentRevision` references. The bounded rollback ring in ADR 0004 §5 is not implemented here; **do not schedule automatic collection until that ring contributes protected keys**. The current method is a manual recovery primitive for verified unreferenced rows.

## Decision and consequences

Post meta remains the candidate P0/P1 store, subject to the real WordPress smoke below. It has no schema migration or custom table. The cost is one advisory lock round trip for each first row and snapshot, a 2 MiB update for every stream write, and a strict repository-only write rule. A database outage or lock timeout surfaces as an error; it must not be treated as a revision conflict. The REST layer must translate `WriteResult` conflicts to HTTP 409 with current and expected revisions when implemented.

## Measured results

Measured by the real-WordPress smoke (`pnpm wp:smoke`, `tooling/wp-env/fixtures/storage-smoke.php` plus the concurrency step in `tooling/wp-env/wp-env.mjs`) on WordPress 7.0.4, PHP 8.2.34 and MariaDB 11.4.13 in Docker. CI repeats the smoke on WordPress 7.0 and 7.1.

- **Locking and first write.** `GET_LOCK` is available. Six parallel WP-CLI processes writing the first revision of the same stream: exactly one wins and one row exists afterwards.
- **Compare-and-swap.** Six parallel writers all expecting revision 1: exactly one wins. A stale revision is reported as a conflict. The layout stream and a `nl_NL` content stream on the same post are independent (a write to one never conflicts with the other).
- **Core revisions and autosave.** Core created a revision and an autosave; neither copied any `_blixis_` meta, and restoring the revision left the layout stream untouched. The plugin therefore keeps its own bounded revision ring (ADR 0004 section 5) and does not rely on core.
- **Interrupted publish.** A snapshot row without a pointer update left the live pointer unchanged; `unreferenced()` listed it and `collect()` removed it. Publishing then advanced the pointer; a second publish to the same snapshot key was refused, and `collect()` kept referenced snapshots.
- **Authorization.** Administrators and editors may edit the fixed and a dynamic locale key; an author of a different page, a contributor on a page they do not own, a subscriber and any unknown `_blixis_` key may not.
- **Payload.** Single CAS writes took about 5 ms at 10 KB, 47 ms at 0.5 MB and 65 ms at 1.9 MB (one run, local Docker; indicative only, not a profile). The 2 MB envelope cap holds.
- **Not yet measured.** Persistent object cache behaviour (Redis) and multisite; both stay open for BWB-044/046 profiling.
