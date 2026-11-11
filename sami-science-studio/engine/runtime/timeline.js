// Pure, deterministic time helpers. Every animated value is a function of t (seconds).
// Never use Math.random(), Date.now() or requestAnimationFrame state in a scene.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const mix = (a, b, p) => a.map((v, i) => lerp(v, b[i], p));

export const ease = {
  linear: (p) => p,
  in: (p) => p * p * p,
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outBack: (p) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2),
  smooth: (p) => p * p * (3 - 2 * p),
};

/** Progress 0..1 of t between a and b, eased. */
export const seg = (t, a, b, e = ease.inOut) => (b <= a ? (t >= b ? 1 : 0) : e(clamp((t - a) / (b - a))));

/** Visibility window: fades in at a, out at b. */
export const win = (t, a, b, fadeIn = 0.45, fadeOut = 0.35) =>
  Math.min(seg(t, a, a + fadeIn, ease.out), 1 - seg(t, b - fadeOut, b, ease.in));

/** Piecewise interpolation over [[time, value], ...]; value is a number or an array. */
export function keys(t, pts, e = ease.inOut) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const p = seg(t, pts[i - 1][0], pts[i][0], e);
      const a = pts[i - 1][1], b = pts[i][1];
      return Array.isArray(a) ? mix(a, b, p) : lerp(a, b, p);
    }
  }
  return pts[pts.length - 1][1];
}

/** Seeded random generator (mulberry32). Same seed, same sequence, on every machine. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Beat lookup built from storyboard.json: the director's timing drives the scene code. */
export class Beats {
  constructor(storyboard) {
    this.list = storyboard.timeline || [];
    this.map = Object.fromEntries(this.list.map((b) => [b.id, b]));
    this.duration = this.list.length ? this.list[this.list.length - 1].t_end : 0;
  }
  get(id) {
    const b = this.map[id];
    if (!b) throw new Error(`storyboard has no beat "${id}"`);
    return b;
  }
  /** Eased progress through a beat (optionally a sub-range given as fractions of the beat). */
  p(id, t, from = 0, to = 1, e = ease.inOut) {
    const b = this.get(id), d = b.t_end - b.t_start;
    return seg(t, b.t_start + d * from, b.t_start + d * to, e);
  }
  /** Visibility of something that lives for one beat (or from beat `id` to the end of beat `until`). */
  on(id, t, until = id, fadeIn = 0.45, fadeOut = 0.35) {
    return win(t, this.get(id).t_start, this.get(until).t_end, fadeIn, fadeOut);
  }
  current(t) {
    return this.list.find((b) => t >= b.t_start && t < b.t_end) || this.list[this.list.length - 1];
  }
}
