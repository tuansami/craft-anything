#!/usr/bin/env python3
"""Fact ledger checker.

Every number, formula and equation a video shows is a fact in the project's facts.json. This program
re-derives each one and refuses anything it cannot confirm:

  computed  re-calculated here (an expression, a symbolic identity, an equation balance, a lab script)
  given     an input the brief chose (a concentration, a volume); recorded, not derived
  cited     taken from a source; needs the source and a locator, and a person's confirmation

Usage:  python3 -I facts.py <project folder> [--write] [--json]
  --write   run the lab scripts and store their data files (otherwise stored data must match a fresh run)
  --tex     print the LaTeX generated from each checked equation and identity (paste it into the storyboard)
Exit code 0 only when nothing failed.
"""
import ast
import json
import math
import operator
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------- safe arithmetic
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv}
_FUNCS = {k: getattr(math, k) for k in ("sqrt", "log", "log10", "log2", "exp", "sin", "cos", "tan", "asin",
                                        "acos", "atan", "atan2", "radians", "degrees", "factorial", "comb", "gcd")}
_FUNCS.update(abs=abs, round=round, min=min, max=max)
_CONSTS = {"pi": math.pi, "e": math.e, "tau": math.tau}


def evaluate(expr, names):
    """Arithmetic only: numbers, fact ids, + - * / ** and a fixed list of maths functions."""
    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.Name):
            if n.id in names:
                return names[n.id]
            if n.id in _CONSTS:
                return _CONSTS[n.id]
            raise ValueError(f"unknown name '{n.id}'")
        if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
            return _BIN[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, (ast.USub, ast.UAdd)):
            v = ev(n.operand)
            return -v if isinstance(n.op, ast.USub) else v
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FUNCS and not n.keywords:
            return _FUNCS[n.func.id](*[ev(a) for a in n.args])
        raise ValueError("only arithmetic is allowed in a check expression")
    return ev(ast.parse(expr, mode="eval"))


# ---------------------------------------------------------------- chemistry
_TOKEN = re.compile(r"([A-Z][a-z]?)|(\d+)|([(\[{])|([)\]}])")


def parse_formula(text):
    """'[Fe(H2O)5(NO)]^2+' -> ({'Fe': 1, 'H': 10, 'O': 6, 'N': 1}, +2)."""
    s = re.sub(r"\((aq|s|l|g)\)", "", text.strip())
    s = s.replace("·", ".").replace("−", "-")
    charge = 0
    m = re.search(r"\^(\d*)([+-])$", s)
    if m:
        charge = int(m.group(1) or 1) * (1 if m.group(2) == "+" else -1)
        s = s[:m.start()]
    if s in ("e", "e-"):
        return {}, -1
    total = {}
    for part in s.split("."):  # hydrates: CuSO4.5H2O
        mult = 1
        lead = re.match(r"^(\d+)(?=[A-Z(\[])", part)
        if lead:
            mult, part = int(lead.group(1)), part[lead.end():]
        stack = [{}]
        pos = 0
        while pos < len(part):
            m = _TOKEN.match(part, pos)
            if not m:
                raise ValueError(f"cannot read formula '{text}' at '{part[pos:]}'")
            pos = m.end()
            el, num, op, cl = m.groups()
            if el:
                n = re.match(r"\d+", part[pos:])
                k = int(n.group()) if n else 1
                pos += n.end() if n else 0
                stack[-1][el] = stack[-1].get(el, 0) + k
            elif op:
                stack.append({})
            elif cl:
                if len(stack) < 2:
                    raise ValueError(f"unbalanced bracket in '{text}'")
                n = re.match(r"\d+", part[pos:])
                k = int(n.group()) if n else 1
                pos += n.end() if n else 0
                grp = stack.pop()
                for a, c in grp.items():
                    stack[-1][a] = stack[-1].get(a, 0) + c * k
            else:
                raise ValueError(f"unexpected number in '{text}'")
        if len(stack) != 1:
            raise ValueError(f"unbalanced bracket in '{text}'")
        for a, c in stack[0].items():
            total[a] = total.get(a, 0) + c * mult
    return total, charge


def check_balance(equation):
    """Atoms and charge must match on both sides. Species are separated by ' + ', sides by '->'."""
    sides = re.split(r"\s*(?:->|→|⟶|=)\s*", equation.strip())
    if len(sides) != 2:
        raise ValueError("an equation needs exactly one arrow (->)")
    sums = []
    for side in sides:
        atoms, charge = {}, 0
        for term in re.split(r"\s+\+\s+", side.strip()):
            m = re.match(r"^(\d+)\s*(.+)$", term.strip())
            coef, formula = (int(m.group(1)), m.group(2)) if m else (1, term.strip())
            a, c = parse_formula(formula)
            for el, n in a.items():
                atoms[el] = atoms.get(el, 0) + n * coef
            charge += c * coef
        sums.append((atoms, charge))
    (la, lc), (ra, rc) = sums
    if la != ra:
        diff = {el: (la.get(el, 0), ra.get(el, 0)) for el in sorted(set(la) | set(ra)) if la.get(el, 0) != ra.get(el, 0)}
        return False, f"atoms differ (left, right): {diff}"
    if lc != rc:
        return False, f"charge differs: left {lc:+d}, right {rc:+d}"
    return True, f"balanced: {dict(sorted(la.items()))}, charge {lc:+d}"


