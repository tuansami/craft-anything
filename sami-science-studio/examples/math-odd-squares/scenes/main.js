// Odd numbers hide squares: a 2D proof. No WebGL, so it renders fast and exports as SVG.
// The rows (odd number, running sum, square) come from data/odds.json, written by labs/odds.py.
import { seg, ease, clamp, lerp, ui, svg } from 'studio';

export default async function build(stage) {
  const B = stage.beats, T = (k) => stage.text(k), rows = stage.data.odds.rows, N = rows.length;
  const z = stage.zone('subject');
  const cell = Math.min(z.w * 0.56, z.h * 0.68) / N, x0 = z.x + (z.w - cell * N) / 2, y0 = z.y + z.h * 0.05;
  const fills = ['var(--accent)', 'var(--accent2)', 'var(--accent3)'];
  const font = { 'font-family': 'var(--font)', 'font-weight': 700, 'text-anchor': 'middle' };

  // Faint outline of the full grid, then one L-shaped strip per odd number.
  const guide = svg.S('g', { opacity: 0.18 }, stage.art);
  for (let i = 0; i <= N; i++) {
    svg.S('path', { d: `M${x0 + i * cell} ${y0}v${cell * N}M${x0} ${y0 + i * cell}h${cell * N}`, stroke: 'var(--text)', 'stroke-width': 2 }, guide);
  }
  const strips = rows.map((row, r) => {
    const k = row.n, cells = [];
    const order = [...Array.from({ length: k }, (_, j) => [k - 1, j]), ...Array.from({ length: k - 1 }, (_, i) => [k - 2 - i, k - 1])];
    for (const [i, j] of order) {
      const cx = x0 + (i + 0.5) * cell, cy = y0 + (N - j - 0.5) * cell;
      cells.push({ cx, cy, el: svg.S('rect', { rx: 6, fill: fills[r % fills.length], stroke: 'var(--text)', 'stroke-width': 2.5 }, stage.art) });
    }
    const corner = svg.S('text', { x: x0 + (k - 0.5) * cell, y: y0 + (N - k + 0.5) * cell + cell * 0.14, 'font-size': cell * 0.4, fill: 'var(--bg)', ...font }, stage.art, String(row.odd));
    const line = svg.S('text', { x: z.x + z.w / 2, y: y0 + N * cell + cell * 0.75, 'font-size': cell * 0.42, fill: 'var(--text)', ...font }, stage.art,
      T('sumline').replace('{terms}', rows.slice(0, k).map((x) => x.odd).join(' + ')).replace('{sum}', row.sum).replace('{n}', k));
    return { cells, corner, line };
  });

  ui.wordmark(stage, T('wordmark')).show(1);
  const head = ui.header(stage, { title: T('title'), subtitle: T('subtitle') });
  const card1 = ui.card(stage, { heading: T('c1_heading'), note: T('c1_note') });
  const card2 = ui.card(stage, { heading: T('c2_heading'), math: T('c2_math'), note: T('c2_note') });

  return {
    update(t) {
      head.show(seg(t, 0.2, 0.8, ease.out));
      svg.fade(guide, seg(t, 0.6, 1.6) * 0.18);
      strips.forEach((s, r) => {
        // Strip r owns one slice of the build beat; its squares land one after another.
        const a = r / N, b = (r + 1) / N;
        s.cells.forEach((c, i) => {
          const from = lerp(a, b, (i / s.cells.length) * 0.55), p = B.p('build', t, from, from + (b - a) * 0.35, ease.outBack);
          const size = cell * 0.94 * clamp(p, 0, 1.08);
          svg.set(c.el, { x: c.cx - size / 2, y: c.cy - size / 2, width: Math.max(size, 0), height: Math.max(size, 0), opacity: clamp(p * 3) });
        });
        svg.fade(s.corner, B.p('build', t, lerp(a, b, 0.4), lerp(a, b, 0.7)));
        const next = r + 1 < N ? B.p('build', t, b, b + (b - a) * 0.15) : 0;
        svg.fade(s.line, B.p('build', t, lerp(a, b, 0.3), lerp(a, b, 0.6)) * (1 - next));
      });
      card1.show(B.on('build', t));
      card2.show(B.on('result', t));
    },
  };
}
