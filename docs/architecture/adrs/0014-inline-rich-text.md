# ADR 0014: Inline rich text

- Status: Accepted
- Date: 2026-10-16
- Issues: #207 (BWB-135)
- Deciders: owner (Tiptap approval), orchestrator (stored model)
- Reviewers: none recorded

## Context

Heading, text and button labels are currently plain translated strings. Stage 1 adds inline emphasis and selected-text styling without an editor interface. Stored values must remain portable JSON, preserve old strings indefinitely, render safely in PHP, and work with the existing content stream and CSP. Editor chrome and website presentation remain independent.

## Decision

Translatable properties explicitly declared `kind: text`, `inline: true` may contain either the existing plain string or `{v:1,inline:[...]}`. Inline nodes are flat text runs `{t:'text',s,m?}` or breaks `{t:'br'}`. Marks are order independent and deduplicated: `strong`, `em`, `u`, `s`, `code`, `link {href,newTab?}`, and `style {color?,highlight?,weight?}`. `span` is not a stored mark; style is the only source of mark span classes. Color/highlight values are design token ids, never CSS values. Link URLs use the shared safe URL policy. The limits are 5,000 nodes, 20,000 Unicode characters, 8 marks per text node, 2,048 URL characters and 64 characters per token id. Text nodes are nonempty, UTF-8 well formed and contain no controls, including LF; line breaks use `{t:'br'}`. JSON `1.0` is parsed as a number by JavaScript and as a float by PHP, so both accept integral `1.0` as version 1 (and reject other values).

The per-locale `translations[locale][elementId].values[prop]` slot holds either representation. Layout data and stream identity do not change. Plain strings render exactly as before. PHP validates rich values and emits fixed semantic markup, escaping all text/attributes through `Render\\Escape`. Nesting order is link, style span, then strong/em/u/s/code. Invalid reader values degrade to escaped plain text. Button labels omit link marks. Mark classes are fixed `blx-mc-*`, `blx-mh-*`, and `blx-mw-*` names and never use inline styles.

Only registered inline text properties accept rich values. Heading text, text text and button label declare the inline extension; button's manifest limits marks to strong, em, underline, strike, code and style. The `set-translation` command validates rich values using the registry hook and retains normal apply/undo semantics. Validation enforces shape, allow-lists, URL policy, limits and token-id syntax/length. Rendering omits style marks that reference ids absent from an active token set supplied in render context; CSS generation emits rules only for known active tokens.

Stage 2 uses Tiptap core and ProseMirror, both MIT; no paid Tiptap extensions. The editor engine runs in a lazy `richtext.js` script in the canvas document, with the response nonce under `script-src 'nonce-…'`, and sends model updates over the existing MessagePort. It maps ProseMirror JSON to this whitelist and back; HTML is never stored or rendered, and unknown nodes/marks are dropped. This keeps selection and IME input in the canvas document and avoids an overlay coordinate/IME bridge. The lazy bundle budget is under 200 KB gzipped. Stage 2 must provide keyboard-accessible toolbar and selection controls, preserve native IME composition, and test screen-reader labels, focus, and selection restoration. If CSP or bundle measurements make this infeasible, the fallback is an editor-chrome overlay using the same mapper and MessagePort contract.

## Security threats and mitigations

| Threat | Mitigation |
|---|---|
| Stored XSS through text, markup, entities or invalid UTF-8 | Text-only model, UTF-8 validation, output escaping, no stored HTML |
| Unsafe link scheme or browser URL normalization | shared safe URL policy; reject controls, whitespace tricks, protocol-relative URLs and entity references |
| CSS injection or style attribute bypass | token ids and enumerated weights only; fixed generated classes; CSP continues to block inline style attributes |
| Resource exhaustion | fixed node, character, mark and URL limits in TS and PHP |
| Locale or appearance confusion | values remain in locale streams; mark CSS uses website light/dark token sets and does not alter editor chrome |
| Editor mapper imports active content | Stage 2 whitelist maps ProseMirror JSON; drops unknown nodes/marks; HTML is never accepted |

## Alternatives considered

- Store HTML: rejected because it is difficult to validate, non-portable and creates an XSS boundary.
- Store arbitrary CSS colors: rejected because it bypasses design tokens and CSS validation.
- Add a new content stream: rejected because inline values belong to the existing translated property slot.
- Run Tiptap in the editor chrome: retained only as fallback; it complicates canvas selection, IME and coordinate handling.

## Consequences

Old string documents remain valid permanently. Rich values add bounded JSON to locale content streams and revisions/snapshots/export carry it unchanged. Token references must resolve against the active token set before classes are compiled. The current token schema does not define a contrast fallback, so highlight CSS must not invent one. A content envelope permits 50,000 JSON values; a maximum-size rich value uses roughly 20,000 text values plus node/mark values, so one envelope can contain about two maximum-size rich values before the global value cap. Stage 1 does not add editing UI; Stage 2 owns Tiptap integration and the 200 KB gzipped budget measurement.

## Test strategy

Shared fixtures drive Vitest and PHPUnit validation. Tests cover malicious text and URLs, token and mark allow-lists, limits, exact escaped HTML output, safe invalid-value degradation, plain/rich conversion and normalization. Registry/manifest parity and command apply/undo are tested. CSS generation must emit only classes for active color token ids in the `blx.marks` cascade layer and omit unknown ids.

## Rollback

Readers continue to accept legacy strings. If rich value validation or rendering must be disabled, existing strings remain readable; rich values are rendered as extracted escaped text. Do not rewrite streams during rollback.

## Open questions

- Stage 2 must measure the production lazy chunk and demonstrate canvas CSP nonce propagation in the supported WordPress matrix.
- The design-token schema has no contrast fallback field; highlight foreground remains inherited until that schema is extended by a separately reviewed decision.
- Translation-envelope validation checks property ids against registered inline text property definitions but has no element-id-to-type map or active token set. Registry-aware acceptance also runs when values are selected for rendering. Validation enforces token-id syntax and length; the TypeScript command hook does not receive the site token set. Rendering omits unknown ids when its active set is available, and CSS emits only known token rules.

## Review log

- 2026-10-16 owner approved Tiptap core; orchestrator selected the portable inline JSON model and canvas runtime location for stage 2.
