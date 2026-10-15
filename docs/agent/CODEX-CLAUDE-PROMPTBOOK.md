# Blixis WP Blocks — Codex & Claude Code Promptbook

Repository: `git@github.com:blixis-io/wp-blocks.git`  
Language: English · Version: 1.0 · Intended for interactive coding agents operating **inside an authorized checkout**.

## How to use

1. Extract the blueprint into your repository checkout. The docs live alongside the code and are the source of truth until superseded by approved ADRs.
2. Read `docs/product/PRD.md`, `docs/product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md`, `docs/architecture/*.md`, `docs/engineering/*.md`, `docs/roadmap/ROADMAP.md`, `docs/roadmap/ADDENDUM-PLAN.md`, `docs/agent/AGENT-RULES.md` before implementation.
3. Start with **Prompt 01** in either Codex or Claude Code; it creates/reconciles the GitHub project and issues. **Do not use implementation prompts until the planning gate has owner approval.**
4. Run one bounded issue or vertical slice at a time. Do not use two agents simultaneously on the same working tree, branch or GitHub issue. Prefer separate `git worktree` directories per agent and an explicit human integration/review step.
5. Treat prompts as templates. Replace `<ISSUE_KEY>`, `<ISSUE_URL>`, `<BRANCH>`, `<TARGET_VERSION>` before submitting. Do not paste credentials or license keys into chats.

### Required identity and security policy (applies to ALL prompts)

- Follow GitHub Flow and Conventional Commits. Do not mention AI agents, tool names, generated-by signatures, or AI `Co-authored-by` trailers in commit messages or PR titles/descriptions. Never spoof a human identity or erase mandatory attribution/audit metadata. Use the actual configured authenticated Git identity.
- No pushing or PR creation without explicit authorization in the current task. Never push directly to `main`.
- Ask for authorization through normal GitHub auth controls if required. Never pretend a GitHub Project or issue exists; verify with fresh GitHub API/CLI reads.
- Never leak secrets, access production data, bypass capability checks, or execute downloaded scripts without inspection.
- Prefer tests before implementation, especially schema migrations, renderer escaping, REST permissions and cross-mode/locale rendering.
- Cite repository filenames and issue IDs in the final work summary. If blocked, report exactly what is blocked rather than inventing success.

## Prompt 01 — Bootstrap all GitHub Issues and the Project (planning only)

```text
Act as the planning lead for blixis-io/wp-blocks. First inspect this checkout, remote, status and GitHub authentication. Read every blueprint Markdown document, particularly docs/agent/START-HERE.md, docs/product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md and docs/roadmap/ADDENDUM-PLAN.md.

Your ONLY task is to provision/reconcile GitHub planning, NOT to write product code, commit, push or open a PR.

Read BOTH docs/roadmap/issues.csv and docs/roadmap/issues-addendum.csv, validate unique BWB issue IDs and dependencies, and create or reuse a single organization Project "Blixis WP Blocks — Delivery" under blixis-io. Create/reuse real GitHub Issues (not draft cards) for all 124 catalog entries, with description, three testable acceptance criteria, phase, priority, dependencies, labels, milestones, and a Definition of Done. Add every issue to the Project, set available fields and create useful views, including Backlog, By Phase, Current Sprint and Blocked. Resolve dependency references with actual GitHub issue URLs in a second pass. Idempotency: existing issues retain their URLs and history; create only missing IDs. Never silently create a personal project.

Verify expected unique issue count, actual issue count and Project membership from fresh queries. If gh auth/scopes are insufficient, report precise missing permissions and stop. Output Project URL, total count, phase breakdown, issue mapping, discrepancies, blockers and first five suggested P0 issues. Stop and request owner sign-off. Do not start implementation.
```

## Prompt 02 — Audit architecture and produce ADRs (P0, no coding)

```text
Perform architecture discovery for P0 using the PRD and addendum. Inspect actual repo files before proposing changes. Identify decisions about: WordPress/PHP versions, classic vs hybrid theme, canonical JSON schema, element registry, PHP preview parity, Font Library adapter, locale storage and routing, supported multilingual plugin adapters, dark/light/auto website style cascade, persistence of theme preference, REST capability checks, editor iframe security, Free/Plus/Pro entitlement boundaries, GSAP licence constraints under ADR 0013, data portability and accessibility.

Create concise draft ADR Markdown files in docs/architecture/adrs/ with Context, Decision, Alternatives, Consequences, Test Strategy, Rollback and Open Questions. Do not make irreversible choices where owner input is required. Run docs/link lint if configured. Summarize decisions requiring approval, evidence and proposed issue mappings. Do not write implementation code.
```

## Prompt 03 — Implement exactly one GitHub issue (Codex / Claude Code)

