# Handoff: independent review of BWB-012 (local WordPress environment)

READ-ONLY, offline. Branch `chore/12-wp-env`. Read: `docker/compose.yml`, `tooling/wp-env/wp-env.mjs`, `tooling/wp-env/fixtures/seed.php`, `tooling/docker.test.mjs`, the `wordpress` job in `.github/workflows/ci.yml`, `docs/engineering/LOCAL-DEVELOPMENT.md`, `docs/engineering/SECURITY.md`, ADR 0001.

Questions:
1. Security of the stack: loopback-only port binding, database not published, dev credentials, `WORDPRESS_CONFIG_EXTRA`, `user: 33:33` for the CLI container, volume sharing, anything that could expose the environment or leak into CI logs. Is the dev admin password acceptable given loopback-only and CI-ephemeral use?
2. `wp-env.mjs`: command injection or argument-handling flaws (env vars into docker args), `reset` semantics (volumes of this project only), waiting/timeouts, failure handling, `process.exit` paths, smoke test strength (could it pass vacuously?).
3. `seed.php`: idempotency, use of WordPress APIs, privilege assumptions, data it could clobber on a non-dev site if mis-run (is there a guard?).
4. CI job: matrix images pinned by digest, teardown on failure, runner resource assumptions, interaction with the aggregate `CI` job.
5. Tests: would `docker.test.mjs` fail if pinning, loopback binding or the project name were removed?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
