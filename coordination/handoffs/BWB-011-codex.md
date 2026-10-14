# Handoff: independent review of BWB-011 (pnpm workspaces and package boundaries)

READ-ONLY, offline. Branch `chore/11-pnpm-workspaces` (uncommitted tree). Issue #11. Read: `architecture/adrs/0010-monorepo-layout-and-package-boundaries.md`, `tooling/boundaries.json`, `tooling/check-boundaries.mjs`, `tooling/check-boundaries.test.mjs`, root `package.json`, `pnpm-workspace.yaml`, `architecture/SYSTEM.md` (Monorepo, Editor sections), ADR 0008/0009.

Questions:
1. Is the dependency graph in ADR 0010 consistent with `SYSTEM.md`, ADR 0005 (style engine shared with PHP via fixtures), ADR 0009 (Plus/Pro use only the public extension API) and PRD NFR-001 (no editor runtime on public pages)? Any missing edge that real code will need soon (e.g. canvas-bridge needing element-registry, style-engine needing capabilities), or any edge that is too permissive?
2. Does `check-boundaries.mjs` have holes: devDependencies/peerDependencies handled? `workspace:` alias forms (`workspace:^`, `npm:` aliases), packages declared in `boundaries.json` but under a different glob, scoped names that merely start with the scope, JSON `exports`/`imports` self-references, a package named like an internal one but external? Could a package bypass checks by omitting package.json?
3. Are the tests meaningful (would they fail if the checker were gutted)? Name any rule without a failing-case test.
4. Root config: `engines`, `packageManager`, `pnpm-workspace.yaml` globs vs declared workspaces, `.gitignore`, `.nvmrc`. Any supply-chain or reproducibility concern (lockfile, install scripts, pnpm settings such as `onlyBuiltDependencies`/`minimumReleaseAge` worth setting now)?
5. ADR 0001 was amended (Node matrix). Is the amendment consistent?

Output: Blocker/Major/Minor with file + section and concrete fix wording; short agreements; what you could not verify.
