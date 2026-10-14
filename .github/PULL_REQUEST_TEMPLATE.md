## Summary

<!-- What changes and why, in a few sentences. -->

## Implementation notes

<!-- Key decisions, trade-offs, anything a reviewer should look at first. -->

## Testing

<!-- Actual commands run and their results. State what was NOT tested. -->

## Screenshots

<!-- UI changes only: before/after, light and dark website mode, both content locales if relevant. -->

## Security / compatibility / migration impact

<!-- Permissions, escaping, REST routes, schema or data changes, WordPress/PHP version impact, rollback. Write "None" if none. -->

## Linked issues

<!-- Closes #n only for issues this PR fully completes; Refs #n otherwise. Include the BWB key and phase. -->

## Checklist

- [ ] Tests added or updated at the right level; `pnpm check` and `composer run check` pass
- [ ] Docs updated (ADR, standards, user or developer docs as relevant)
- [ ] WordPress / PHP backward compatibility considered (ADR 0001 floors)
- [ ] Types are strict; no `any`, `@ts-ignore` or disabled lint rules without a linked reason
- [ ] Schema or data change has a migration and fixture, or none is needed
- [ ] Shared data is registered in `tests/fixtures/contracts.json`; if this PR delivers a PHP side, the suite's `php.level` is promoted
- [ ] Accessibility considered (keyboard, focus, labels, contrast in both website modes)
- [ ] No secrets, tokens or unapproved licences (GSAP is not approved)
- [ ] Commit messages and PR text follow the attribution policy in `docs/engineering/GITFLOW.md`
- [ ] Independent review requested for significant changes (architecture, security, REST, renderer, licensing)
