# Security, Privacy, Licensing and Threat Model

## Trust boundaries

1. Browser to WordPress REST: authorization, nonce, schema/payload limits, CSRF and access to unpublished content.
2. Untrusted editor document to PHP HTML/CSS render: sanitization and output escaping; deny executable HTML and event handlers.
3. Canvas iframe to parent editor: strict message schema, origin check, target window identity and restrictive iframe flags as appropriate.
4. Third-party elements and premium plugins: capability registrations, version compatibility, dependency audit and safe fallback.
5. Theme/setup/token storage: roles, input constraints, stored CSS injection and multisite boundaries.
6. Documentation examples: never embed real credentials, license keys, unreleased content or executable untrusted payloads.

## Controls

- Per-route `permission_callback`, object-level WordPress capabilities, current-user checks, REST nonce for cookie auth, no relying on UI state for security.
- JSON schema + payload size/depth limits; escape output, allowlist CSS properties/values/functions, sanitize URL schemes and uploaded MIME types.
- Safe dynamic data providers with query caps; prepared SQL, no arbitrary PHP execution; cache appropriately.
- Content Security Policy where feasible, no unsafe remote scripts, strict dependency pinning and secret scanning.
- Redact tokens/PII from logs, limit retention, opt-in analytics with disclosure, GDPR review before analytics.
- Security advisories policy, severity SLA and responsible disclosure address selected before public launch. Interim channel (owner decision 2026-10-14): private email to the repository owner, published in `.github/SECURITY.md`; replace it with a dedicated address and GitHub private vulnerability reporting before the first public release.

## Dependency and license gates

- WordPress.org Free must comply with GPL-compatible distribution rules and directory policies; maintain license inventory and NOTICE.
- Premium add-ons are independently distributed; review licensing and derivative implications with counsel.
- `dnd-kit`, Tailwind, React, shadcn/ui and all transitive assets require license inventory.
- GSAP adoption is **blocked pending affirmative license review** for a visual animation editor. Prefer Web Animations API/CSS for current scope.
- Fonts: verify redistributable/hosting terms for preset fonts; never bundle fonts by default without license validation.

## Incident planning

Document key compromise, vulnerability reporting, emergency patch pipeline, migration rollback, backups and release revocation procedure before beta.
# Dependency licence exceptions

`tooling/licenses.json` keeps the distributed allowlist broad and conservative. A reviewed exception may be recorded only for an exact ecosystem/package, version and SPDX licence, with a reason and ADR decision reference. The exception applies only to distributed dependencies; changing package identity, version or licence fails the check. Do not add an exceptional licence to `distributed` to bypass package-specific review. Shipped attribution belongs in the generated NOTICE and must be required in distribution packaging.