```text
Implement ONLY GitHub issue <ISSUE_KEY> / <ISSUE_URL> in blixis-io/wp-blocks.

Read docs/agent/AGENT-RULES.md, the PRD and addendum, applicable architecture ADRs, docs/engineering/TESTING.md, docs/engineering/CODE-STANDARDS.md and docs/engineering/GITFLOW.md. First inspect repository state and existing behavior. State acceptance criteria, changed modules, a test plan and risks before coding.

Use a short-lived feature branch from main (unless already in an isolated worktree). Keep the diff minimal, type-safe, accessible and compatible with existing schema/contracts. Add or update tests for each acceptance criterion. For PHP endpoints include permission, nonce/auth, escaping and negative tests. For visual editor changes include keyboard and focus behavior, and screenshots if relevant. For CSS or translation changes test light, dark, EN, NL and representative breakpoints.

Run targeted tests and relevant lint/type/build commands. Do not claim tests ran if they did not. Update related technical docs/ADRs. Do not include AI signatures/mentions in commit messages or PR descriptions. Do not commit/push/create PR without explicit instruction.

Finish with: changed files, acceptance coverage, commands run with results, risks, open decisions, suggested conventional commit subject, proposed PR summary, and whether review-ready.
```

## Prompt 04 — Schema + renderer contract vertical slice

```text
Design and implement one vertical slice for a Heading element: schema registration → editor control → validated REST storage → sanitized PHP frontend rendering → scoped CSS generation → reopen. Include schemaVersion migration fixtures, unknown element fallback, HTML escaping and deterministic IDs.

Do not add other elements before this contract works. Use shared test fixtures for PHP vs editor-preview parity. Add tests for English/Dutch translatable text and light/dark style overrides, without coupling locale and mode. Link work to explicitly approved issues; do not expand scope silently.
```

## Prompt 05 — Tailwind base theme and onboarding

```text
Implement the Blixis base theme foundation under approved P3 issues. Tailwind v4 is the static base stylesheet, NOT the runtime generator of arbitrary user classes. Use theme.json integration, semantic design tokens, isolated editor CSS, WordPress Font Library adapter and no duplicate fonts. Implement a dismissible, permission-checked first-run setup notice, resumable preset/custom wizard, dark/light token previews and safe option persistence. Theme reactivation must not overwrite prior settings.

Test activation, reactivation, child-theme eligibility, permissions, invalid presets, rollback and frontend output with JS disabled. Document token ownership, CSS variable mapping and fallback behavior.
```

## Prompt 06 — Canvas, dnd-kit and selection

```text
Implement one scoped DnD editor interaction for <ISSUE_KEY>. Use dnd-kit for interaction but execute a domain MoveElement command that validates ancestry, position and element capabilities. Cover structure-tree reorder and iframe canvas coordinate/scroll transformations with tests. Keyboard-based moving is required. Keep undo/redo deterministic and prevent duplicate/nested invalid IDs. Do not use GSAP unless an approved license ADR explicitly permits this product class.

Provide reproducible E2E steps and tests for dragging, invalid drop rejection, keyboard reorder, responsive canvas zoom and undo/redo.
```

## Prompt 07 — Translation workflow

```text
Implement approved translation scope for <ISSUE_KEY> using docs/product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md. Separate editor locale from website content locale. Store translated values by stable element/property IDs, preserve the invariant tree and source revision. Provide EN source and NL target editing, statuses missing/draft/translated/reviewed/stale, manual fallback and preview.

Test: editing source marks Dutch stale without overwriting; changing locale does not change site appearance mode; language-specific save/publish revision semantics; XSS/unsafe links rejected; missing translation fallback; keyboard and RTL readiness. Machine translation is out of scope unless its own approved issue, provider consent and privacy review exist.
```

## Prompt 08 — Website light/dark styling engine

```text
Implement per-website light/dark/auto mode styling, independent of editor chrome, as defined by approved style ADR. Maintain one document tree and sparse style overrides. Provide global light/dark token sets, per-element overrides, reset-to-base, mode toggling and responsive selectors. Do not duplicate translated content or element IDs to achieve dark mode.

Test CSS cascade across global tokens/classes/element/breakpoint/mode/pseudo states, system preference, manual override, no-JS readable fallback, accessible contrast and reduced motion. Demonstrate English/light/desktop and Dutch/dark/mobile with PHP/editor parity fixtures.
```

## Prompt 09 — Security and performance red-team review

