Implemented BWB-032 on `feat/32-presets-accessibility`. The tree is uncommitted; I did not push or edit `docs/coordination`.

Added the [preset schema and contrast checker](packages/design-tokens/src/contrast.ts), a committed JSON Schema with a freshness test, and Ocean, Forest, Sunset, and Minimal token seeds. The checker resolves both modes and reports missing, unresolved, unsupported, or low contrast semantic colors. `custom` is an exported ID that starts from the default token set, with no preset file. Tests and the [design-token documentation](docs/architecture/DESIGN-TOKENS.md) cover the contract.

**Passed:** Prettier, lint, type checking, boundaries, 1,178 unit tests, `composer run check`, schema freshness, and `pnpm build`. The preset files passed token validation and accessibility checks in both modes.

**Environment-limited checks:** `pnpm run check` fails in tooling probes because PHPStan cannot open a local socket in this sandbox and pnpm cannot read its local `zod` license index. `node tooling/check-licenses.mjs` fails on that same pnpm index. The direct PHP check passed.