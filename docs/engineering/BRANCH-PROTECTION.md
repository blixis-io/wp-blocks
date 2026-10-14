# Branch protection plan

Status: **prepared, not applied.** GitHub returns 403 for rulesets and branch protection on a private repository in an organisation on the Free plan ("Upgrade to GitHub Pro or make this repository public to enable this feature"). Until that changes, the procedural safeguards in [`GITFLOW.md`](GITFLOW.md) apply. Enforcement is tracked by BWB-125.

## What will be enforced

`.github/rulesets/main.json` (a repository ruleset, ready to import) protects `main`:

| Rule | Effect |
|---|---|
| `deletion`, `non_fast_forward` | `main` cannot be deleted or force-pushed |
| `required_linear_history` | squash or rebase merges only (matches GITFLOW) |
| `pull_request` | every change goes through a PR; stale approvals are dismissed on new pushes; the last push must be approved by someone other than its author; review threads must be resolved; code-owner review is required (`.github/CODEOWNERS`) |
| `required_status_checks` | the aggregate `CI` check (`.github/workflows/ci.yml`) must pass on an up-to-date branch |
| `bypass_actors: []` | nobody, including administrators, bypasses the rules |

## Single-maintainer caveat

With one maintainer, "one approval by someone other than the last pusher" cannot be met by the author. Pick one before applying:

1. **Add a second reviewer** (recommended): another maintainer or a trusted collaborator with write access.
2. **Relax review, keep the rest:** set `required_approving_review_count` to `0` and `require_last_push_approval` / `require_code_owner_review` to `false`. PRs, green CI and linear history stay mandatory. Independent review (for example the recorded Codex reviews in `docs/coordination/reviews/`) then remains a procedural rule, not a technical one.

Do not add the owner as a bypass actor to get around the first option: a bypass makes the review rule decorative.

## Applying it (when the plan or visibility allows)

```bash
gh auth status                                   # needs admin on blixis-io/wp-blocks
gh api -X POST repos/blixis-io/wp-blocks/rulesets --input .github/rulesets/main.json
gh api repos/blixis-io/wp-blocks/rulesets        # confirm it is listed and "enforcement": "active"
gh api repos/blixis-io/wp-blocks/rules/branches/main --jq '.[].type'   # rules that apply to main
```

Verification (use a throwaway branch and PR, never `main`):

- A push directly to `main` is rejected.
- A PR with a failing `CI` cannot be merged; a PR whose branch is behind `main` must be updated first.
- A force push to `main` is rejected.
- A PR touching `.github/` requests the code owners.

Then remove the "Temporary procedural safeguards" section from `GITFLOW.md`, update `CI-CD.md`, and close BWB-125.

## Rollback

`gh api -X DELETE repos/blixis-io/wp-blocks/rulesets/<id>` (find the id with the list call above). Record the reason in the ledger.

## Repository settings already applied

Actions: default workflow token is read-only, Actions cannot approve pull requests, and actions must be pinned to a commit SHA. These work on the Free plan and are not part of the ruleset.
