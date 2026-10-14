## Findings

**Blocker:** None found in this read-only review.

**Major**

- [seed.php](tooling/wp-env/fixtures/seed.php:9) has no development-site guard. If run against another WordPress site, it resets passwords and roles for matching users, overwrites pages with the `home`, `about`, and `contact` slugs, and changes site options. Add an explicit fixture-only marker check before any write; fail if it is absent. Also check WordPress API results for errors.
- [wp-env.mjs](tooling/wp-env/wp-env.mjs:14) relies on Compose’s project name for `reset`. The default name is distinctive, but `COMPOSE_PROJECT_NAME` can override it; `down --volumes` would then target that selected project’s volumes. Pass an explicit project name with `-p` and test the resolved project identity before destructive commands.

**Minor**

- [wp-env.mjs](tooling/wp-env/wp-env.mjs:29): `fetch` has no per-request timeout, so the stated 120-second wait can hang on a stalled response. Add an abort timeout. Treat only a suitable WordPress response as ready; any status below 500 currently qualifies.
- [wp-env.mjs](tooling/wp-env/wp-env.mjs:92): local smoke tests do not require version expectations, and captured command failures are not checked directly. Require successful command exits and validate versions against defaults when overrides are absent. Match fixture usernames as complete lines rather than substrings.
- [docker.test.mjs](tooling/docker.test.mjs:22): the port check recognizes selected short-form lines, not resolved Compose YAML. It would miss some added or long-form published ports. Parse the resolved configuration and assert every published address is loopback and `db` has no published port. Test the CI matrix digests separately.
- [.github/workflows/ci.yml](.github/workflows/ci.yml:145): runtime smoke covers two diagonal WP/PHP combinations, while [ADR 0001](docs/architecture/adrs/0001-supported-environments.md:35) specifies a broader compatibility matrix. Add the required combinations when integration coverage is expected.
- [docker/compose.yml](docker/compose.yml:42): `WP_DEBUG_LOG` writes inside the shared WordPress web volume. Avoid logging sensitive request data and keep CI’s failure-log step restricted or redacted as tests grow. The present fixed development credentials are not secrets.

## Agreements

The current Compose file binds the web port to `127.0.0.1`, publishes no database port, pins default images by digest, and runs CLI as UID/GID `33:33` with only the intended named WordPress volume and read-only fixture mount. `spawnSync` passes arguments without a shell, so the environment variables and forwarded CLI arguments do not create shell command injection. The known `admin / password` credential is acceptable for this explicitly local, ephemeral stack **provided it is never exposed beyond loopback**. CI has failure teardown and an aggregate job that requires the WordPress matrix to succeed.

The six static tests passed. They would fail for straightforward removal of a default digest, the loopback address, or the project name.

## Could not verify

Offline, read-only review could not confirm image digest contents, actual Docker networking and permissions, WordPress startup timing, or a live smoke run. The working tree remained clean.