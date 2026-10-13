#!/usr/bin/env python3
"""Idempotent GitHub planning sync for the BWB backlog.

Source of truth: roadmap/issues.csv + roadmap/issues-addendum.csv.
Matching key: the `BWB-xxx:` title prefix. Existing issues are updated, never duplicated.

Usage (run from anywhere; requires an authenticated `gh` with repo + project scopes):
    python3 -I coordination/tools/sync_github.py            # dry run, prints plan
    python3 -I coordination/tools/sync_github.py --apply    # labels, milestones, issues, project, fields
Writes coordination/issue-map.json (BWB key -> number/url). Contains no secrets.
"""
import csv, json, os, re, subprocess, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
REPO, ORG, PROJECT_TITLE = "blixis-io/wp-blocks", "blixis-io", "Blixis WP Blocks — Delivery"
MAP = os.path.join(ROOT, "coordination", "issue-map.json")
APPLY = "--apply" in sys.argv
AREA_MAP = {"Architecture": "core", "Product": "premium", "Core": "core", "Styles": "css", "Theme": "theme", "Onboarding": "theme",
            "Renderer": "wordpress", "WordPress": "wordpress", "REST": "wordpress", "Editor": "editor", "Accessibility": "editor",
            "QA": "dx", "Plus": "premium", "Pro": "premium", "Docs": "docs"}
TYPE_MAP = {"Architecture": "research", "Product": "research", "QA": "test", "Docs": "docs"}
GENERIC = ["Add or update automated tests or verifiable review evidence", "Update relevant developer documentation and pass CI"]
AREA_LABEL = {"theme": "Theme", "editor": "Editor", "core": "Core", "wordpress": "WordPress", "css": "CSS", "premium": "Premium",
              "docs": "Docs", "dx": "DX", "security": "Security"}
PHASE_EPIC = {}


def sh(args, inp=None, retries=1):
    for t in range(retries):
        r = subprocess.run(args, capture_output=True, text=True, input=inp)
        if r.returncode == 0:
            return r.stdout
        time.sleep(2 * (t + 1))
    raise RuntimeError(f"{' '.join(args[:5])}: {r.stderr.strip()[:300]}")


def gh(args, inp=None, retries=1):
    return json.loads(sh(["gh"] + args, inp, retries) or "null")


def catalog():
    a = list(csv.DictReader(open(f"{ROOT}/roadmap/issues.csv")))
    b = list(csv.DictReader(open(f"{ROOT}/roadmap/issues-addendum.csv")))
    out = []
    for x in a:
        PHASE_EPIC.setdefault(x["phase"], x["epic"])
        out.append(dict(id=x["id"], phase=x["phase"], epic=x["epic"], title=x["title"], desc=x["description"], type=x["type"],
                        area=x["area"], priority=x["priority"], size=x["size"], deps=[d for d in re.split(r"[|,; ]+", x["depends_on"]) if d],
                        acc=[s.strip() for s in x["acceptance"].split(" | ")], src="issues.csv"))
    for x in b:
        # Approved mapping: high in P0 -> P0; other high -> P1; medium -> P1; low -> P2.
        p = {"high": "P1", "medium": "P1", "low": "P2"}[x["priority"]]
        if x["phase"] == "P0" and x["priority"] == "high":
            p = "P0"
        out.append(dict(id=x["id"], phase=x["phase"], epic="Multilingual & Light/Dark Addendum", title=x["title"], desc=x["title"] + ".",
                        type=TYPE_MAP.get(x["area"], "feature"), area=AREA_MAP[x["area"]], priority=p, size="",
                        deps=[d for d in re.split(r"[,; ]+", x["depends_on"]) if d],
                        acc=[x["acceptance_criteria"].strip()] + GENERIC, src="issues-addendum.csv"))
    ids = [i["id"] for i in out]
    assert len(ids) == len(set(ids)), "duplicate BWB ids"
    for i in out:
        for d in i["deps"]:
            assert d in ids, f"{i['id']} depends on unknown {d}"
    return out


def body(i, urls):
    deps = "\n".join(f"- {d}" + (f" ({urls[d]})" if d in urls else "") for d in i["deps"]) or "- None"
    acc = "\n".join(f"- [ ] {a}" for a in i["acc"])
    size = i["size"] or "unsized (not provided in source catalog)"
    return f"""<!-- bwb-key: {i['id']} -->
## Outcome
{i['desc']}

## Acceptance criteria
{acc}

## Dependencies
{deps}

## Delivery notes
Phase: {i['phase']} · Epic: {i['epic']} · Priority: {i['priority']} · Size: {size} · Area: {i['area']} · Type: {i['type']}
Source: `roadmap/{i['src']}` (stable key `{i['id']}`)

## Definition of Done
- [ ] Tests and relevant docs updated
- [ ] CI green
- [ ] Reviewed by someone other than the implementing agent
- [ ] Meets repository Definition of Done (`engineering/CODE-STANDARDS.md`)
"""


def labels(i):
    return [f"phase:{i['phase']}", f"type:{i['type']}", f"priority:{i['priority']}", f"area:{i['area']}"]


