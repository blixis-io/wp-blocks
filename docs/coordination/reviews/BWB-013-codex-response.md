## Findings

**Blocker:** None found in this read-only review.

**Major**

- [commitlint.config.mjs](commitlint.config.mjs:3) does not fully enforce [GITFLOW’s attribution policy](docs/engineering/GITFLOW.md:27). The rule accepts `Assisted-by: Claude`, `Generated-by: Claude`, a split-line `Co-authored-by`, and a bare assistant signature. It rejects a human trailer such as `Co-authored-by: Jane Doe <jane@ai.org>` because it searches the whole trailer, including the email address. Match recognized attribution trailers and signatures by line, inspect the identity field separately from the address, and add both passing and failing edge cases. A name list cannot guarantee detection of every assistant; keep human review as part of the policy.
- [eslint.config.mjs](eslint.config.mjs:35) scopes React hooks and accessibility rules to the three ADR-permitted locations, but has no source-import restriction for React in the pure packages. [ADR 0010](docs/architecture/adrs/0010-monorepo-layout-and-package-boundaries.md:27) assigns source-level import enforcement to BWB-013. Add restricted-import rules for the prohibited packages and a failing fixture.
- [package.json](package.json:19) reports a successful `pnpm typecheck` while no workspace package has a `typecheck` script. Once source is added, require a package tsconfig and script, and test that production TypeScript errors fail the root command. Separately, `projectService` correctly uses the nearest tsconfig, but linting a new `packages/core/src/index.ts` currently fails with “not found by the project service” until that tsconfig includes it. Document or enforce that setup as part of adding a package.

**Minor**

- [commitlint.config.mjs](commitlint.config.mjs:7) has quadratic behavior on long lines containing repeated “Generated with” text and no AI name: a 330 KB local input took about 4.8 seconds. Anchor attribution matching to relevant lines and avoid repeated scans of the remainder of a line.
- [tooling/standards.test.mjs](tooling/standards.test.mjs:27) would catch gutting the tested TypeScript, ESLint, and commitlint rules. It has no failing-case test for Prettier, the Husky hook, the root lint exclusion, React/a11y scope, or source-import boundaries. Add focused checks where those are claimed as BWB-013 enforcement. The bad fixtures are excluded from root lint and Prettier; they currently cannot leak into root typecheck because that command checks no TypeScript.
- [tsconfig.base.json](tsconfig.base.json:4) is a reasonable strict baseline. `types: []` means editor and test packages must explicitly opt into Vite, Node, and test-runner globals. `exactOptionalPropertyTypes` requires deliberate omitted-versus-`undefined` handling in React props and future Zod-derived types. `noPropertyAccessFromIndexSignature` can be awkward with dynamic records, but none is a present defect. Package-specific `lib` and `types` overrides will matter so shared PHP-mirrored code does not silently rely on DOM types.

## Agreements and limits

The local `pnpm lint` and `pnpm format:check` passed. ESLint’s resolved config showed type-aware rules on TypeScript, React/a11y rules in the permitted locations, and `docs/**` ignored. The lockfile records peer ranges supporting the pinned TypeScript 6.0.3 and ESLint 9.39.5 choices; I could not verify current registry compatibility or release dates offline.

The exact-version, one-day release-age, blocked dependency-build-script, and strict Node-engine settings match the stated policy. Husky’s `prepare` runs during install; its installed implementation exits harmlessly when `.git` is absent and can be disabled with `HUSKY=0`. I did not run `pnpm test:tooling` because it creates temporary files, or perform an install or hook invocation under the read-only constraint. The working tree remained clean.