def formula_tex(formula):
    """'[Fe(H2O)5(NO)]^2+' -> '\\mathrm{[Fe(H_{2}O)_{5}(NO)]^{2+}}' (the LaTeX for a checked species)."""
    s = formula.strip()
    state = ""
    m = re.search(r"\((aq|s|l|g)\)$", s)
    if m:
        state, s = m.group(0), s[:m.start()]
    charge = ""
    m = re.search(r"\^(\d*[+-])$", s)
    if m:
        charge, s = "^{" + m.group(1) + "}", s[:m.start()]
    s = re.sub(r"(?<=[A-Za-z)\]])(\d+)", r"_{\1}", s)
    return "\\mathrm{" + s + charge + state + "}"


def equation_tex(equation):
    """LaTeX for a reaction equation written in the ledger's plain form."""
    sides = re.split(r"\s*(?:->|→|⟶)\s*", equation.strip())
    out = []
    for side in sides:
        terms = []
        for term in re.split(r"\s+\+\s+", side.strip()):
            m = re.match(r"^(\d+)\s*(.+)$", term.strip())
            terms.append((m.group(1) + "\\," if m else "") + formula_tex(m.group(2) if m else term))
        out.append(" + ".join(terms))
    return " \\longrightarrow ".join(out)


def fact_tex(fact):
    """The LaTeX generated from what was checked, so the formula shown is the formula verified."""
    chk = fact.get("check", {})
    if chk.get("kind") == "chem_balance":
        return equation_tex(chk["equation"])
    if chk.get("kind") == "identity":
        import sympy
        syms = {n: sympy.Symbol(n, **{a: True for a in str(assume).split()}) for n, assume in chk.get("symbols", {}).items()}
        return sympy.latex(sympy.sympify(chk["lhs"], locals=syms)) + " = " + sympy.latex(sympy.sympify(chk["rhs"], locals=syms))
    return None


# ---------------------------------------------------------------- display strings
_NUM = re.compile(r"[-−]?\d[\d  ,]*(?:\.\d+)?(?:[eE][-+]?\d+)?")


def display_number(display):
    """First number in a display string and how many decimals it shows: '≈ 250 000' -> (250000.0, 0)."""
    m = _NUM.search(display)
    if not m:
        return None
    raw = m.group().replace("−", "-").replace(" ", "").replace(" ", "").replace(",", "")
    decimals = len(raw.split(".")[1].split("e")[0].split("E")[0]) if "." in raw else 0
    return float(raw), decimals


def check_display(fact):
    if "display" not in fact or not isinstance(fact.get("value"), (int, float)):
        return None
    got = display_number(str(fact["display"]))
    if got is None:
        return None
    shown, decimals = got
    scale = fact.get("display_scale", 1)  # e.g. 100 when the value is a fraction shown as a percentage
    value = fact["value"] * scale
    if "display_rel_tol" in fact:
        ok = math.isclose(shown, value, rel_tol=fact["display_rel_tol"])
    else:
        ok = abs(shown - value) <= 0.5 * 10 ** (-decimals) * (1 + 1e-9)
    return ok, f"shows {fact['display']!r} for value {value!r}"


# ---------------------------------------------------------------- labs
def run_lab(project, name, spec, write):
    script = project / spec["script"]
    if not script.is_file():
        raise ValueError(f"lab script {spec['script']} is missing")
    run = subprocess.run([sys.executable, "-I", str(script)], capture_output=True, text=True, stdin=subprocess.DEVNULL,
                         timeout=spec.get("timeout_s", 900), cwd=str(project))
    if run.returncode != 0:
        raise ValueError(f"lab '{name}' failed: {run.stderr.strip()[-400:]}")
    out = json.loads(run.stdout)
    if "data" in spec:
        target = project / spec["data"]
        fresh = json.dumps(out.get("data", {}), sort_keys=True, separators=(",", ":"))
        if write:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(out.get("data", {}), separators=(",", ":")) + "\n", encoding="utf-8")
        elif not target.is_file():
            raise ValueError(f"{spec['data']} is missing: run with --write")
        elif json.dumps(json.loads(target.read_text(encoding="utf-8")), sort_keys=True, separators=(",", ":")) != fresh:
            raise ValueError(f"{spec['data']} does not match a fresh run of the lab: run with --write and re-render")
    return out.get("values", {})


