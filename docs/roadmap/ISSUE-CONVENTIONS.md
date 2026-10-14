# GitHub Issue Conventions

`issues.csv` is canonical for initial provisioning, not a claim that any remote Issues already exist.

## Fields

- `id`: stable external key, e.g. `BWB-001`; preserve in title prefix and issue body for idempotency.
- `phase`: `P0..P10`; `epic`: parent workstream; `priority`: P0 (blocker), P1 (required), P2 (nice-to-have).
- `depends_on`: pipe-delimited stable keys resolved to remote issue URLs after creation.
- `acceptance`: machine-delimited (` | `) outcome statements that must be pasted as checklist items.
- `size`: XS/S/M/L rough relative effort; estimates are illustrative.

## Required issue body

```md
## Outcome
[summary]

## Acceptance criteria
- [ ] [criterion]

## Dependencies
- BWB-xxx ([URL resolved during provisioning])

## Delivery notes
Phase: Pn · Epic: ... · Priority: ... · Size: ...

## Verification
- [ ] Tests and relevant docs updated
- [ ] CI green
- [ ] Meets definition of done
```

## Labels

- `phase:P0` ... `phase:P10`
- `type:feature`, `type:task`, `type:docs`, `type:security`, `type:test`, `type:infra`, `type:research`
- `priority:P0`, `priority:P1`, `priority:P2`
- `area:theme`, `area:editor`, `area:core`, `area:wordpress`, `area:css`, `area:premium`, `area:docs`, `area:dx`, `area:security`
- `status:blocked` only as a fallback when Projects status unavailable.

## GitHub Project fields

- `Status`: Backlog, Ready, In Progress, In Review, Blocked, Done
- `Phase`: P0 to P10
- `Priority`: P0, P1, P2
- `Area`: Theme, Editor, Core, WordPress, CSS, Premium, Docs, DX, Security
- `Size`: XS, S, M, L
- `Target`: MVP, Free 1.0, Plus, Pro, Docs 1.0

Use a single Project `Blixis WP Blocks — Delivery`. Create optional milestone per phase and attach issue accordingly. Project views: Roadmap (phase), Board (status), Backlog (priority), By Area, Blocked. If custom field creation is unavailable, preserve metadata using labels/milestones and issue bodies; log limitation, do not pretend completed.
