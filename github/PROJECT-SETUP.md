# GitHub Project & Issue Provisioning Runbook

## Prerequisites

Work in cloned `git@github.com:blixis-io/wp-blocks.git`. Verify remote and auth:

```bash
git remote -v
gh auth status
gh repo view blixis-io/wp-blocks
gh project list --owner blixis-io
```

`gh` may require additional `project` authorization. Use `gh auth refresh -s project` **with user's permission** when needed; org permission to create Projects may be restricted. Ask for access rather than silently switching to a personal project.

## Mandatory order

1. `git status` and repo inventory: do not overwrite existing configuration.
2. Read all local blueprint Markdown and `roadmap/issues.csv`; check for existing stable `BWB-` issue keys and Projects first.
3. Create repo labels by phase/type/area/priority if absent (`gh label create ... --force` only when acceptable).
4. Create/reuse the organization project `Blixis WP Blocks — Delivery` (`gh project create --owner blixis-io --title 'Blixis WP Blocks — Delivery'`).
5. Create/reuse phase milestones through GitHub API if available.
6. Provision each issue **as a real GitHub Issue**, never draft Project items. For example:

```bash
gh issue create --repo blixis-io/wp-blocks --title 'BWB-001: Audit repository and constraints' \
  --body-file /tmp/bwb-001.md --label 'phase:P0,priority:P0,type:task,area:dx'
```

7. Add created issue URLs to project with `gh project item-add <number> --owner blixis-io --url <issue-url>`.
8. Resolve `depends_on` keys to issue URLs in issue bodies (second pass), populate project fields/views/milestones where permissions support them.
9. Reconcile counts and verify each CSV row corresponds to exactly one open/closed issue, each issue belongs to Project; report any errors/duplicates.
10. **STOP**. No application code, package scaffolding, git commit or PR until backlog review/authorization.

## API and idempotency

Discover project ID/number from actual `gh project list` output; do not assume a project number. Use `gh project field-list`, `gh project item-list` and relevant `gh api graphql` if setting custom fields via CLI is insufficient. GitHub REST issue endpoints, GraphQL Projects and org rulesets need appropriate access.

Match existing Issue by exact `BWB-xxx` prefix before creating anything. If project already exists, reuse it. Maintain a local provisioning audit/manifest with issue URLs, project URL, failures and field mappings; redact auth tokens.

## Completion report

Show repository URL, Project URL, total expected and verified issue count, epics/phases/milestones, fields/views configured, unresolved blockers, any skipped/duplicate IDs, and a note: **"Planning phase complete. No implementation code was written."** Only assert successes verified via GitHub API.
