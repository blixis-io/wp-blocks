# Handoff: independent review of BWB-017 (reproducible packaging)

READ-ONLY, offline. Branch `build/17-packaging`. Read: `tooling/build/zip.mjs`, `tooling/build/package.mjs`, `tooling/build/distributions.json`, `tooling/build/package.test.mjs`, the `build` job in `.github/workflows/ci.yml`, `docs/engineering/CI-CD.md` (Packaging), ADR 0009, `docs/engineering/SECURITY.md`.

Questions:
1. ZIP correctness and determinism: header fields (version needed/made by, flags, DOS time/date, external attributes, UTF-8 name flag), ZIP64 limits (4 GB / 65535 entries: is overflow silently corrupting?), CRC/size handling for empty files, directory entries, central directory offsets. Anything WordPress's installer or `unzip` would reject? Is "same bytes" claim honest given zlib?
2. Security of packaging: path traversal, symlinks (lstat before reading? TOCTOU), forbidden-file list completeness (e.g. `.git` handled, `.npmrc`, `auth.json`, `*.pfx`, `credentials*`, `*.kdbx`, `.aws`, `wp-config.php`), exclusion semantics (patterns match names at any depth — can a forbidden file hide inside an excluded directory so it is never checked? note forbidden is checked before exclude), file size limits, reading whole files into memory, deny-by-default vs allow-list.
3. Version handling: header regex, SemVer prerelease, mismatch with package.json, plugin vs theme header conventions in WordPress.
4. CI: the `build` job, artifact upload condition, SHA pin, interaction with the aggregate `CI` job; does `pnpm build` pass vacuously and is that clearly reported?
5. Tests: which behaviour has no failing-case test? Would tests fail if the exclusion list or header parsing were gutted?

Output: Blocker/Major/Minor with file + fix wording; agreements; what you could not verify.
