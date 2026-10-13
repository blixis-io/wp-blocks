# Public Documentation Plan — Astro + Starlight + Playwright

**Phase:** P10 (final productization), with internal technical documentation written from P0 onward.

## Stack

- Astro + Starlight, Markdown/MDX, TypeScript code examples.
- Playwright for documentation E2E, responsive, smoke and accessibility workflows; use axe where appropriate.
- TypeDoc for exported TypeScript package APIs where stable; manually documented PHP APIs / REST OpenAPI schema and reference generation where feasible.
- Documentation content in `apps/docs` in the monorepo; optionally migrate to separate docs repository in future with ADR.

## Audience / routes

1. `/getting-started`: install requirements, activate theme, install plugin, setup wizard, build first page, publish.
2. `/guide`: editor basics, tree, canvas, controls, responsive design, fonts, global tokens, theme presets, revisions and troubleshooting.
3. `/theme`: Tailwind integration, template anatomy, `theme.json`, child themes, override and compatibility policy.
4. `/developer`: element API, renderer interface, PHP hooks/filters, data adapters, custom inspector controls, design token contracts.
5. `/api`: authenticated WordPress REST API reference with request/response, auth, permissions, status codes and versioning.
6. `/examples`: complete six-element page, custom PHP+TS element, theme preset, dynamic data adapter, safe animation recipe.
7. `/tutorials`: landing page, blog, header/footer (Plus), custom field data (Plus), product display (Pro).
8. `/reference`: schema versions, migrations, config glossary, FAQ, troubleshooting, security disclosures, release notes.

## API documentation acceptance

- OpenAPI artifact from canonical endpoint schemas, validated in CI; examples include curl and TypeScript client snippets.
- PHP element / hook reference has type contracts, lifecycle, escaping and capability notes.
- All public package exports documented and stable release/version labels displayed.
- Premium content marked with plan requirements, but instructions for Free work standalone.

## Playwright plan

- Smoke tests for Starlight routes, navigation/menu/search/sidebars, example tabs, mobile breakpoints and language if available.
- Verify internal links and anchor targets, run external link checks in separate scheduled job with controlled rate limits.
- Test critical tutorial copy-and-run snippets against seeded WP fixtures as integration tests, not merely syntax highlight.
- Screenshots and traces on fail; deterministic fixtures; accessibility: headings, links, keyboard, contrast audit and reduced motion.

## Publishing

Deploy preview on PR, production on release. Configure version selector or clear version notices for breaking changes; robots/sitemap, canonical links, edit-this-page where public contributions supported. Content changes reviewed alongside feature PRs; screenshots from actual builds only.

## Final docs gate

Fresh-site user tutorial succeeds against released zips; API docs match implemented endpoints; samples build; Playwright suite green across desktop/mobile; navigation accessibility and link integrity pass; release notes and support pathways visible.
