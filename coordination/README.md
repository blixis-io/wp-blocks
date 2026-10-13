# coordination/

Durable record of agent coordination. GitHub issues and the Project remain authoritative for status.

- `LEDGER.md` — dated decisions, handoffs, review outcomes.
- `handoffs/<ISSUE>-codex.md` — scoped requests sent to Codex.
- `reviews/<ISSUE>-codex-response.md` — Codex output, stored verbatim apart from path normalisation. A response is input to a decision, never approval by itself.
- `issue-map.json` — `BWB-xxx` to GitHub issue number/URL. No secrets.
- `tools/sync_github.py` — idempotent backlog sync.

## Re-running the GitHub sync safely

Requires `gh auth status` with `repo` and `project` scopes and org access to `blixis-io`.

```bash
python3 -I coordination/tools/sync_github.py          # dry run: prints what would change
python3 -I coordination/tools/sync_github.py --apply  # apply
```

Behaviour: matches issues by `BWB-xxx:` title prefix (never creates duplicates); rewrites bodies, titles and the managed label families (`phase:`, `type:`, `priority:`, `area:`) to match `roadmap/*.csv`; adds missing items to Project "Blixis WP Blocks — Delivery" and sets Phase/Priority/Area/Size/Target; sets Status to Backlog only for items newly added to the Project. It never closes issues or changes Status of existing items. Manual edits to those fields on GitHub are overwritten, so change the CSV (or this script's mapping) instead. The Project and its custom fields must already exist; saved views cannot be created by API and are configured in the UI.

The addendum priority mapping is fixed in the script: high in P0 → P0; other high → P1; medium → P1; low → P2.
