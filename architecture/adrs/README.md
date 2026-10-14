# Architecture Decision Records

Location: `architecture/adrs/` (canonical; supersedes the `architecture/adr/` spelling in the promptbook).
Naming: `NNNN-short-title.md`. Template: [0000-template.md](0000-template.md).

## Status values
- **Proposed** — drafted, not yet reviewed.
- **Reviewed** — independent review recorded (see `coordination/reviews/`), awaiting owner decision where one is required.
- **Accepted** — decision binding. Either approved by the owner in writing, or routine and independently reviewed.
- **Superseded** — replaced by a newer ADR.

A Codex review is an input, not an approval. Disagreements and their resolution are written into the ADR's "Review log".

## Index

| ADR | Title | Issue | Status |
|---|---|---|---|
| 0001 | Supported environments | #4 | Reviewed (owner to confirm PHP 8.2 floor) |
| 0002 | Theme architecture | #5 | Accepted |
| 0003 | Document model and persistence | #7 | Accepted (post-meta storage conditional on BWB-040 spike) |
| 0004 | Publication model and revisions | #7, #101 | Accepted (owner decision 2026-10-14) |
| 0005 | Style resolution and CSS output | #102 | Accepted (owner decision 2026-10-14) |
| 0006 | Locale storage and routing | #101 | Accepted (owner may change unpublished-locale 404 default) |
| 0007 | Free / Plus / Pro allocation for translation and appearance modes | #103 | Accepted (owner decision 2026-10-14) |
| 0008 | Dependency licensing and GSAP | #8 | Reviewed (owner action: legal review before any GSAP use) |
| 0009 | Distribution and package boundaries | #6 | Accepted (owner decision 2026-10-14) |
