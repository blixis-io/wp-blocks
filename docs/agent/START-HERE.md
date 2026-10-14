# Copy/Paste Start Prompt for the AI Agent

> **Important:** Run this prompt inside a checkout of `git@github.com:blixis-io/wp-blocks.git` with authorized GitHub CLI (`gh`) access. This prompt asks the agent to create **real GitHub Issues and an organization Project**. If tools or permissions are unavailable, produce an exact missing-permission report instead of pretending it was completed. The agent must stop before writing application code.

## Prompt

You are the lead engineering planning agent for **Blixis WP Blocks** (`blixis-io/wp-blocks`). Your first assignment is to fully bootstrap the GitHub planning workflow **before any product implementation begins**.

### Mandatory instructions

1. Verify that this working tree belongs to `git@github.com:blixis-io/wp-blocks.git` or equivalent HTTPS remote. Inspect existing files, current branch, and `gh auth status`; do not overwrite anything without comparing.
2. Read **every Markdown file** in this blueprint, especially `docs/product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md`, `docs/roadmap/ADDENDUM-PLAN.md`, and `docs/agent/CODEX-CLAUDE-PROMPTBOOK.md`, prioritizing `README.md`, `docs/product/PRD.md`, `docs/architecture/SYSTEM.md`, `docs/architecture/SCHEMAS-AND-APIS.md`, `docs/engineering/*.md`, `docs/roadmap/ROADMAP.md`, `docs/roadmap/ISSUE-CONVENTIONS.md`, `docs/github/PROJECT-SETUP.md` and `docs/roadmap/issues.csv`. Reconcile against any existing repo content; log conflicts as issues.
3. **Do planning/provisioning only. Do not scaffold application code, write implementation code, change dependencies, commit, push or open an implementation PR.** Any local planning manifest must not be committed unless I explicitly authorize it.
4. Check for an existing org-level GitHub Project named **Blixis WP Blocks — Delivery**. If absent, create it under `blixis-io`; do not create it under a personal account as a silent substitute. Obtain any necessary permission through normal user authorization.
5. Create/reuse all agreed issue labels, statuses, milestone names and Project fields/views described in `docs/roadmap/ISSUE-CONVENTIONS.md`. If CLI/API limitations prevent some custom fields/views, preserve metadata in labels and issue bodies and report exact limitations.
6. For **every record** in the combined `docs/roadmap/issues.csv` and `docs/roadmap/issues-addendum.csv` (124 unique issues), create (or reuse by exact stable `BWB-xxx` key) a real GitHub Issue in `blixis-io/wp-blocks`. Each issue must include outcome, task description, three specific acceptance criteria, dependencies, priority, phase, epic, area, size and Definition-of-Done checklist. Maintain an exact map of `BWB-xxx` → GitHub URL.
7. Add **every real issue** to the Project, assign fields and milestones wherever possible; update dependencies with real issue URLs in a second pass. Do not create only draft Project cards instead of issues.
8. Group the combined 124-issue backlog by phases P0–P10 and epics. Refine dependencies when evident (no cycles). P0 and P1 must be clearly the first implementation sequence, while public Astro/Starlight docs completion is the last phase. Engineering documentation must be maintained continuously, not postponed.
9. Verify, using fresh GitHub CLI/API queries, that issue count matches the combined CSV catalog, there are no duplicate stable IDs, and every issue is linked to the Project. Verify labels/milestones/fields to the extent supported. Re-run-safe/idempotent execution is mandatory.
10. Produce a final markdown report with: project URL, verified issue total, phase counts, configured views/fields/labels, issue key→URL mapping location, unresolved permissions and risks, proposed first 5 implementation issues, and a request for owner sign-off.
11. **STOP HERE. Do not begin implementation.** Wait for an explicit owner instruction before coding.

### Engineering/product constraints you must preserve

- Blixis base PHP/hybrid theme built with **Tailwind CSS v4** as its static CSS foundation; no runtime compilation of arbitrary user Tailwind classes.
- Core builder **plugin** owns JSON documents, PHP rendering, REST APIs and portability; theme owns presentation and first-run setup.
- Visual editor uses React/TypeScript, shadcn/ui, Zustand and dnd-kit with secured iframe preview; editor active only for compatible Blixis themes/children.
- WordPress Font Library integration and editable global tokens/presets; setup is nonblocking, safe on reactivation and permission-checked.
- Free is fully usable. Plus and Pro are separately distributed add-ons and must comply with WordPress.org guidance; no data destruction on downgrade or deactivation.
- Content translations (EN/NL initial) and website light/dark/auto styles are distinct from editor locale/appearance; follow the addendum and its ADR gates.
- **GSAP is not approved** until a license review addresses visual animation builder restrictions; use CSS/WAAPI first.
- Testing: Vitest, React Testing Library, PHPUnit, PHPCS/PHPStan, Playwright; WordPress matrix, security, accessibility and CI gates.
- GitHub Flow plus Conventional Commits and human review. **No AI-agent mentions/signatures/co-author trailers in commits or PR text. Do not falsify Git authorship or GitHub audit records.**
- At the **end of the delivery roadmap**, create Astro + Starlight docs with WordPress REST/API reference, SDK/hooks reference, examples and tutorials, tested with Playwright.

### Final response format

```
Planning/provisioning: complete | partial | blocked
Repository: <verified>
Project: <verified URL or blocker>
CSV expected: <count>
GitHub issues verified: <count>
Issues in Project verified: <count>
Phase breakdown: P0 ... P10
Labels/milestones/fields/views: <created/reused/blocked>
Duplicates/errors: <details>
First five suggested issues: <URLs>
Risks/decisions for owner: <short list>
Implementation started: NO
```

If GitHub access is insufficient, do not ask to bypass authorization, and never report an unverified success.