```text
Audit the implementation for stored/reflected XSS, REST authorization/capability leaks, CSRF/nonces, insecure iframe postMessage origin, malicious media/URL handling, arbitrary CSS injection, unsafe PHP renderers, third-party element registration, dynamic-query abuse, plugin/theme deactivation behavior, cache data leaks across locale and theme mode, and supply-chain/license risk.

Produce prioritized findings with file/line references, proof-of-concept test cases where safe, remediation issues and regression tests. Do not alter production data, test secrets or external systems. Performance review must compare frontend payloads, CSS sizes and editor responsiveness against repo budgets without inventing metrics.
```

## Prompt 10 — Accessibility and UX audit

```text
Audit editor and rendered frontend against WCAG 2.2 AA target. Cover tab order, focus management, tree semantics, accessible dialogs/shadcn controls, drag/drop keyboard alternatives, color contrast in both website modes, reduced motion, zoom, screen readers, RTL readiness and translated aria-labels. Run automated checks and document manual checks separately.

Create specific GitHub follow-up issues for unaddressed failures only when authorized. Include evidence, reproduction instructions and screenshots for visual issues.
```

## Prompt 11 — Create or review a PR (only when authorized)

```text
Review changes on branch <BRANCH> against the linked issue(s), PRD, addendum and engineering standards. Run tests appropriate to the diff. Confirm no unrelated changes, no secrets, required docs updates, schema backward compatibility, PHP escaping, accessibility and add-on portability. Write a concise PR description with Summary, Linked Issues, Testing (actual commands/results), Screenshots if UI, Security/Compatibility/Migrations and Rollback.

Follow GitHub Flow and Conventional Commits. No AI-assistant references, signatures or co-author trailers in commit/PR prose; do not falsify authorship or platform attribution. Do not publish a PR or push unless current authorization explicitly permits it. If review-only, provide suggested text and findings instead.
```

## Prompt 12 — Sprint / phase triage

```text
Inspect the organization Project and open issues for phase <PHASE>. Use fresh GitHub API/CLI reads. Report Ready, Blocked, In Review and Done issue counts with exact issue URLs. Identify dependency cycles, missing acceptance criteria, flaky test evidence and release blockers. Propose a compact issue order for the next slice. Do not auto-assign work, change status, close issues or implement without authorization.
```

## Prompt 13 — Plan Astro Starlight + Playwright docs (P10)

```text
At the approved P10 milestone, create a docs architecture plan for Astro + Starlight and a Playwright verification suite. Separate audiences: Getting Started, Theme Setup, Visual Editor, Multilingual Content, Website Light/Dark Modes, Elements and Styling, REST APIs, PHP Hooks, TypeScript SDK, Custom Element Tutorials, Premium Extensions, Migration, Security and Troubleshooting.

Generate API reference from versioned source schemas where possible; distinguish public stable vs internal APIs. Define runnable code samples, semantic version selector, translations for docs as scoped/optional work, broken-link checks, screenshots, mobile tests, keyboard/accessibility tests and deployment/versioning strategy. Do not invent endpoints that do not exist. Only implement docs after APIs stabilize and approvals exist.
```

## Prompt 14 — Release readiness and safe migrations

```text
Evaluate release <TARGET_VERSION> against the roadmap gates using actual CI artifacts and commands. Verify install/update/migration/rollback on target WP/PHP matrix; page rendering after theme switch or premium plugin deactivation; site content across locale and light/dark modes; security, license compliance, translations, accessibility, package boundaries, changelog and recovery runbooks.

Produce a go/no-go checklist with evidence links and explicit blockers. Do not tag, deploy, publish or run production migration without separate authorization.
```

## Prompt 15 — Two-agent handoff (Codex → Claude Code, or reverse)

```text
You are reviewing a handoff from another coding session. Inspect git status, branch name, current diff, issue <ISSUE_KEY>, failing/passing tests and existing session notes. Do not assume prior statements are true without checking files and commands.

Review implementation for correctness and hidden regressions, especially type contracts, WordPress security, locale/mode state separation and rendering parity. Do not implement additional scope unless specifically requested. Return an actionable review categorized Blocker/Major/Minor and a small reproduction/test checklist. Keep commit and PR descriptions tool-neutral without falsifying provenance.
```

## Suggested agent-specific repository instructions

**Codex:** Put durable project-wide instructions in `AGENTS.md` referencing `docs/agent/AGENT-RULES.md`, `docs/engineering/*.md` and the PRD/addendum. Keep task-specific work in the chat/prompt; do not duplicate entire PRD into every prompt.

**Claude Code:** Put durable repository instructions in `CLAUDE.md` referencing the same documents. Keep the shared engineering rules identical to those used by Codex; avoid contradictory per-agent instructions. Additional settings and permission controls remain tool-version-dependent and must be checked in the local installation.

**Shared rule:** the Markdown documentation and tests, not agent memory, are the canonical source of truth. Prefer structured issue IDs and ADR references for context.
