# Implementation prompt for Claude Code and Codex

Read README.md, catalog.json, schemas/, and all element definitions. Claude Code is the project coordinator; Codex is technical implementation/reviewer when genuinely available. Do not claim cross-agent reviews without evidence.

1. Audit every element and tier against approved PRD; propose an ADR for registry schema, renderer contracts and capability model.
2. Pin Solar version, validate icon IDs, replace unknown IDs with valid icons. Provide CC BY 4.0 attribution.
3. Define versioned instance JSON Schema, discriminated unions in TypeScript, and a PHP schema/metadata adapter, including safe migrations.
4. Implement Free-first vertical slice: section, container, heading, paragraph, button, image, nav-menu, responsive/light/dark styles and locale content.
5. Write schema tests, PHP output safety tests, a11y interaction tests, visual regression checks, Playwright insert/save/reopen tests.
6. Provision GitHub issues idempotently by stable registry IDs and align them to current project, without overwriting existing issues.
7. Do not implement source code copied from shadcn/interior docs without verifying its license. Treat GSAP as optional and license-sensitive.
8. Maintain Conventional Commits and GitHub Flow. PR and commit descriptions must remain factual, without unnecessary AI brand statements or falsified metadata.

Before coding, return a gap analysis and an ordered issue plan to the product owner.
