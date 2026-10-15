# BWB-048 independent Codex review (read-only)

**Clean categories:** I found no REST path that lets a caller forge the audit payload, omit its event after a successful controller result, or put document content in it. I found no demonstrated dangerous input admitted by the sanitizer change through the core renderers; the URL and hostile-render checks still reject the cases tested.

Read-only verification: targeted PHPUnit passed, **44 tests / 240 assertions**. I did not run the real WordPress smoke.
hook: Stop
hook: Stop Completed
tokens used
121,263
## Findings, ranked

1. **Major — reaching the snapshot cap also blocks rollback.** The cap runs before the publisher distinguishes a new publish from a rollback, and every rollback creates a new snapshot. Once a post has 200 snapshot rows, even a user trying to restore an older version gets `blixis_snapshot_limit`. One authorized publisher can therefore exhaust the post’s capacity and block other publishers’ recovery actions. [Publisher.php](wordpress/plugin/src/Publication/Publisher.php:137), [PublicationRequest.php](wordpress/plugin/src/Rest/PublicationRequest.php:99)

2. **Major — neither abuse limit is a strict concurrent bound.** The rate check and its successful-write record are separate operations; the transient store also uses a read followed by a write. Concurrent requests can all pass the 30-write check. The snapshot count is likewise checked before snapshot insertion, so concurrent publishes for different locale keys can leave more than 200 rows when one later loses the pointer compare-and-swap. [PublicationRequest.php](wordpress/plugin/src/Rest/PublicationRequest.php:128), [WordPressTransientRateStore.php](wordpress/plugin/src/Publication/WordPressTransientRateStore.php:20), [Publisher.php](wordpress/plugin/src/Publication/Publisher.php:137), [SnapshotStore.php](wordpress/plugin/src/Storage/SnapshotStore.php:58)

3. **Moderate — transient eviction resets the rate limit.** A missing transient becomes an empty window, so early cache eviction permits another 30 successful operations within the same hour. The user/post key has no apparent collision or cross-user counter problem; the weakness is relying on evictable storage as the enforcement record. [WordPressTransientRateStore.php](wordpress/plugin/src/Publication/WordPressTransientRateStore.php:20), [SlidingRateLimiter.php](wordpress/plugin/src/Publication/SlidingRateLimiter.php:46)

4. **Moderate — the token-set PHP port diverges on Unicode and bounded work.** PHP uses byte length for labels, while the TypeScript schema limits JavaScript string length: a label of 50 `é` characters passes that length rule in TypeScript and fails in PHP, which I reproduced. PHP also recursively resolves each token without the TypeScript resolver’s memoization, making shared reference graphs substantially more expensive. The PHP port currently has no production caller, so this is a parity risk for its future use. [TokenSet.php](wordpress/plugin/src/Tokens/TokenSet.php:338), [TokenSet.php](wordpress/plugin/src/Tokens/TokenSet.php:115), [graph.ts](packages/design-tokens/src/graph.ts:154)

5. **Minor — the security matrix understates its own smoke evidence.** It says audit emission has no real WordPress observation and that the smoke has no 429 or 409 limit checks. The new “Hardening (BWB-048)” block contains all three. I checked all **40 cited PHPUnit methods** and **16 cited smoke labels**; each exists. [SECURITY-TEST-MATRIX.md](docs/engineering/SECURITY-TEST-MATRIX.md:37), [wp-env.mjs](tooling/wp-env/wp-env.mjs:1098)

**Clean categories:** I found no REST path that lets a caller forge the audit payload, omit its event after a successful controller result, or put document content in it. I found no demonstrated dangerous input admitted by the sanitizer change through the core renderers; the URL and hostile-render checks still reject the cases tested.

Read-only verification: targeted PHPUnit passed, **44 tests / 240 assertions**. I did not run the real WordPress smoke.
