# BWB-041 Codex implementation report

tokens used
101,579
Implemented BWB-041 on `feat/41-document-rest-api` without committing or pushing.

The new [REST controller and request policy](wordpress/plugin/src/Rest/DocumentController.php) register layout and locale-content GET/PUT routes under `blixis/v1`. They use CAS writes, quoted revision ETags, the 2 MiB envelope limit, and safe `WP_Error` responses. Post access returns the same 403 for missing posts, excluded post types, and insufficient capability. Publication pointers and snapshots have no route. I also updated the [WordPress API documentation](docs/architecture/WORDPRESS.md) and the superseded [REST sketch](docs/architecture/SCHEMAS-AND-APIS.md).

The [unit tests](wordpress/plugin/tests/DocumentRestTest.php) cover permissions, nonce absence on cookie PUT, read-only GET, headers, errors, conflicts, size limits, locales, and unreachable keys. All requested local checks passed: `lint:fix`, `lint`, `test` (183 tests), PHPStan, and Prettier.

**Still open:** I could not run a real WordPress smoke test here. That test must confirm route registration and core’s invalid-nonce behavior; the unit test covers the controller’s missing-nonce behavior. The GitHub API was unreachable, so I could not recheck [issue #41](https://github.com/blixis-io/wp-blocks/issues/41).
