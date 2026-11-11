// A year on Mars. 2D: the positions come from data/kepler.json (labs/kepler.py solves Kepler's equation).
import { seg, ease, clamp, rng, ui, svg } from 'studio';

export default async function build(stage) {
  const B = stage.beats, T = (k) => stage.text(k), D = stage.data.kepler, P = stage.style.palette;
  const z = stage.zone('subject');
  const scale = Math.min(z.w / 2 - 50, z.h / 2 - 30) / D.aphelion_mars_au; // pixels per unit distance
  const sunX = z.x + z.w / 2 + D.a_mars_au * 0.0935 * scale * 0.5, sunY = z.y + z.h * 0.46;
  const px = ([x, y]) => [sunX + x * scale, sunY - y * scale];
  const font = { 'font-family': 'var(--font)', 'font-weight': 700 };

  // Stars: seeded, so every render places them the same.
  const r = rng(11), stars = svg.S('g', {}, stage.art);
  for (let i = 0; i < 140; i++) svg.S('circle', { cx: r() * stage.w, cy: z.y - 120 + r() * (z.h + 200), r: 0.6 + r() * 1.6, fill: 'var(--text)', opacity: 0.15 + r() * 0.45 }, stars);

  const grad = svg.S('radialGradient', { id: 'sun' }, svg.S('defs', {}, stage.art));
  svg.S('stop', { offset: 0, 'stop-color': P.sun, 'stop-opacity': 1 }, grad);
  svg.S('stop', { offset: 0.3, 'stop-color': P.sun, 'stop-opacity': 0.55 }, grad);
  svg.S('stop', { offset: 1, 'stop-color': P.sun, 'stop-opacity': 0 }, grad);
  svg.S('circle', { cx: sunX, cy: sunY, r: 70, fill: 'url(#sun)' }, stage.art);
  svg.S('circle', { cx: sunX, cy: sunY, r: 20, fill: P.sun }, stage.art);
  svg.S('text', { x: sunX, y: sunY + 62, 'font-size': 24, fill: 'var(--muted)', 'text-anchor': 'middle', ...font }, stage.art, T('name_sun'));

  const bodies = [['earth', P.earth, 13], ['mars', P.mars, 10]].map(([id, color, radius]) => {
    const pts = D[id].map(px);
    // Faint full orbit (one lap of samples) and a bright trail up to "now".
    const lap = id === 'earth' ? pts.slice(0, Math.ceil(pts.length / D.t_end_years) + 2) : pts;
    svg.S('path', { d: svg.polyline(lap), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '3 9', opacity: 0.45 }, stage.art);
    const trail = svg.S('path', { fill: 'none', stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.9 }, stage.art);
    const dot = svg.S('circle', { r: radius, fill: color, stroke: 'var(--bg)', 'stroke-width': 3 }, stage.art);
    const name = svg.S('text', { 'font-size': 28, fill: color, 'text-anchor': 'middle', ...font }, stage.art, T('name_' + id));
    return { pts, trail, dot, name, radius };
  });
  const readout = svg.S('text', { x: z.x + z.w / 2, y: z.y + z.h - 14, 'font-size': 30, fill: 'var(--text)', 'text-anchor': 'middle', ...font }, stage.art);

  ui.wordmark(stage, T('wordmark')).show(1);
  const head = ui.header(stage, { title: T('title'), subtitle: T('subtitle') });
  const card1 = ui.card(stage, { heading: T('c1_heading'), note: T('c1_note') });
  const card2 = ui.card(stage, { heading: T('c2_heading'), math: T('c2_math'), note: T('c2_note') });

  return {
    update(t) {
      // Constant rate through the orbit beat: the planets' own speeds are the point, so no easing here.
      const f = B.p('orbit', t, 0, 1, ease.linear) * (D.times.length - 1), i = Math.min(Math.floor(f), D.times.length - 2), u = f - i;
      const years = D.times[i] + (D.times[i + 1] - D.times[i]) * u;
      for (const b of bodies) {
        const x = b.pts[i][0] + (b.pts[i + 1][0] - b.pts[i][0]) * u, y = b.pts[i][1] + (b.pts[i + 1][1] - b.pts[i][1]) * u;
        b.trail.setAttribute('d', svg.polyline([...b.pts.slice(Math.max(0, i - 150), i + 1), [x, y]]));
        svg.set(b.dot, { cx: x, cy: y });
        svg.set(b.name, { x, y: y - b.radius - 14 });
      }
      readout.textContent = T('readout').replace('{t}', years.toFixed(2)).replace('{e}', years.toFixed(2)).replace('{m}', (years / D.t_end_years).toFixed(2));
      svg.fade(readout, seg(t, B.get('orbit').t_start, B.get('orbit').t_start + 0.5));
      head.show(seg(t, 0.25, 0.9, ease.out));
      card1.show(B.on('orbit', t));
      card2.show(B.on('law', t));
    },
  };
}
