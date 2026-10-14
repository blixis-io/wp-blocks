# Handoff: independent review of batch 2 (ADR 0009, threat model, accessibility baseline, UX journeys, style fixtures)

READ-ONLY, offline. Uncommitted working tree on branch `docs/p0-fixtures-boundaries-threat-model`. Issues: #6, #9, #10, #102.

## Review
1. `tests/fixtures/style-resolution/cases.json` + `verify.py` against ADR 0005 (read §1, §3 carefully). Are the expected values in `cases.json` correct per the ADR (re-derive at least 6 cases by hand, including `state-beats-layer`, `class-state-vs-later-class-base`, `dark-mobile-hover-most-specific`)? Does `resolve_by_layers` faithfully simulate the ADR's emitted layer order and emission sort, or does it share a bug with `resolve_by_key`? Anything the verifier cannot catch that the ADR claims? Is the `autoMode` table consistent with ADR 0005 §3 selectors?
2. `architecture/adrs/0009-distribution-and-package-boundaries.md`: consistent with ADR 0007/0008, `FEATURE-MATRIX.md`, WordPress.org guidelines as quoted (cannot verify offline: flag), and with the lifecycle invariants? Any loophole that would put locked features in Free or leave a blank page on add-on removal?
3. `engineering/THREAT-MODEL.md`: missing assets/threats/controls given ADR 0003/0004/0006 (e.g. publish pointer tampering, snapshot retention abuse, locale capability, REST enumeration, export/import)? Any control that is vague or not testable?
4. `engineering/ACCESSIBILITY-BASELINE.md`: WCAG 2.2 criteria cited correctly (2.4.11, 2.4.13, 2.5.7, 2.5.8, 3.2.6, 3.3.7)? Gaps?
5. `product/UX-JOURNEYS.md`: contradictions with ADR 0004 or the PRD; unstated assumptions; acceptance criteria that cannot be tested.

## Output
Blocker/Major/Minor with file + section, a concrete failure scenario and fix wording. Then a short list of agreements. State what you could not verify.
