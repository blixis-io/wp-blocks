# Handoff: BWB-007 — Document and persistence ADR (architecture review)

Issue: https://github.com/blixis-io/wp-blocks/issues/7 (related: #5, #101, #102, #111)
Mode: READ-ONLY review. No file edits, no commits, no dependency changes.

## Scope
Independently challenge the P0 document model and persistence design. Produce a concrete proposal and a list of risks and questions. Do not implement.

## Files to read
product/PRD.md, product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md, architecture/SYSTEM.md, architecture/SCHEMAS-AND-APIS.md, architecture/WORDPRESS.md, engineering/SECURITY.md, roadmap/ROADMAP.md

## Known inconsistencies to resolve (claimed by orchestrator; verify each)
1. Two incompatible document shapes: addendum `PageDocument` (root: ElementNode, translations map, StyleSet with base/modes/responsive) vs `BuilderDocument` (root: ElementNode[], flat breakpoint style map, no locale/mode).
2. ADR directory: `architecture/adrs/` (SYSTEM.md) vs `architecture/adr/` (promptbook).
3. WORDPRESS.md/SYSTEM.md say native Font Library is "available as of WP 7.0"; verify against official WordPress sources before relying on it.
4. Addendum phase P0 asks for cascade ADR; FR-072 order (tokens → classes → element → mode → responsive) is marked illustrative.
5. Feature matrix has no allocation for translations or light/dark (FR-073 open).

## Required output
- Recommended canonical document schema (TS types) reconciling #1, with where translations and mode overrides live.
- Persistence recommendation (post meta vs custom table vs both), revisions/autosave and locale identity.
- Cascade precedence proposal for mode × breakpoint × pseudo-state, with 5+ conformance cases.
- Top 10 risks ranked, and questions only the human owner can answer.
- Evidence: cite file path and line for every claim about the blueprint.

## Non-goals
Implementation, scaffolding, GSAP, pricing, billing.

## Security requirements
No network calls to third parties beyond the model API. Do not read outside this directory. No secrets.

## Verification
Orchestrator will check cited lines exist and rerun any command Codex reports.

## File ownership
Codex: writes nothing in the working tree. Orchestrator owns coordination/ ledger.