def sync_labels_milestones():
    want = {f"phase:P{p}": "1d76db" for p in range(11)}
    want.update({f"type:{t}": "5319e7" for t in "feature task docs security test infra research".split()})
    want.update({"priority:P0": "b60205", "priority:P1": "d93f0b", "priority:P2": "fbca04", "status:blocked": "e11d21"})
    want.update({f"area:{a}": "0e8a16" for a in AREA_LABEL})
    have = {l["name"] for l in gh(["label", "list", "--repo", REPO, "--limit", "300", "--json", "name"])}
    miss = [n for n in want if n not in have]
    print(f"labels: {len(want)-len(miss)} present, {len(miss)} to create")
    ms = {m["title"] for m in gh(["api", f"repos/{REPO}/milestones?state=all&per_page=100"])}
    mm = [f"P{p} — {PHASE_EPIC[f'P{p}']}" for p in range(11) if f"P{p} — {PHASE_EPIC[f'P{p}']}" not in ms]
    print(f"milestones: {11-len(mm)} present, {len(mm)} to create")
    if APPLY:
        for n in miss: sh(["gh", "label", "create", n, "--repo", REPO, "--color", want[n]])
        for t in mm: sh(["gh", "api", f"repos/{REPO}/milestones", "-f", f"title={t}", "-f", "description=Outcome-based milestone. No dated commitment."])


def sync_issues(cat):
    ex = {}
    for x in gh(["issue", "list", "--repo", REPO, "--state", "all", "--limit", "1000", "--json", "number,title,url,body,id,labels,milestone"]):
        k = re.match(r"(BWB-\d+):", x["title"])
        if k: ex.setdefault(k.group(1), []).append(x)
    dups = {k: [y["url"] for y in v] for k, v in ex.items() if len(v) > 1}
    if dups: print("DUPLICATES (resolve manually):", dups)
    urls = {k: v[0]["url"] for k, v in ex.items()}
    mp, c, u, r = {}, 0, 0, 0
    for i in cat:
        t = f"{i['id']}: {i['title']}"
        nb = body(i, urls)
        if i["id"] in ex:
            e = ex[i["id"]][0]
            if (e["body"] or "").strip() != nb.strip() or e["title"] != t:
                u += 1
                if APPLY: sh(["gh", "issue", "edit", str(e["number"]), "--repo", REPO, "--title", t, "--body-file", "-"], inp=nb)
            else:
                r += 1
            have = {l["name"] for l in e["labels"]}
            if APPLY:
                # keep exactly one value per managed label family in sync with the catalog
                fam = [l for l in have if l.split(":")[0] in ("phase", "type", "priority", "area")]
                rem = [l for l in fam if l not in labels(i)]
                add = [l for l in labels(i) if l not in have]
                if add or rem:
                    cmd = ["gh", "issue", "edit", str(e["number"]), "--repo", REPO]
                    if add: cmd += ["--add-label", ",".join(add)]
                    if rem: cmd += ["--remove-label", ",".join(rem)]
                    sh(cmd)
            mp[i["id"]] = dict(number=e["number"], url=e["url"], nodeId=e["id"])
        else:
            c += 1
            if APPLY:
                out = sh(["gh", "issue", "create", "--repo", REPO, "--title", t, "--body-file", "-", "--milestone",
                          f"{i['phase']} — {PHASE_EPIC[i['phase']]}", "--label", ",".join(labels(i))], inp=nb).strip()
                urls[i["id"]] = out
                mp[i["id"]] = dict(number=int(out.rsplit("/", 1)[1]), url=out)
                time.sleep(1.2)
    print(f"issues: create={c} update={u} unchanged={r}")
    return mp


def sync_project(cat, mp):
    projs = gh(["project", "list", "--owner", ORG, "--format", "json"])["projects"]
    p = [x for x in projs if x["title"] == PROJECT_TITLE]
    if not p:
        print("project missing: create manually with `gh project create --owner blixis-io --title ...` then rerun"); return
    num, pid = p[0]["number"], p[0]["id"]
    fields = {f["name"]: (f["id"], {o["name"]: o["id"] for o in f.get("options", [])}) for f in
              gh(["project", "field-list", str(num), "--owner", ORG, "--format", "json"])["fields"] if f.get("options")}
    items = {x["content"]["number"]: x for x in gh(["project", "item-list", str(num), "--owner", ORG, "--limit", "1000", "--format", "json"])["items"]}
    print(f"project #{num}: {len(items)} items present")
    if not APPLY: return
    target = lambda ph: {"P8": "Plus", "P9": "Pro", "P10": "Docs 1.0"}.get(ph, "Free 1.0")
    for i in cat:
        m = mp[i["id"]]
        node = m.get("nodeId") or gh(["api", f"repos/{REPO}/issues/{m['number']}"])["node_id"]
        q = 'mutation{a:addProjectV2ItemById(input:{projectId:"%s",contentId:"%s"}){item{id}}}' % (pid, node)
        item = gh(["api", "graphql", "-f", f"query={q}"], retries=6)["data"]["a"]["item"]["id"]
        vals = {"Phase": i["phase"], "Priority": i["priority"], "Area": AREA_LABEL[i["area"]], "Target": target(i["phase"])}
        if i["size"]: vals["Size"] = i["size"]
        if m["number"] not in items: vals["Status"] = "Backlog"  # never reset status of existing items
        q = "mutation{" + "".join('f%d:updateProjectV2ItemFieldValue(input:{projectId:"%s",itemId:"%s",fieldId:"%s",value:{singleSelectOptionId:"%s"}}){clientMutationId}'
                                  % (k, pid, item, fields[n][0], fields[n][1][v]) for k, (n, v) in enumerate(vals.items())) + "}"
        gh(["api", "graphql", "-f", f"query={q}"], retries=6)


if __name__ == "__main__":
    cat = catalog()
    print("APPLY" if APPLY else "DRY RUN", f"- catalog: {len(cat)} issues")
    sync_labels_milestones()
    mp = sync_issues(cat)
    if APPLY:
        json.dump({k: dict(number=v["number"], url=v["url"]) for k, v in mp.items()}, open(MAP, "w"), indent=1, sort_keys=True)
        sync_project(cat, mp)
    else:
        sync_project(cat, mp)