# ---------------------------------------------------------------- the ledger
def check_project(project, write=False):
    project = Path(project).resolve()  # labs run with the project as their working folder
    ledger = json.loads((project / "facts.json").read_text(encoding="utf-8"))
    policy = ledger.get("policy", {})
    results, labs = [], {}
    for name, spec in ledger.get("labs", {}).items():
        try:
            labs[name] = run_lab(project, name, spec, write)
        except Exception as e:  # a broken lab fails every fact that reads it
            labs[name] = e
    values = {f["id"]: f["value"] for f in ledger["facts"] if isinstance(f.get("value"), (int, float))}
    seen = set()
    for f in ledger["facts"]:
        fid, status, detail = f.get("id", "?"), "pass", ""
        try:
            if fid in seen:
                raise ValueError("duplicate fact id")
            seen.add(fid)
            method, chk = f.get("method"), f.get("check", {})
            if method == "computed":
                kind = chk.get("kind")
                if kind == "expr":
                    got = evaluate(chk["expr"], values)
                    ok = math.isclose(got, f["value"], rel_tol=chk.get("rel_tol", 1e-9), abs_tol=chk.get("abs_tol", 0.0))
                    status, detail = ("pass" if ok else "fail"), f"{chk['expr']} = {got!r}, ledger says {f['value']!r}"
                elif kind == "lab":
                    lab = labs.get(chk["lab"])
                    if isinstance(lab, Exception) or lab is None:
                        raise ValueError(str(lab) if lab else f"no lab named '{chk['lab']}'")
                    got = lab[chk["key"]]
                    ok = math.isclose(got, f["value"], rel_tol=chk.get("rel_tol", 0.0), abs_tol=chk.get("abs_tol", 1e-9))
                    status, detail = ("pass" if ok else "fail"), f"lab {chk['lab']}.{chk['key']} = {got!r}, ledger says {f['value']!r}"
                elif kind == "chem_balance":
                    ok, detail = check_balance(chk["equation"])
                    status = "pass" if ok else "fail"
                elif kind == "identity":
                    import sympy  # needed only for symbolic identities
                    syms = {n: sympy.Symbol(n, **{a: True for a in str(assume).split()}) for n, assume in chk.get("symbols", {}).items()}
                    lhs = sympy.sympify(chk["lhs"], locals=syms).doit()
                    rhs = sympy.sympify(chk["rhs"], locals=syms).doit()
                    ok = sympy.simplify(lhs - rhs) == 0
                    status, detail = ("pass" if ok else "fail"), f"simplify(({chk['lhs']}) - ({chk['rhs']})) {'== 0' if ok else '!= 0'}"
                else:
                    raise ValueError(f"unknown check kind '{kind}'")
            elif method == "given":
                if not f.get("source"):
                    raise ValueError("a given fact needs a source (who chose it: the brief, the lab sheet)")
                detail = f"input from {f['source']}"
            elif method == "cited":
                src = f.get("source") or {}
                if not (isinstance(src, dict) and src.get("title") and src.get("locator")):
                    raise ValueError("a cited fact needs source.title and source.locator (page, table, section or URL)")
                if not f.get("confirmed"):
                    status = "fail" if policy.get("cited_must_be_confirmed") else "unconfirmed"
                    detail = f"cited from {src['title']} ({src['locator']}): not yet confirmed by a person"
                else:
                    detail = f"cited from {src['title']} ({src['locator']}), confirmed by {f['confirmed']}"
            else:
                raise ValueError("method must be computed, given or cited")
            shown = check_display(f)
            if shown is not None and status != "fail" and not shown[0]:
                status, detail = "fail", "display does not match the value: " + shown[1]
        except Exception as e:
            status, detail = "fail", f"{type(e).__name__}: {e}"
        results.append({"id": fid, "status": status, "detail": detail})
    return {"project": str(project), "counts": {s: sum(r["status"] == s for r in results) for s in ("pass", "unconfirmed", "fail")}, "facts": results}


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    if "--tex" in argv:
        for f in json.loads((Path(args[0]) / "facts.json").read_text(encoding="utf-8"))["facts"]:
            tex = fact_tex(f)
            if tex:
                print(f"{f['id']}: {tex}")
        return 0
    report = check_project(args[0], write="--write" in argv)
    out = Path(args[0]) / "out"
    out.mkdir(exist_ok=True)
    (out / "facts_report.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    if "--json" in argv:
        print(json.dumps(report))
    else:
        for r in report["facts"]:
            if r["status"] != "pass":
                print(f"  {r['status'].upper():<11} {r['id']}: {r['detail']}")
        c = report["counts"]
        print(f"facts: {c['pass']} pass, {c['unconfirmed']} cited-unconfirmed, {c['fail']} fail")
    return 1 if report["counts"]["fail"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
