# Supplemental Backlog Integration

The original `roadmap/issues.csv` contains **100** issues (`BWB-001`–`BWB-100`). This addendum introduces **24** additional issues (`BWB-101`–`BWB-124`) in `roadmap/issues-addendum.csv`.

**Important:** The provisioning agent MUST read both CSV files, de-duplicate on stable ID across the union and create/reuse **124 unique issues**, unless approved changes to the backlog are documented. The supplemental CSV has concise acceptance criteria; expand each issue into at least three testable criteria and a Definition of Done on creation. The agent must not create implementation code before the issue + project inventory is verified.

Set phase/milestone according to the `phase` column and connect each dependency as an actual issue URL in a second pass. If existing GitHub issues have already been provisioned, add only the missing 24 by ID. Do not delete/recreate old issues or close issues merely to match a count.

The free MVP must not claim translation plugin compatibility before adapter tests exist. Treat provider-based auto-translation as optional future scope and protect user data.
