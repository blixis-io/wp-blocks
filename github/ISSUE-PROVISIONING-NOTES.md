# Issue Provisioner Implementation Notes

`roadmap/issues.csv` is the source of truth; each row has stable `BWB-xxx` key. The agent may write a temporary script for CSV parsing and `gh` calls, but must remain planning-only.

Use `gh issue list --repo blixis-io/wp-blocks --state all --limit 500 --json number,title,url` and parse title prefix. Do not rely only on the default 30 results if backlog is larger. For large repositories paginate via `gh api` as needed.

Build a staged algorithm: (1) ensure project/labels; (2) create or reuse each issue, writing acceptance as checkbox lines; (3) second-pass dependency URL links; (4) `gh project item-add` for URLs not already linked; (5) project field setup; (6) verification from remote. Keep a JSON manifest in temporary workspace; avoid committing token-bearing logs.

Use `gh project create --owner blixis-io --title 'Blixis WP Blocks — Delivery'` only after confirming it does not already exist. `gh project field-create`/`field-list` and `gh project item-edit` should be inspected using locally available CLI help before running; do not guess IDs.

A GitHub Project is distinct from a GitHub repository. Organization Project creation may require explicit org permissions. If unavailable, stop with exact missing access and retain all CSV rows for later replay.
