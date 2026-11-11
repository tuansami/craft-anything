#!/usr/bin/env python3
"""Project lint: the gate between the director's storyboard and a render.

Checks, without any model in the loop:
  - the timeline is contiguous and matches the project duration
  - every on-screen text lives in storyboard.texts, and every number in it belongs to a passing fact
  - scene code does not type its own on-screen text
  - text fits its component and stays on screen long enough to read
  - publish.json (if present) respects platform limits and has a call to action

Usage:  python3 -I lint_project.py <project folder> [--strict]
  --strict   warnings (and cited facts nobody confirmed) also fail
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import facts as ledger  # noqa: E402

LIMITS = {"title": 34, "subtitle": 64, "pill": 20, "heading": 60, "note": 120, "chip": 48, "caption": 72, "label": 28}
NUM = re.compile(r"\d[\d  ,]*(?:\.\d+)?")
READ_WORDS_PER_S = 3.2


def norm(n):
    return n.replace(" ", "").replace(" ", "").replace(",", "").rstrip(".")


def numbers_in(text, is_math):
    s = text
    # LaTeX inside $...$ (or a whole math item): drop commands, subscripts and superscripts, which carry
    # formula indices (H_2O, x^2) checked by the equation's own fact, not by number matching.
    def strip_tex(t):
        t = re.sub(r"[_^]\{[^{}]*\}", "", t)
        t = re.sub(r"[_^][A-Za-z0-9+\-]", "", t)
        t = re.sub(r"\\[A-Za-z]+", " ", t)
        return t
    if is_math:
        s = strip_tex(s)
    else:
        s = re.sub(r"\$([^$]+)\$", lambda m: strip_tex(m.group(1)), s)
        s = re.sub(r"\{[123m]\|", "", s)
        # Unicode subscripts and superscripts are formula indices too.
        s = re.sub(r"[₀-₉⁰-⁹⁺⁻²³¹]", "", s)
    return [norm(m.group()) for m in NUM.finditer(s)]


def lint(project, strict=False):
    project = Path(project)
    errors, warnings = [], []
    pj = json.loads((project / "project.json").read_text(encoding="utf-8"))
    sb = json.loads((project / pj.get("storyboard", "storyboard.json")).read_text(encoding="utf-8"))

    # ---- facts
    report = ledger.check_project(project)
    status = {r["id"]: r for r in report["facts"]}
    facts = {f["id"]: f for f in json.loads((project / "facts.json").read_text(encoding="utf-8"))["facts"]}
    for r in report["facts"]:
        if r["status"] == "fail":
            errors.append(f"fact {r['id']}: {r['detail']}")
        elif r["status"] == "unconfirmed":
            (errors if strict else warnings).append(f"fact {r['id']}: {r['detail']}")

    # ---- timeline
    beats = sb.get("timeline", [])
    if not beats:
        errors.append("storyboard.timeline is empty")
    t = 0.0
    ids = set()
    for b in beats:
        if b.get("id") in ids:
            errors.append(f"beat id '{b.get('id')}' is used twice")
        ids.add(b.get("id"))
        if abs(b["t_start"] - t) > 1e-6:
            errors.append(f"beat {b['id']} starts at {b['t_start']} but the previous one ends at {t}")
        if b["t_end"] <= b["t_start"]:
            errors.append(f"beat {b['id']} has no length")
        t = b["t_end"]
    duration = sb.get("format", {}).get("duration_s", pj.get("duration_s"))
    if duration is not None and abs(duration - t) > 1e-6:
        errors.append(f"timeline ends at {t} s but duration_s is {duration}")
    span = {b["id"]: b["t_end"] - b["t_start"] for b in beats}

    # ---- texts
    texts = sb.get("texts", {})
    used_facts = set()
    for key, item in texts.items():
        if isinstance(item, str):
            item = {"text": item}
        text, role = item.get("text", ""), item.get("role", "")
        refs = item.get("facts", [])
        for fid in refs:
            if fid not in facts:
                errors.append(f"text '{key}' cites unknown fact '{fid}'")
        used_facts.update(refs)
        allowed = set(norm(str(x)) for x in item.get("structural", []))
        for fid in refs:
            f = facts.get(fid, {})
            for src in (str(f.get("display", "")), *(str(x) for x in f.get("also_display", []))):
                allowed.update(numbers_in(src, False))
        tex_of = item.get("tex_of")
        if tex_of:
            want = ledger.fact_tex(facts.get(tex_of, {})) if tex_of in facts else None
            if want is None:
                errors.append(f"text '{key}': tex_of names '{tex_of}', which is not an equation or identity fact")
            elif re.sub(r"\s+", "", want) != re.sub(r"\s+", "", text):
                errors.append(f"math '{key}' differs from the checked formula of fact '{tex_of}'. Use exactly: {want}")
            if tex_of not in refs:
                errors.append(f"text '{key}': add '{tex_of}' to its facts")
            used_facts.add(tex_of)
            continue
        for fid in refs:
            chk = facts.get(fid, {}).get("check", {})
            for part in ("lhs", "rhs", "equation"):
                allowed.update(numbers_in(str(chk.get(part, "")), False))
        for n in numbers_in(text, role == "math"):
            if n not in allowed:
                errors.append(f"text '{key}' shows the number {n} with no fact behind it (add the fact id to its 'facts', "
                              "or list a step number under 'structural')")
        if role == "math" and not refs:
            errors.append(f"math '{key}' needs a fact (an equation balance, an identity or an expression)")
        # Length as read on screen: without markup, and without the small second line of a chip.
        plain = re.sub(r"<small>.*?</small>|<[^>]+>", "", text)
        plain = re.sub(r"\$[^$]*\$", "xxxxxxxx", re.sub(r"\{[123m]\|([^}]*)\}", r"\1", plain))
        if role in LIMITS and len(plain) > LIMITS[role]:
            warnings.append(f"text '{key}' is {len(plain)} characters; a {role} fits about {LIMITS[role]}")
        beat = item.get("beat")
        if beat:
            if beat not in span:
                errors.append(f"text '{key}' names unknown beat '{beat}'")
            else:
                until = item.get("until", beat)
                on_screen = sum(span[b["id"]] for b in beats if beats.index(b) >= [x["id"] for x in beats].index(beat)
                                and beats.index(b) <= [x["id"] for x in beats].index(until)) if until in span else span[beat]
                need = max(1.2, len(plain.split()) / READ_WORDS_PER_S)
                if role != "math" and on_screen + 1e-6 < need:
                    warnings.append(f"text '{key}' is on screen {on_screen:.1f} s; reading it takes about {need:.1f} s")
    for fid, f in facts.items():
        if fid not in used_facts and not f.get("internal"):
            warnings.append(f"fact '{fid}' is not shown anywhere (mark it \"internal\": true if it only feeds other facts)")

    # ---- scene code must not type on-screen text
    typed = re.compile(r"\b(title|subtitle|pill|heading|note|text|math|caption)\s*:\s*(['\"`])")
    for js in sorted((project / "scenes").glob("*.js")) if (project / "scenes").is_dir() else []:
        for i, line in enumerate(js.read_text(encoding="utf-8").splitlines(), 1):
            if typed.search(line) and "stage.text(" not in line:
                errors.append(f"{js.name}:{i} types on-screen text in code; put it in storyboard.texts and read it with stage.text()")

    # ---- publish pack
    pub_file = project / "publish.json"
    if pub_file.is_file():
        pub = json.loads(pub_file.read_text(encoding="utf-8"))
        yt = pub.get("youtube", {})
        for i, title in enumerate(yt.get("titles", [])):
            if len(title) > 100:
                errors.append(f"YouTube title {i + 1} is {len(title)} characters (limit 100)")
            elif len(title) > 60:
                warnings.append(f"YouTube title {i + 1} is {len(title)} characters; search results cut titles near 60")
        if len(yt.get("description", "")) > 5000:
            errors.append("YouTube description is over 5000 characters")
        if sum(len(x) + 1 for x in yt.get("tags", [])) > 500:
            errors.append("YouTube tags are over 500 characters in total")
        if not yt.get("titles"):
            errors.append("publish.json has no YouTube title")
        if not pub.get("cta"):
            errors.append("publish.json has no call to action (cta)")
        if len(pub.get("hashtags", [])) > 5:
            warnings.append("more than 5 hashtags: keep 3 to 5 specific ones")
    else:
        warnings.append("no publish.json yet (titles, description, call to action)")
    return errors, warnings


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    strict = "--strict" in argv
    errors, warnings = lint(args[0], strict)
    for w in warnings:
        print("  warning: " + w)
    for e in errors:
        print("  ERROR:   " + e)
    bad = bool(errors) or (strict and bool(warnings))
    print(f"lint: {len(errors)} error(s), {len(warnings)} warning(s) -> {'BLOCKED' if bad else 'ok to render'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
