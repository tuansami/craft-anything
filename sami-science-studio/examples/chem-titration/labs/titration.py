#!/usr/bin/env python3
"""Strong acid - strong base titration (HCl in the flask, NaOH in the burette) at 25 C.

Model: complete dissociation, ideal solution (activities = concentrations), volumes additive.
Charge balance gives [H+] - Kw/[H+] = n, where n = (Ca*Va - Cb*Vb)/(Va + Vb) is the net strong-acid
concentration (negative past the equivalence point). Solved exactly: [H+] = (n + sqrt(n^2 + 4 Kw)) / 2.
Prints {"values": ..., "data": ...} for the fact ledger and the scene.
"""
import json
import math

# Inputs come from the ledger, so each constant is written down once.
F = {f["id"]: f.get("value") for f in json.load(open("facts.json", encoding="utf-8"))["facts"]}
CA, VA, CB, KW, DROP = F["ca"], F["va"], F["cb"], F["kw"], F["drop"]  # mol/L, mL, mol/L, -, mL


def h_conc(vb):
    n = (CA * VA - CB * vb) / (VA + vb)
    # For n < 0 the direct formula subtracts two nearly equal numbers; use the equivalent stable form.
    root = math.sqrt(n * n + 4 * KW)
    return (n + root) / 2 if n >= 0 else 2 * KW / (root - n)


def ph(vb):
    return -math.log10(h_conc(vb))


v_eq = CA * VA / CB
before, after = v_eq - DROP / 2, v_eq + DROP / 2

# Sample finely where the curve is steep so the drawn line is the computed line.
grid = sorted({round(i * 0.25, 4) for i in range(0, 161)}
              | {round(24.0 + i * 0.02, 4) for i in range(0, 101)}
              | {round(24.9 + i * 0.0025, 4) for i in range(0, 81)})

print(json.dumps({
    "values": {
        "v_eq_ml": v_eq,
        "ph_start": ph(0.0),
        "ph_half": ph(v_eq / 2),
        "ph_before_drop": ph(before),
        "ph_after_drop": ph(after),
        "ph_equivalence": ph(v_eq),
        "h_ratio_one_drop": h_conc(before) / h_conc(after),
        "ph_jump_one_drop": ph(after) - ph(before),
    },
    "data": {
        "v_eq_ml": v_eq, "v_before_drop_ml": before, "v_after_drop_ml": after,
        "curve": [[v, round(ph(v), 4)] for v in grid],
    },
}))
