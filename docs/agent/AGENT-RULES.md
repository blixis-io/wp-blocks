# Project Rules for AI-Assisted Development

**These rules apply to every agent session working in the repository.**

1. Read `README.md`, `docs/product/PRD.md`, `docs/architecture/SYSTEM.md`, engineering guidelines, and the current phase/issues before changes.
2. The initial bootstrap is **planning-only**. Do not edit product source, scaffold packages, commit or open implementation PR until backlog is created, verified and owner authorizes coding.
3. Never claim to have created remote artifacts without verifying their URLs and contents.
4. Do not create duplicate issues: match `BWB-xxx` prefixes and reuse existing Project entries.
5. Work from a real assigned issue; branch per issue, follow GitHub Flow, keep main protected.
6. Use Conventional Commits. Do **not** mention AI agents/tools as authors/co-authors in commits or PR titles/bodies. Never falsify Git/GitHub author metadata or bypass platform audit trails.
7. Tests and docs are part of the issue Definition of Done; never disable checks to manufacture green status.
8. Keep theme presentation separated from plugin business logic and saved content. Editors require compatible theme, storage/render fallback survives theme switches.
9. Keep JS editor out of public frontend; validate all documents, REST calls, iframe messages and CSS values.
10. GSAP is approved only under ADR 0013: `apps/editor` and the separately distributed Plus/Pro animation add-on (or optional user-initiated download); never bundle it in Free, the theme, or framework-free packages. Keep its version pinned and use the scoped licence exception.
11. Pause on ambiguous security, licensing, architectural or backward-compatibility decisions; document options as ADR/issues for owner review.
12. After each task report issue URL, branch/PR URL when applicable, tests run, risks and remaining blockers accurately.
