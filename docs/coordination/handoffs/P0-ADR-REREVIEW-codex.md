# Handoff: verification re-review of revised ADRs 0001, 0003, 0004, 0005, 0006, 0008

Mode: READ-ONLY, offline. Branch `docs/p0-architecture-adrs` (uncommitted working tree).
Your earlier review: `coordination/reviews/P0-ADR-REVIEW-codex-response.md`. The orchestrator revised the ADRs to address findings 1–12 (see each ADR's "Review log").

## Task
For each of your findings 1–12, state: **resolved / partly resolved / not resolved**, with the ADR section and a one-line reason. Then list any NEW defects introduced by the revisions (especially: the expanded `@layer` order vs the lexicographic key in ADR 0005 §1/§3; `auto` media-query selectors; class precedence moved to a site-wide class list; default-locale stream and `sourceHash`/`sourceContentRevision`; per-stream post-meta rows with compare-and-swap; by-value global class snapshots; tokens live and unpinned). Walk the owner worked example (base black, mobile gray, dark white, dark+mobile light gray) through the final algorithm AND the emitted layers for contexts light/desktop, light/mobile, dark/desktop, dark/mobile, and dark/mobile with and without the dark+mobile rule, and dark/mobile/hover.
Be concise. Blocker/Major/Minor for new defects only.
