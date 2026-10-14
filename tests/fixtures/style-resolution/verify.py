#!/usr/bin/env python3
"""Checks tests/fixtures/style-resolution/cases.json against ADR 0005.

An ORDERING check, not a CSS test. Two evaluators must agree with each other and with the hand-derived fixtures:
  1. resolve_by_key: the lexicographic key of ADR 0005 section 1.
  2. resolve_by_layers: a simulation of the layer/emission order of ADR 0005 section 3 (declared layer list,
     then emission sorted by breakpoint rank and class order; last matching rule wins).
Both evaluators are transcribed from the same ADR, so they can share a transcription error; the hand-derived
expectations in cases.json (re-derived independently in review) are the safeguard. Not covered here, and required
of the real compiler (BWB-024/107): emitted CSS, @layer and selector syntax, media queries, specificity, token
inheritance, PHP output parity, and browser computed-style tests including explicit auto, manual theme, no-JS and
third-party unlayered CSS. Randomized equivalence is seeded and deterministic. Exit code 0 only if all pass.
Usage: python3 -I tests/fixtures/style-resolution/verify.py
"""
import itertools, json, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, "cases.json")))
BPS = DATA["breakpoints"]                      # widest -> narrowest
VIEW = DATA["viewports"]
ORIGINS = ["token", "class", "element"]
STATES = ["none", "hover", "focus", "focus-visible", "active"]
LAYERS = ["base", "bp", "mode", "modebp"]


def layer_of(r):
    m, b = r.get("mode") is not None, r.get("breakpoint") is not None
    return "modebp" if m and b else "mode" if m else "bp" if b else "base"


def state_of(r): return r.get("state") or "none"


def matches(r, ctx):
    if r.get("mode") and r["mode"] != ctx["mode"]: return False
    if r.get("breakpoint") and r["breakpoint"] not in VIEW[ctx["viewport"]]: return False
    s = r.get("state")
    return not s or s in ctx.get("states", [])


def identity(r):
    return (r["origin"], r.get("classOrder"), state_of(r), r.get("mode"), r.get("breakpoint"))


def validate(rules):
    seen = set()
    for r in rules:
        k = identity(r)
        if k in seen: return "duplicate-rule"
        seen.add(k)
    return None


def resolve_by_key(rules, ctx):
    best, val = None, None
    for r in rules:
        if not matches(r, ctx): continue
        key = (ORIGINS.index(r["origin"]), STATES.index(state_of(r)), LAYERS.index(layer_of(r)),
               BPS.index(r["breakpoint"]) if r.get("breakpoint") else -1, r.get("classOrder") or 0)
        if best is None or key > best: best, val = key, r["value"]
    return val


def layer_order():
    return [(o, s, l) for o in ORIGINS for s in STATES for l in LAYERS]   # declared @layer list


def resolve_by_layers(rules, ctx):
    order = layer_order()
    emitted = sorted(rules, key=lambda r: (order.index((r["origin"], state_of(r), layer_of(r))),
                                           BPS.index(r["breakpoint"]) if r.get("breakpoint") else -1,
                                           r.get("classOrder") or 0))
    val = None
    for r in emitted:                    # later in the stylesheet wins when specificity is equal
        if matches(r, ctx): val = r["value"]
    return val


def effective_mode(data_theme, system):
    if data_theme in ("light", "dark"): return data_theme
    return "dark" if system == "dark" else "light"


def main():
    fails = 0
    for c in DATA["cases"]:
        err = validate(c["rules"])
        if err: print("FAIL", c["id"], "unexpected", err); fails += 1; continue
        for e in c["expect"]:
            ctx = {"mode": e["mode"], "viewport": e["viewport"], "states": e.get("states", [])}
            a, b = resolve_by_key(c["rules"], ctx), resolve_by_layers(c["rules"], ctx)
            if not (a == b == e["value"]):
                print("FAIL", c["id"], ctx, "key=%r layers=%r expected=%r" % (a, b, e["value"])); fails += 1
    for c in DATA["invalid"]:
        if validate(c["rules"]) != c["error"]: print("FAIL", c["id"], "expected", c["error"]); fails += 1
    for a in DATA["autoMode"]["cases"]:
        if effective_mode(a["dataTheme"], a["system"]) != a["effective"]: print("FAIL autoMode", a); fails += 1
    # exhaustive presence matrix for one element: every subset of the four rule layers x every context
    combos = 0
    for present in itertools.product([0, 1], repeat=4):
        rules = []
        if present[0]: rules.append({"origin": "element", "value": "base"})
        if present[1]: rules.append({"origin": "element", "breakpoint": "mobile", "value": "bp"})
        if present[2]: rules.append({"origin": "element", "mode": "dark", "value": "mode"})
        if present[3]: rules.append({"origin": "element", "mode": "dark", "breakpoint": "mobile", "value": "modebp"})
        for mode, vp, st in itertools.product(["light", "dark"], VIEW, [[], ["hover"]]):
            ctx = {"mode": mode, "viewport": vp, "states": st}
            exp = None
            if mode == "dark" and vp == "mobile" and present[3]: exp = "modebp"
            elif mode == "dark" and present[2]: exp = "mode"
            elif vp == "mobile" and present[1]: exp = "bp"
            elif present[0]: exp = "base"
            a, b = resolve_by_key(rules, ctx), resolve_by_layers(rules, ctx)
            combos += 1
            if not (a == b == exp): print("FAIL matrix", present, ctx, a, b, exp); fails += 1
    # randomized equivalence of the two evaluators
    rnd, n = random.Random(20261014), 0
    for _ in range(3000):
        seen, rules = set(), []
        for i in range(rnd.randint(1, 9)):
            r = {"origin": rnd.choice(ORIGINS), "value": "v%d" % i}
            if r["origin"] == "class": r["classOrder"] = rnd.randint(1, 3)
            if r["origin"] != "token" and rnd.random() < .4: r["state"] = rnd.choice(STATES[1:])  # tokens: mode dimension only (ADR 0005)
            if rnd.random() < .5: r["mode"] = rnd.choice(["light", "dark"])
            if r["origin"] != "token" and rnd.random() < .5: r["breakpoint"] = rnd.choice(BPS[1:])
            if identity(r) in seen: continue
            seen.add(identity(r)); rules.append(r)
        ctx = {"mode": rnd.choice(["light", "dark"]), "viewport": rnd.choice(list(VIEW)),
               "states": rnd.sample(STATES[1:], rnd.randint(0, 2))}
        n += 1
        if resolve_by_key(rules, ctx) != resolve_by_layers(rules, ctx):
            print("FAIL random equivalence", rules, ctx); fails += 1; break
    print("cases=%d invalid=%d auto=%d matrix=%d random=%d failures=%d" % (
        len(DATA["cases"]), len(DATA["invalid"]), len(DATA["autoMode"]["cases"]), combos, n, fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
