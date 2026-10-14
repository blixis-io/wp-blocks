# BWB-040 Codex implementation report

tokens used
181,204
Implemented BWB-040 on `feat/40-post-meta-persistence`; no commit, push, or PR was made.

The storage layer in [wordpress/plugin/src/Storage](wordpress/plugin/src/Storage) now provides key validation, envelope checks, post-meta registration, per-stream CAS writes, immutable snapshots, and orphan collection. [Plugin.php](wordpress/plugin/src/Plugin.php) wires registration in. Tests were added under [wordpress/plugin/tests](wordpress/plugin/tests).

**CAS choice:** existing rows use one prepared `UPDATE` that compares the exact previous value. First inserts use a per-key MySQL advisory lock because `wp_postmeta` has no unique post/key constraint. The rationale, interrupted-publish recovery, and the decision to exclude builder keys from core revisions are recorded in the [spike](docs/architecture/spikes/BWB-040-persistence.md). [WORDPRESS.md](docs/architecture/WORDPRESS.md) and the [ADR 0003 spike pointer](docs/architecture/adrs/0003-document-model-and-persistence.md:4) were updated. The revision decision follows WordPress’s documented [revision meta key filter](https://developer.wordpress.org/reference/hooks/wp_post_revision_meta_keys/) and [autosave path](https://developer.wordpress.org/reference/functions/wp_autosave_post_revisioned_meta_fields/); WP 7.0 behavior has not been measured here.

Checks passed: `composer run lint`, `composer run lint:fix`, `composer run test` (177 tests, 602 assertions), PHPStan with `--debug --memory-limit=1G`, Prettier for `docs`, and `git diff --check`. The normal `composer run stan` could not start workers because the sandbox denied its TCP listener.

**Open work:** the owner’s real WordPress smoke must confirm advisory locks, concurrency, revisions/autosaves, and recovery; its measured results remain marked TODO. Automatic orphan collection should wait for the bounded revision ring’s retention rules.
