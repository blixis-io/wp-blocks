All four “New defects” are **resolved in the written ADR contracts**:

| Defect | Result | Section |
|---|---|---|
| Source comparison target | Resolved | [ADR 0004 §3](architecture/adrs/0004-publication-model-and-revisions.md:30) names the default-locale snapshot used for comparison and fallback; §5 retains referenced source snapshots. |
| Class edits vs layout revision | Resolved | [ADR 0003 §1](architecture/adrs/0003-document-model-and-persistence.md:53) adds `classRefs`/`classVersion`; [ADR 0004 §3](architecture/adrs/0004-publication-model-and-revisions.md:33) uses them for pending detection. |
| Combined Publish shortcut | Resolved as a contract | [ADR 0004 §7](architecture/adrs/0004-publication-model-and-revisions.md:46) requires combined preflight and one pointer advance. Post-meta atomicity still depends on the previously noted BWB-040 spike. |
| Determinism inputs | Resolved | [ADR 0005 §3](architecture/adrs/0005-style-resolution-and-css-output.md:59) names class definitions, token version, breakpoints and compiler version. |

**New Major defects from these edits:**

1. [ADR 0004 §3](architecture/adrs/0004-publication-model-and-revisions.md:33) never says when `classRefs` is refreshed after layout publication. If it retains the old versions, the layout remains pending after a successful publish. Specify the refresh and its revision/CAS behavior.
2. The same pending check misses **global class reorder or deletion**: [ADR 0005 §1](architecture/adrs/0005-style-resolution-and-css-output.md:25) makes list order affect precedence, while [ADR 0003 §1](architecture/adrs/0003-document-model-and-persistence.md:61) only requires a per-class version bump for an edit. Version the ordered list or explicitly mark affected layouts pending.
3. Non-default rendering now uses the **currently published** default-locale snapshot for fallback ([ADR 0004 §3](architecture/adrs/0004-publication-model-and-revisions.md:31)), but the [cache key in §Consequences](architecture/adrs/0004-publication-model-and-revisions.md:56) omits its revision. Publishing new source text can leave a cached fallback stale. Add the current default-locale published revision to that key.