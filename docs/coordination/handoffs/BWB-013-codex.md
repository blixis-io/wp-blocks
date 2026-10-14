# Handoff: independent review of BWB-013 (TypeScript, ESLint, Prettier, commitlint)

READ-ONLY, offline. Branch `chore/13-ts-tooling` (uncommitted tree). Issue #13. Read: `tsconfig.base.json`, `eslint.config.mjs`, `commitlint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.husky/commit-msg`, root `package.json`, `pnpm-workspace.yaml`, `tooling/standards.test.mjs`, `tooling/fixtures/**`, `docs/engineering/CODE-STANDARDS.md` (Tooling section), `docs/engineering/GITFLOW.md` (identity and attribution policy), `docs/architecture/adrs/0010-*.md`.

Questions:
1. `commitlint.config.mjs` `no-ai-attribution`: false negatives (e.g. other trailer spellings, "Assisted-by", model names, signature emoji, uppercase/lowercase, multi-line) and false positives against legitimate human commits? Does it implement GITFLOW.md's policy without over-reaching? Is regexp backtracking a risk?
2. `eslint.config.mjs`: are type-aware rules correctly scoped (TS only), `projectService` correct for a monorepo with no TS packages yet, React/a11y rules scoped to the packages ADR 0010 allows? Anything that will break when the first real package is added (e.g. files not in any tsconfig)? Is `docs/**` ignored appropriately?
3. `tsconfig.base.json`: options sensible for the stack (Vite/React editor, packages shared with PHP fixtures)? `types: []`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes` pitfalls with React or Zod later?
4. Tests: would they fail if the configs were gutted? Which enforcement has no failing-case test (e.g. prettier, husky hook, `lint` ignore pattern for `tooling/fixtures/bad`)? Could the "bad" fixtures leak into `pnpm lint`/`typecheck`/`format:check`?
5. Supply chain: `savePrefix`, `minimumReleaseAge`, `onlyBuiltDependencies: []`, `engine-strict`, husky `prepare` script in CI/fork contexts, TypeScript 6.0.3 / ESLint 9.39.5 pins and the stated peer-dependency reasons (cannot verify offline: say so).

Output: Blocker/Major/Minor with file + fix wording; short agreements; what you could not verify.
