# Collaboration Ledger (local, uncommitted)

Authoritative records live in GitHub (issues, Project). This ledger only tracks agent coordination.

| Date | Entry | Evidence |
|---|---|---|
| 2026-10-13 | Audit of blueprint: 27 files, 124 unique BWB ids, no missing deps, no cycles | `roadmap/*.csv` |
| 2026-10-13 | Provisioned 31 labels, 11 milestones, 124 issues (#1-#124 = BWB-001..124) in blixis-io/wp-blocks | `coordination/issue-map.json`; script now `coordination/tools/sync_github.py` |
| 2026-10-13 | Created org Project #1 "Blixis WP Blocks — Delivery"; 124 items, fields Status/Phase/Priority/Area/Size/Target set | https://github.com/orgs/blixis-io/projects/1 |
| 2026-10-14 | Codex handoff BWB-007 sent via `codex exec -s read-only` (route: local CLI) | `coordination/handoffs/BWB-007-codex.md`, `coordination/reviews/` |

## Open decisions
See final report to owner.
| 2026-10-14 | Codex response received for BWB-007 (exit 0, model per its log `gpt-6-sol`, read-only sandbox). Proposal only; NOT an approved ADR. Orchestrator evaluation: schema + post-meta-first + locale snapshots accepted as draft input; mode-over-breakpoint tie rule (case 4) and publish-snapshot model flagged for owner decision; Font Library claim unverified by Codex (no network) | `coordination/reviews/BWB-007-codex-response.md`, `BWB-007-codex-run.log` |
| 2026-10-14 | Independence note: Codex reviewed orchestrator-framed inconsistencies; no second independent review of the issue/Project provisioning exists yet | — |
| 2026-10-14 | Bootstrap commit pushed to `main` (author Michael, no AI trailer). BWB-125 added (branch protection follow-up, issue #125) | git log, `roadmap/issues.csv` |
| 2026-10-14 | Facts verified from primary sources: Font Library global (classic themes) from WP 7.0; WP 7.0 min PHP 7.4, recommended 8.3; GSAP licence Prohibited Uses clause (eff. 2025-04-30) | ADR 0001, 0008 |
| 2026-10-14 | ADRs 0001–0008 drafted by orchestrator. Codex review #1 (3 blocker/7 major/2 minor) all accepted and applied; Codex re-review confirmed 10/12 resolved, 2 partly, and found 1 blocker/2 major/1 minor new defects, applied. No unresolved disagreement. The re-review checked orchestrator revisions and is not an approval of the final text | `coordination/reviews/P0-ADR-REVIEW-codex-response.md`, `...REREVIEW...` |
| 2026-10-14 | Pending: a final Codex pass on the fully merged text has not occurred | — |
| 2026-10-14 | Project metadata: all 125 issues assigned to EmVeeNL; statuses corrected (Done #1-3,#103; In Review #4,#5,#7,#8,#101; In Progress #102; Ready #6,#9,#10) | GitHub Project #1 |
| 2026-10-14 | Batch 2 drafted: ADR 0009, THREAT-MODEL, ACCESSIBILITY-BASELINE, UX-JOURNEYS (draft), style-resolution fixtures + verify.py. Codex review: 1 blocker, 7 major, 3 minor, all accepted and applied (fallback classes for premium output, Pro includes Plus, pointer integrity, retention bounds, import/export boundary, WCAG 2.5.7/2.4.13 wording, publish journey). Codex independently re-derived 7 fixture outcomes and confirmed them. Not re-reviewed after fixes | `coordination/reviews/P0-BATCH2-codex-response.md` |
| 2026-10-14 | Owner decisions: Pro includes Plus (OK); fallback classes accepted (yes); appearance default for new sites = `auto`; Translator access, publish UI delegated to orchestrator and recorded in `product/UX-JOURNEYS.md` (locale capability without new role; separate publish actions plus combined shortcut). ADR 0009 -> Accepted | PR #128 |
