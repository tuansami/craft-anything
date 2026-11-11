---
name: fact-ledger
description: Make every number, formula and equation in a science video traceable and checked by code. Use when writing or fixing facts.json or labs/*.py, when a fact or lint check fails, when turning source documents or lab notes into claims, or when asked how accuracy is guaranteed.
---

# Fact ledger

`facts.json` lists every scientific statement a video shows. `engine/verify/facts.py` re-derives each one;
`engine/verify/lint_project.py` refuses any on-screen number that has no passing fact behind it.

What this gives: each on-screen number is either recomputed by code, an input someone chose, or a
citation a person confirmed. What it cannot give: proof that the model behind a calculation suits the
real situation. State the model and its limits in `storyboard.science.caveats` and show them
(the channel profiles ask for a method card).

## A fact

```json
{ "id": "veq", "statement": "Volume of base at the equivalence point", "value": 25.0, "unit": "mL",
  "display": "25.00", "method": "computed", "check": { "kind": "expr", "expr": "ca * va / cb" } }
```

- `display` is the exact string the video may show. The checker confirms it is `value` correctly rounded
  (`display_scale` for percentages, `display_rel_tol` for round figures such as "250 000").
- `also_display`: other allowed renderings of the same value.
- `"internal": true` for facts that only feed other facts.

| method | when | needs |
|--------|------|-------|
| `computed` | anything that can be calculated | a `check` (below) |
| `given` | an input the brief chose (a concentration, a mass, a date) | `source` |
| `cited` | a measured or tabulated value | `source.title`, `source.locator` (page, table, section, URL), and `confirmed` set to the name or initials of the person who looked it up |

Prefer `computed`. Cite only what cannot be computed (constants, measured properties, historical data),
and cite the primary reference from `sources/` when the person supplied one.

| check kind | use | fields |
|------------|-----|--------|
| `expr` | arithmetic on other facts | `expr`, optional `rel_tol`, `abs_tol` |
| `identity` | symbolic identities (needs sympy) | `lhs`, `rhs`, `symbols: {"n": "positive integer"}` |
| `chem_balance` | reaction equations: atoms and charge | `equation`, e.g. `NO3^- + 3 Fe^2+ + 4 H^+ -> NO + 3 Fe^3+ + 2 H2O` |
| `lab` | numbers and curves from a script | `lab`, `key`, tolerance |

## Lab scripts

A lab is a small program in `labs/` that prints one JSON object:

```json
{ "values": { "ph_before_drop": 4.3008 }, "data": { "curve": [[0, 1.0], [0.25, 1.004]] } }
```

Register it under `labs` in `facts.json` with its `script` and, if the scene needs curves, a `data` file.
`facts.py --write` runs it and stores the data; without `--write` the stored data must equal a fresh run,
so a scene can never draw a stale curve. Name the data file in `project.json` under `data` to load it.

Write a lab so a reader can audit it: the model and its assumptions in the docstring, constants named at
the top, a numerically stable formula, no network access, no randomness without a fixed seed.
`examples/chem-titration/labs/titration.py` is the pattern.

By domain:

- **Maths**: prove with `identity`; add a lab that tests the statement numerically over a range as a
  second, independent check. For geometry, compute coordinates in the lab and draw from the data.
- **Chemistry**: `chem_balance` for every equation; stoichiometry with `expr`; equilibria and curves in a
  lab. For structures or quantum chemistry use real tools in the lab (RDKit, PySCF) and print every value.
- **Space**: orbital mechanics in a lab (Kepler's equation, vis-viva); cite constants and ephemerides
  from the source the person names (for example a NASA fact sheet or a JPL table) with a locator.

## When a check fails

1. Read the detail line: it shows the computed value and the ledger's value.
2. Decide which is wrong. If the script is right, the storyboard changes; tell the director.
3. Never change a tolerance to pass. Never round a display to hide a disagreement.
4. If a claim cannot be checked or cited, remove it from the video.

## From documents to facts

For each claim found in `sources/`: record the sentence, the file and the locator; recompute it if
possible (then it is `computed`, with the source as a cross-check in `statement`); otherwise `cited` and
unconfirmed. If two sources disagree, record both and stop for a decision.
