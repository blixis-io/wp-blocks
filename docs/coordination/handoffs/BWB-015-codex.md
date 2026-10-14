# Handoff: independent security review of BWB-015 (GitHub Actions CI)

READ-ONLY, offline. Branch `ci/15-github-actions` (PR #134, all jobs green). Read: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `tooling/check-licenses.mjs`, `tooling/licenses.json`, `tooling/check-licenses.test.mjs`, `docs/engineering/CI-CD.md` (Implemented pipeline), `docs/engineering/SECURITY.md`, `docs/engineering/GITFLOW.md`, ADR 0008, ADR 0001.

Questions:
1. Workflow security: script injection (every `${{ }}` use), `pull_request` from forks, token permissions, `persist-credentials`, action pinning (SHAs are claimed to be the commit of the stated tag: cannot verify offline, say so), caching poisoning (composer cache key/restore-keys, pnpm cache), `workflow_dispatch`, concurrency cancel semantics on `push` to main, `if: always()` aggregator logic (does a cancelled/failed/skipped job make `CI` fail correctly? is skipping `commits` on push correct?).
2. Secret scan: gitleaks download and checksum approach, `fetch-depth: 0`, `gitleaks git` on a PR merge ref vs full history, false negatives; anything that would leak the token or secrets into logs.
3. Coverage: does the pipeline enforce ADR 0001 (PHP matrix, Node), ADR 0008 (licence policy, GSAP ban), GITFLOW (commit lint, no AI attribution)? Anything claimed in `CI-CD.md` that the workflow does not do?
4. `check-licenses.mjs`: logic errors in SPDX expression handling (precedence of AND/OR, `+`, parentheses, `WITH` exceptions, `LicenseRef-*`), handling of packages with multiple versions or missing licences, PHP `license` arrays, the `blixis/wp-blocks-dev` exclusion, and whether `devOnly` exceptions are justified. Would tests fail if the logic were gutted?
5. Dependabot config: valid keys, prefixes producing commits that pass commitlint, cooldown semantics, labels that exist.

Output: Blocker/Major/Minor with file + line + fix wording; short agreements; what you could not verify.
