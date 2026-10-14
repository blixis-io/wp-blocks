# ADR 0010: Monorepo layout and package boundaries

- Status: Proposed
- Date: 2026-10-14
- Issues: #11 (BWB-011); relates to #13, #15, #17
- Deciders: orchestrator (owner delegated, 2026-10-14)
- Reviewers: Codex (see Review log)

## Context
`SYSTEM.md` sketches a monorepo. Ten-plus packages with no enforced dependency rules tend to drift into cycles and leak editor code (React) into code that also runs in the theme build or is mirrored in PHP. ADR 0008 forbids GSAP; ADR 0009 requires Plus/Pro to use only the public extension API; the public site must never need the editor runtime.

## Decision
1. **pnpm workspaces**, Node 24, `packageManager` pinned in the root `package.json` (pnpm 11.25.0 at decision time), committed `pnpm-lock.yaml`, installs in CI with `--frozen-lockfile`. No workspace package is published to npm (`"private": true` enforced). Package names use the `@blixis/wp-` scope (`STYLEGUIDES.md`).
2. **Layout** (workspace globs in `pnpm-workspace.yaml`): `apps/*`, `packages/*`, `wordpress/*`, `tests/*`, `tooling`. `apps/docs` is reserved for P10 and not created yet. PHP code (Composer) lives inside `wordpress/*`; each is both a workspace package (for JS build assets) and a WordPress distribution (ADR 0009).
3. **Dependency rules are data, not convention.** `tooling/boundaries.json` lists, per workspace, the internal packages it may depend on and the third-party packages it must never depend on. `tooling/check-boundaries.mjs` (run as `pnpm check:boundaries`, tested by `pnpm test:tooling`) fails on: a disallowed internal edge, a missing `workspace:` protocol, a cycle, a package that is not private, an undeclared workspace package, or a forbidden external dependency.
4. **The graph** (arrows point to what a package may import):

```text
core, design-tokens, capabilities           (leaves: no internal deps)
element-registry  -> core
style-engine      -> core, design-tokens
canvas-bridge     -> core
editor-ui         -> core, design-tokens, capabilities, element-registry
apps/editor       -> all of the above
wordpress/theme   -> design-tokens
wordpress/plugin  -> editor, design-tokens      (packages the editor bundle for admin screens)
extension-api     -> core, element-registry, capabilities   (public, versioned contract; types and registration API)
wordpress/plus|pro-> extension-api ONLY
tests/e2e -> core;  tests/fixtures, tooling -> (none)
```

5. **Purity rules.** `core`, `design-tokens`, `capabilities`, `element-registry`, `style-engine`, `canvas-bridge` and `wordpress/theme` must not depend on React, ReactDOM, Zustand or dnd-kit: they are shared with, or mirrored by, PHP and the theme build and must run without a DOM framework. `core` additionally must not depend on Tailwind. Only `editor-ui`, `apps/editor` and `wordpress/plugin` may use React.
6. **Nothing depends on `apps/editor` except `wordpress/plugin`.** Public-page code (theme, rendered output) never imports editor code (PRD NFR-001).
7. **Dependency denylist** (`gsap`, `@gsap/react`) is enforced globally here and extended by CI in BWB-015 with the licence inventory (ADR 0008).
8. **Add-ons depend on the public extension API only** (ADR 0009: paid distributions contain no copy of Builder code). `packages/extension-api` is the one package Plus/Pro may import; it is a contract of types and registration functions, and add-on builds must **externalise** it (the Builder provides it at runtime). Verifying that built add-on artifacts contain no Builder code is a build check in BWB-017/076; this manifest check only restricts what may be declared.
9. **What the checker verifies** (and what it cannot): dependency fields `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`; `npm:` and `workspace:name@range` aliases are resolved before rules apply; the root manifest and `pnpm-lock.yaml` are covered by the GSAP ban (transitive resolutions included); workspace discovery follows `pnpm-workspace.yaml` and must match `boundaries.json` in both directions; a reserved path (`apps/docs`) must be declared the moment it gains a manifest. Source-level import rules (ESLint, BWB-013) and proof that the editor bundle never loads on public pages (build/enqueue checks, BWB-017/044) are separate, later checks.
10. **Node range:** root `engines.node` is `>=24 <25`, matching the CI matrix (ADR 0001); it is widened when Node 26 joins CI. Install-script and release-age policies (`onlyBuiltDependencies`, `minimumReleaseAge`) are decided when the first third-party dependency is added (BWB-013).
11. The boundaries file is changed only through a pull request that explains the new edge; an added edge to a leaf package is the usual reason.

## Alternatives considered
- *Nx/Turborepo with project graph rules:* heavier and more dependencies; the rule set is small enough for a 150-line script. Revisit if build orchestration needs grow (BWB-017).
- *npm/yarn workspaces:* pnpm gives strict resolution (no phantom dependencies), the chosen toolchain in `CI-CD.md`.
- *Separate repositories per package:* breaks atomic changes across schema, renderer fixtures and editor.

## Consequences
- Adding a package means editing `boundaries.json` and `pnpm-workspace.yaml` intentionally; the checker fails otherwise.
- ESLint import rules (BWB-013) will mirror the same graph at the source level; the manifest check is the first line, not the only one.

## Test strategy
`pnpm test:tooling` (20 tests) covers the real repository and generated trees for each violation kind: disallowed edges in every dependency field, Plus/Pro limited to the extension API, React in a pure package, GSAP directly, via `npm:` alias, in the root manifest and in the lockfile, `workspace:` alias smuggling, unknown internal names, protocol rules (`workspace:^` accepted), non-private, wrong name, cycles, duplicate names and unknown allow targets, undeclared packages, directories without manifests, reserved paths, packages outside the pnpm globs, invalid JSON and a missing workspace file. Mutation checks (disabling alias resolution or the denylist) make the suite fail. CI runs `pnpm check:boundaries` on every PR (BWB-015).

## Rollback
Remove the rules or replace the checker with a project-graph tool by superseding ADR; no runtime impact.

## Open questions
- Whether `wordpress/plus` and `wordpress/pro` should live in the same repository long term (ADR 0009 allows separate build outputs; secrets/source exposure for paid code is a CI concern, BWB-015).
- The root `LICENSE` file and per-package `license` fields (`GPL-2.0-or-later`) are provisional until counsel confirms the licensing model (ADR 0009, BWB-074).

## Review log
- 2026-10-14 orchestrator draft.
- 2026-10-14 Codex review (`docs/coordination/reviews/BWB-011-codex-response.md`): Blocker (Plus/Pro depended on Builder internals) accepted — `extension-api` package and externalisation rule; Major (alias bypass, workspace discovery, root/lockfile not covered) accepted and implemented; Minor (test gaps, Node range) accepted. Codex could not run the fixture tests (read-only sandbox, EPERM on temp dirs); the orchestrator ran all 20 locally. Codex noted `canvas-bridge -> element-registry` and `style-engine -> capabilities` are not established needs; they are not added.
- 2026-10-14 BWB-027 amendment: `tests/fixtures` may depend on `design-tokens` and `style-engine` (besides `core`). It is test support, not shipped code, and it hosts the cross-language contract suite that runs the golden compile fixtures through the libraries they describe (docs/engineering/FIXTURES.md). No production package depends on it.
