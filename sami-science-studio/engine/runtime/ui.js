// Overlay components. Each one is created once; what it shows at time t is set by show(p) with p in 0..1.
import katex from 'katex';
import { clamp } from './timeline.js';

const NS = 'http://www.w3.org/2000/svg';

/** LaTeX to HTML. Chemistry is written with \mathrm{}, e.g. \mathrm{H_2O}. */
export const tex = (src, display = false) => katex.renderToString(src, { throwOnError: true, displayMode: display, output: 'html' });

/** Inline markup for storyboard text: $...$ is LaTeX, {1|text} {2|text} {3|text} are accent colours. */
export function rich(str) {
  return String(str)
    .replace(/\$([^$]+)\$/g, (_, m) => tex(m))
    .replace(/\{([123m])\|([^}]*)\}/g, (_, k, s) => `<span class="${k === 'm' ? 'muted' : 'hl' + k}">${s}</span>`);
}

export function place(el, r) {
  if (r.x !== undefined) el.style.left = r.x + 'px';
  if (r.y !== undefined) el.style.top = r.y + 'px';
  if (r.w !== undefined) el.style.width = r.w + 'px';
  if (r.h !== undefined) el.style.height = r.h + 'px';
  return el;
}

function node(stage, cls, html = '') {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  el.style.opacity = 0;
  stage.overlay.appendChild(el);
  /** p = 0 hidden, 1 shown; dy is the slide distance in px while fading. */
  el.show = (p, dy = 14) => {
    p = clamp(p);
    el.style.opacity = p;
    el.style.transform = p >= 1 ? 'none' : `translateY(${(1 - p) * dy}px)`;
    return el;
  };
  return el;
}

export function wordmark(stage, text) {
  return place(node(stage, 'wordmark', text), { x: stage.zone('wordmark').x, y: stage.zone('wordmark').y });
}

export function header(stage, { title, subtitle = '', pill = '', zone = 'header', reserve = 0 }) {
  const el = node(stage, 'panel header',
    `<div class="titles"><div class="title">${rich(title)}</div>${subtitle ? `<div class="subtitle">${rich(subtitle)}</div>` : ''}</div>` +
    (pill ? `<div class="pill">${rich(pill)}</div>` : ''));
  // reserve: room on the right for step pills that change from beat to beat.
  if (reserve) el.style.paddingRight = reserve + 'px';
  return place(el, stage.zone(zone));
}

/** A step pill that sits on top of a header (several steps share one header). */
export function pill(stage, text, { zone = 'header' } = {}) {
  const z = stage.zone(zone);
  const el = node(stage, 'pill', rich(text));
  el.style.right = stage.w - (z.x + z.w) + 28 + 'px';
  el.style.top = z.y + z.h / 2 - 28 + 'px';
  return el;
}

/** Information card: heading, one equation, a note, an optional progress bar or custom body. */
export function card(stage, { heading = '', math = '', note = '', progress = false, body = '', zone = 'card' }) {
  const el = node(stage, 'panel card',
    (heading ? `<div class="heading">${rich(heading)}</div>` : '') +
    (math ? `<div class="math">${tex(math, true)}</div>` : '') +
    (body ? `<div class="body">${body}</div>` : '') +
    (progress ? `<div class="row"><div class="bar"><i></i></div><div class="value"></div></div>` : '') +
    (note ? `<div class="note">${rich(note)}</div>` : ''));
  place(el, stage.zone(zone));
  const fill = el.querySelector('.bar i'), value = el.querySelector('.value');
  /** Progress bar: p in 0..1 and the label to print (taken from data, not typed by hand). */
  el.progress = (p, label) => {
    if (fill) fill.style.width = clamp(p) * 100 + '%';
    if (value && label !== undefined && value.textContent !== label) value.textContent = label;
  };
  return el;
}

export function caption(stage, text, { zone = 'caption' } = {}) {
  return place(node(stage, 'panel caption', rich(text)), stage.zone(zone));
}

/**
 * Label with a leader line to a 3D point (or a fixed 2D point).
 * anchor: () => [x, y, z] in world units, or [x, y] in logical pixels. at: [x, y] top-left of the chip.
 */
export function callout(stage, { text, at, anchor, side = 'left' }) {
  const el = node(stage, 'chip', rich(text));
  place(el, { x: at[0], y: at[1] });
  const line = document.createElementNS(NS, 'line');
  const dot = document.createElementNS(NS, 'circle');
  for (const s of [line, dot]) { s.setAttribute('stroke', 'var(--chip-border, var(--accent2))'); s.setAttribute('stroke-width', 2.5); stage.lines.appendChild(s); }
  dot.setAttribute('r', 6); dot.setAttribute('fill', 'var(--bg)');
  let shown = 0;
  const base = el.show;
  el.show = (p) => { shown = clamp(p); return base(p, 0); };
  stage.onSync(() => {
    const a = typeof anchor === 'function' ? anchor() : anchor;
    const [ax, ay] = a.length === 3 ? stage.project(a) : a;
    const x0 = side === 'left' ? at[0] : at[0] + el.offsetWidth;
    const y0 = at[1] + el.offsetHeight / 2;
    // The line grows from the chip to the anchor as the label appears.
    line.setAttribute('x1', x0); line.setAttribute('y1', y0);
    line.setAttribute('x2', x0 + (ax - x0) * shown); line.setAttribute('y2', y0 + (ay - y0) * shown);
    dot.setAttribute('cx', ax); dot.setAttribute('cy', ay);
    line.style.opacity = shown; dot.style.opacity = shown >= 0.98 ? 1 : 0;
  });
  return el;
}
