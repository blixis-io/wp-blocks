# Git Workflow — GitHub Flow + Conventional Commits

## Branching

- Protected `main` always releasable. No permanent `develop` branch.
- Branch per issue from latest `main`; patterns: `feat/123-canvas-selection`, `fix/184-rest-permissions`, `docs/201-editor-guide`, `chore/4-ci`.
- Use short-lived branches, small reviewable PRs, squash-merge by default (unless releases require alternate decision).
- Never force-push `main`. Require PR review, CI passing and up-to-date branch/merge queue.

## Conventional Commits

`<type>(<scope>): <imperative summary>`

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:

```text
feat(editor): add keyboard element selection
fix(renderer): escape image alt attributes
docs(api): explain element registration
feat(core)!: version document schema
```

Breaking change includes `!` and `BREAKING CHANGE:` footer describing migration. Link `Refs #123` or `Closes #123` in PR body as applicable. Enforce with commitlint or equivalent CI.

## Identity and attribution policy

- **Do not add AI agent names, assistant names, signatures, or `Co-authored-by` AI trailers to commit messages or PR titles/descriptions.** Do not generate "written by AI" footers, badges or promotional metadata.
- Use correct authenticated author/committer identity. **Never spoof a human author, falsify signatures, alter GitHub audit logs, or hide platform-required disclosure.** Platform attribution/audit information may remain visible.
- PR descriptions focus on changes, intent, testing, risks and linked issue, not what tool wrote them.
- No agent pushes directly to protected branches; human review is required for releases and high-risk changes.

## Pull request requirements

- One logical topic per PR, link issue and phase.
- Required sections: **Summary**, **Implementation notes**, **Testing**, **Screenshots** (UI changes), **Security / compatibility / migration impact**, **Linked issues**.
- Include checkboxes for tests, docs, WP backward compatibility, types, migration and accessibility.
- Prefer draft PR for ongoing slices. Only mark ready after local checks pass.
- No secrets, generated dependency trees, private credentials or unapproved license-restricted assets in commits.

## Review, release and hotfix

- CODEOWNERS for editor, PHP, security and docs where possible.
- Require human review on new REST endpoints, untrusted HTML/CSS and licensing decisions.
- Version packages with SemVer; create changelog entries from Conventional Commits, but review manually.
- Patch urgent production fix through branch from main, PR, CI and tagged release; backport only to maintained release branches where policy documents them.

## Enforcement

Branch protection, PR templates, status checks, commitlint, secret scan, CODEOWNERS and required security review. Configure repository rules before implementation begins.

## Temporary procedural safeguards (no branch protection available)

The organisation is on the GitHub free plan and the repository is private, so branch protection and rulesets are not available (the API returns 403). Until BWB-125 is done, these rules are enforced by process instead (the prepared technical rules are in [`BRANCH-PROTECTION.md`](BRANCH-PROTECTION.md)):

- The initial bootstrap commit was the only direct push to `main`. Every later change goes through a feature branch and a pull request.
- No force pushes to `main`; no direct pushes to `main` unless the owner explicitly approves.
- The aggregate `CI` check (`.github/workflows/ci.yml`) must be green before merge; a PR with a red `CI` is not merged. A PR with failing tests is not merged.
- Significant changes (architecture, security, REST, renderer, licensing) need at least one independent review recorded in the PR or `docs/coordination/reviews/`. An agent never counts as the independent reviewer of its own work.
- Commit and PR text follows the identity and attribution policy above.
