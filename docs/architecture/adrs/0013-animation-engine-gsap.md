# ADR 0013: Animation engine — GSAP

- Status: Accepted (owner decision, 2026-10-15)
- Date: 2026-10-15
- Issues: #87 (BWB-087), #88 (BWB-088), #203 (BWB-203)
- Deciders: owner (licence authority)
- Supersedes: ADR 0008 GSAP prohibition and the GSAP portions of ADR 0010

## Context

Blixis needs an animation engine for editor preview/timeline work and the separately distributed Plus/Pro animation add-on. The owner explicitly approved GSAP on 2026-10-15 and accepted the associated legal risk. This closes BWB-087 and unblocks BWB-088 and BWB-203.

The GSAP Standard No Charge licence is not an OSI-approved or GPL-compatible licence. It includes a clause restricting use in tools that compete with Webflow-style visual animation builders. Blixis is such a visual builder, so the accepted use carries legal risk. This owner decision records acceptance of that risk; it does not resolve the licence question. Counsel should review the exact product use before commercial release.

## Decision

1. GSAP is approved only in `apps/editor` (editor preview/timeline) and in a separately distributed Plus/Pro animation add-on, or through an optional user-initiated download. A future `packages/animation-runtime` may host the allowed runtime. GSAP is not added by this ADR.
2. GSAP is not bundled in the Free plugin zip distributed on WordPress.org, the Blixis theme, or the framework-free packages `core`, `style-engine`, `element-registry`, and `canvas-bridge`. It is banned in `wordpress/plugin`, `wordpress/theme`, all other packages and workspaces, and root tooling. The `@gsap/*` scope remains banned unless a future explicit workspace exception is recorded.
3. The document model retains an engine-neutral animation schema. A CSS/WAAPI runtime must remain viable for the Free plugin.
4. Reduced motion is honoured in every editor and frontend runtime (BWB-120).
5. Any future GSAP dependency must use an exact pinned version and the scoped licence exception mechanism in ADR 0012 and `tooling/check-licenses.mjs`. Review the licence terms and version on every major upgrade. `LicenseRef-GSAP-Standard-No-Charge` is the SPDX custom reference; it is not represented as an OSI/GPL-compatible identifier.
6. The dependency and source policy becomes a path-scoped allowlist: `gsap` only in the approved workspaces; `@gsap/*` remains denied by default. CI must fail for dependency declarations, imports, vendored files or loads in banned locations.

## Alternatives considered

- CSS and WAAPI only: retained as the Free-compatible fallback, but does not meet the advanced editor timeline needs by itself.
- Do not use GSAP: rejected by the owner decision, with the legal risk explicitly accepted.

## Consequences

The premium animation add-on must remain separately distributed and cannot make Free output depend on GSAP. Stored animation data remains engine-neutral. The owner-accepted legal risk remains open for counsel review before commercial release.

## Test strategy

Boundary tests prove GSAP passes in `apps/editor`, fails in `wordpress/plugin` and other banned paths, and that `@gsap/*` remains denied. ESLint enforces source import scope. Licence tests prove the custom `LicenseRef` exception is exact to package, version, licence and ADR reason. Reduced-motion coverage is required under BWB-120.

## Rollback

Supersede this ADR with an owner decision withdrawing approval. Remove GSAP use, preserve the engine-neutral schema, and use the CSS/WAAPI runtime in Free and editor contexts as required.

## Open questions

- Counsel review of the visual-builder restriction before commercial release.
- Exact GSAP version and licence text review when the dependency is introduced; no dependency is added by this decision.
