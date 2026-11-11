#!/usr/bin/env python3
"""Mars's year from Kepler's third law, and both planets' positions from Kepler's equation.

Model: two-body orbits round the Sun, in one plane, perihelia drawn in the same direction.
Third law with Earth as the unit: T [Earth years] = a^(3/2), a = semi-major axis / Earth's.
Position at time t: mean anomaly M = 2 pi t / T, solve E - e sin E = M by Newton's method,
then x = a (cos E - e), y = a sqrt(1 - e^2) sin E (Sun at the origin).
Inputs are the cited facts in facts.json; nothing is typed here.
"""
import json
import math

F = {f["id"]: f.get("value") for f in json.load(open("facts.json", encoding="utf-8"))["facts"]}
SAMPLES = 480


def eccentric_anomaly(m, e):
    x = m if e < 0.8 else math.pi
    for _ in range(50):
        step = (x - e * math.sin(x) - m) / (1 - e * math.cos(x))
        x -= step
        if abs(step) < 1e-14:
            break
    return x


def position(t_years, a, e, period_years):
    m = 2 * math.pi * (t_years / period_years % 1.0)
    big_e = eccentric_anomaly(m, e)
    return [round(a * (math.cos(big_e) - e), 5), round(a * math.sqrt(1 - e * e) * math.sin(big_e), 5)]


a_mars = F["a_mars_km"] / F["a_earth_km"]
t_mars = a_mars ** 1.5
t_mars_days = t_mars * F["p_earth_days"]
times = [t_mars * i / SAMPLES for i in range(SAMPLES + 1)]

print(json.dumps({
    "values": {
        "a_mars_au": a_mars,
        "t_mars_years": t_mars,
        "t_mars_days": t_mars_days,
        "rel_diff_from_measured": abs(t_mars_days - F["p_mars_days"]) / F["p_mars_days"],
    },
    "data": {
        "t_end_years": round(t_mars, 6),
        "a_mars_au": round(a_mars, 6),
        "aphelion_mars_au": round(a_mars * (1 + F["e_mars"]), 6),
        "times": [round(t, 5) for t in times],
        "earth": [position(t, 1.0, F["e_earth"], 1.0) for t in times],
        "mars": [position(t, a_mars, F["e_mars"], t_mars) for t in times],
    },
}))
