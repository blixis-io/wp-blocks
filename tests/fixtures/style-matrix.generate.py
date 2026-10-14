#!/usr/bin/env python3
"""Writes tests/fixtures/compile/compile-style-matrix.fixture.json (BWB-107).

One document holds the whole precedence matrix, so a single compile and a single golden stylesheet pin the output:
  group M (el-m00 .. el-m15): every presence combination of the four rule layers (base, mobile, dark, dark+mobile) = 2^4;
  group S (el-s00 .. el-s15): the same combinations plus a base hover rule, to show that a state beats every layer;
  group C (el-c0 .. el-c3): global classes against element rules (precedence follows the class list, not classIds order);
  group T (el-t0 .. el-t3): two breakpoints (tablet and mobile) together, with dark and hover combinations.
Class names are computed with hashlib, independently of the TypeScript implementation. Expected values are NOT stored here:
style-matrix.test.ts derives them from a hand-written formula and checks them against the compiled stylesheet.
Usage: python3 -I tests/fixtures/style-matrix.generate.py
"""
import hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
VALUES = {"base": "black", "bp": "gray", "mode": "white", "modebp": "silver", "hover": "red"}


def own(i): return "blx-" + hashlib.sha256(("doc-001:" + i).encode()).hexdigest()[:12]
def cls(c): return "blx-c-" + hashlib.sha256(c.encode()).hexdigest()[:12]


def rules(bits, hover):
    out = []
    if bits & 1: out.append({"declarations": {"color": VALUES["base"]}})
    if bits & 2: out.append({"breakpoint": "mobile", "declarations": {"color": VALUES["bp"]}})
    if bits & 4: out.append({"mode": "dark", "declarations": {"color": VALUES["mode"]}})
    if bits & 8: out.append({"mode": "dark", "breakpoint": "mobile", "declarations": {"color": VALUES["modebp"]}})
    if hover: out.append({"state": "hover", "declarations": {"color": VALUES["hover"]}})
    return out


def element(i, style=None, class_ids=None):
    e = {"id": i, "type": "blixis/text", "props": {}, "children": []}
    if style: e["style"] = style
    if class_ids: e["classIds"] = class_ids
    return e


root, names = [], {}
for bits in range(16):
    i = "el-m%02d" % bits
    root.append(element(i, rules(bits, False) or None)); names[i] = [own(i)] if bits else []
for bits in range(16):
    i = "el-s%02d" % bits
    root.append(element(i, rules(bits, True))); names[i] = [own(i)]
for i in ("el-m00",): names.pop(i, None)
# group C: classes cls-a (order 1) and cls-b (order 2)
root.append(element("el-c0", None, ["cls-a"])); names["el-c0"] = [cls("cls-a")]
root.append(element("el-c1", None, ["cls-b", "cls-a"])); names["el-c1"] = [cls("cls-b"), cls("cls-a")]
root.append(element("el-c2", [{"declarations": {"color": "navy"}}], ["cls-a", "cls-b"])); names["el-c2"] = [own("el-c2"), cls("cls-a"), cls("cls-b")]
root.append(element("el-c3", [{"mode": "dark", "declarations": {"color": "teal"}}], ["cls-b"])); names["el-c3"] = [own("el-c3"), cls("cls-b")]
# group T: tablet (<= 1024px) and mobile (<= 640px) rules together
root.append(element("el-t0", [
    {"declarations": {"color": "black"}},
    {"breakpoint": "mobile", "declarations": {"color": "green"}},
    {"breakpoint": "tablet", "declarations": {"color": "blue"}},
])); names["el-t0"] = [own("el-t0")]
root.append(element("el-t1", [
    {"declarations": {"color": "black"}},
    {"breakpoint": "tablet", "declarations": {"color": "blue"}},
    {"breakpoint": "mobile", "declarations": {"color": "green"}},
    {"mode": "dark", "breakpoint": "tablet", "declarations": {"color": "white"}},
])); names["el-t1"] = [own("el-t1")]
root.append(element("el-t2", [
    {"mode": "dark", "breakpoint": "mobile", "declarations": {"color": "silver"}},
    {"mode": "dark", "breakpoint": "tablet", "declarations": {"color": "white"}},
])); names["el-t2"] = [own("el-t2")]
root.append(element("el-t3", [
    {"declarations": {"color": "black"}},
    {"state": "hover", "breakpoint": "tablet", "declarations": {"color": "red"}},
    {"state": "hover", "mode": "dark", "breakpoint": "mobile", "declarations": {"color": "orange"}},
])); names["el-t3"] = [own("el-t3")]
classes = [
    {"id": "cls-a", "rules": [{"declarations": {"color": "olive"}}, {"breakpoint": "mobile", "declarations": {"color": "maroon"}}]},
    {"id": "cls-b", "rules": [{"declarations": {"color": "purple"}}, {"mode": "dark", "declarations": {"color": "pink"}}]},
]
document = {
    "schemaVersion": 1, "documentId": "doc-001", "layoutRevision": 1, "defaultLocale": "en_US", "locales": ["en_US"],
    "root": root, "classListVersion": 0, "classRefs": {"cls-a": 1, "cls-b": 1}, "translations": {"en_US": {}},
    "metadata": {"updatedAt": "2026-01-01T00:00:00Z", "editorVersion": "0.0.0"},
}
fixture = {
    "fixtureVersion": 1, "id": "compile-style-matrix",
    "description": "The precedence matrix of ADR 0005: all 16 presence combinations of base, mobile, dark and dark+mobile rules, the same with a hover rule, and global classes against element rules, in one document so one golden stylesheet pins the output.",
    "tags": ["css", "compile", "dark-mode", "breakpoints", "states", "classes", "matrix"],
    "input": {"document": document, "classes": classes},
    "expected": {"classNames": names, "issues": []},
}
path = os.path.join(HERE, "compile", "compile-style-matrix.fixture.json")
with open(path, "w", encoding="ascii") as f:
    json.dump(fixture, f, indent=2)
    f.write("\n")
print("wrote", path)
