## Independent review — BWB-021

**Branch:** `feat/21-element-registry`. The working tree was clean before and after this read-only review.

### Blocker

- **URL validation accepts a scheme rebuilt by HTML parsing.** [url.ts](packages/element-registry/src/url.ts:37) rejects character references only when they end in `;`. `isSafeUrl('javascript&#58alert(1)')` returns `true`; an HTML attribute parser can decode `&#58` to `:`. Reject numeric references without a semicolon, or validate the decoded attribute value. Add a regression test. Correct `esc_url` use in the future PHP renderer would provide a separate defense, but that renderer is not present to verify.

### Major

- **`register` can throw on hostile objects.** [registry.ts](packages/element-registry/src/registry.ts:78) calls Zod directly. I reproduced throws from both a throwing getter and a Proxy, contrary to its documented result contract. Admit a bounded, inert plain-data snapshot before parsing, and return registration errors for unreadable input.
- **A reserved property key is silently lost.** [definition.ts](packages/element-registry/src/definition.ts:69): a definition whose `props` comes from JSON with an own `__proto__` key registers successfully, but the stored definition has no such key. Reject it explicitly before Zod parses the record; test JSON input as well as object literals.
- **The `source` argument is a claimed identity, not proof of one.** [registry.ts](packages/element-registry/src/registry.ts:78) correctly rejects a *vendor-sourced* `blixis-plus/` definition, but accepts it if the caller passes `'plus'`. The planned public registration adapter must assign source from trusted plugin provenance; it must not accept this value from an add-on payload.
- **`required` is unenforced for locale-stream properties.** [registry.ts](packages/element-registry/src/registry.ts:158) checks presence only for invariant props; [checks.ts](packages/element-registry/src/checks.ts:80) checks only translation values that exist. Either enforce required values per relevant locale or restrict `required` to invariant properties and document that meaning.
- **Existing trees with a missing add-on can become immovable.** [registry.ts](packages/element-registry/src/registry.ts:112) refuses unknown children and parents. [apply.ts](packages/core/src/commands/apply.ts:60) rechecks every descendant on move and restore, so moving a known section containing an unknown add-on element fails. Define an operation-specific preservation rule that permits relocating unchanged unknown subtrees without permitting new unknown elements.

### Minor

- [checks.ts](packages/element-registry/src/checks.ts:57) derives issue codes from English message fragments. Return structured validation issues so wording changes cannot alter codes.
- [checks.ts](packages/element-registry/src/checks.ts:77) rebuilds `Object.fromEntries(typeById)` for every translation entry. Use `typeById.has(elementId)` directly.
- The [manifest](packages/element-registry/manifest/core-elements.json:1) is canonical JSON with API and per-element versions, but definitions alone do not specify PHP renderer behavior or migration rules. Set those contracts before the PHP consumers ship, as planned in BWB-028/BWB-043.

### Agreements and test gaps

The ASCII type grammar rejects underscores, Unicode lookalikes, uppercase `Blixis/`, and trailing dots; the source checks reserve `blixis*`. Nesting arrays are capped at 64 entries, and `NESTING_ENTRY` has no apparent catastrophic backtracking pattern. Successful registration freezes a cloned parsed definition, and the map insertion is last, so I found no half-registered state. `a/b:c` is correctly treated as a relative reference; percent-encoded colons, IDN hosts, and `data:` within a relative path do not themselves create a dangerous scheme. `mailto` query recipients and encoded line breaks warrant a policy decision, but I did not establish an XSS bypass from them.

The current core nesting matrix **would fail** if the child-accepts-parent half were removed: a section would then fit inside another section. Namespace tests would fail if the reservation check were removed. Existing value tests cover several weakened `describe`/`valueSchemaFor` paths, but lack failing cases for required translated values, JSON `__proto__`, hostile getters, semicolonless numeric references, and moving a subtree containing an unknown type.

**Checks run:** registry tests passed (111), typecheck passed, and manifest check passed. I could not verify browser or PHP rendering behavior, REST source attribution, or add-on activation behavior offline; those consumers are not implemented in the reviewed package.