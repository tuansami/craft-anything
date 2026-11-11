#!/usr/bin/env python3
"""Sum of the first n odd numbers, by direct addition, compared with n squared.

An independent numerical check of the identity proved symbolically in facts.json. Exact integer
arithmetic; no rounding anywhere.
"""
import json

SHOWN, N_MAX = 5, 1000

rows, total, mismatches = [], 0, 0
for n in range(1, N_MAX + 1):
    odd = 2 * n - 1
    total += odd
    if total != n * n:
        mismatches += 1
    if n <= SHOWN:
        rows.append({"n": n, "odd": odd, "sum": total, "square": n * n})

print(json.dumps({
    "values": {"mismatches": mismatches, "n_max": N_MAX, "shown": SHOWN, "last_sum": rows[-1]["sum"], "last_odd": rows[-1]["odd"]},
    "data": {"rows": rows},
}))
