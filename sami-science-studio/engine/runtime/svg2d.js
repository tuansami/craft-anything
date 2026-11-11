// Small SVG helpers for 2D scenes and for charts inside cards. Everything here exports as plain SVG.
import { clamp } from './timeline.js';

const NS = 'http://www.w3.org/2000/svg';

export function S(tag, attrs = {}, parent = null, text = null) {
  const el = document.createElementNS(NS, tag);
  set(el, attrs);
  if (text !== null) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
}
export function set(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
export const fade = (el, p) => { el.style.opacity = clamp(p); return el; };

/** Reveal a path from its start: p = 0 nothing drawn, 1 fully drawn. */
export function drawOn(path, p) {
  const len = path._len ?? (path._len = path.getTotalLength());
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len * (1 - clamp(p));
  return path;
}

export const polyline = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');

/**
 * Chart frame: maps data to pixels. xr/yr are [min, max]. Returns scale functions and builders.
 * Colours come from CSS variables, so the chart follows the style pack.
 */
export function chart(parent, { x = 0, y = 0, w, h, xr, yr, xTicks = [], yTicks = [], xLabel = '', yLabel = '', fmt = (v) => v }) {
  const g = S('g', { transform: `translate(${x},${y})` }, parent);
  const sx = (v) => ((v - xr[0]) / (xr[1] - xr[0])) * w;
  const sy = (v) => h - ((v - yr[0]) / (yr[1] - yr[0])) * h;
  const axis = { stroke: 'var(--muted)', 'stroke-width': 2, fill: 'none', opacity: 0.7 };
  S('path', { d: `M0 0V${h}H${w}`, ...axis }, g);
  const label = { fill: 'var(--muted)', 'font-size': 20, 'font-family': 'var(--font)' };
  for (const v of xTicks) {
    S('path', { d: `M${sx(v)} ${h}v7`, ...axis }, g);
    S('text', { x: sx(v), y: h + 30, 'text-anchor': 'middle', ...label }, g, fmt(v));
  }
  for (const v of yTicks) {
    S('path', { d: `M0 ${sy(v)}h-7`, ...axis }, g);
    S('text', { x: -14, y: sy(v) + 7, 'text-anchor': 'end', ...label }, g, fmt(v));
  }
  if (xLabel) S('text', { x: w / 2, y: h + 62, 'text-anchor': 'middle', ...label }, g, xLabel);
  if (yLabel) S('text', { x: -52, y: h / 2, 'text-anchor': 'middle', transform: `rotate(-90 -52 ${h / 2})`, ...label }, g, yLabel);
  return {
    g, sx, sy,
    /** Path data for data points: use it to redraw a line up to the current value. */
    d: (points) => polyline(points.map(([a, b]) => [sx(a), sy(b)])),
    line(points, attrs = {}) {
      return S('path', { d: polyline(points.map(([a, b]) => [sx(a), sy(b)])), fill: 'none', stroke: 'var(--accent2)', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...attrs }, g);
    },
    dot(attrs = {}) { return S('circle', { r: 8, fill: 'var(--accent)', ...attrs }, g); },
    hline(v, attrs = {}) { return S('path', { d: `M0 ${sy(v)}H${w}`, stroke: 'var(--accent3)', 'stroke-width': 2, 'stroke-dasharray': '6 6', fill: 'none', ...attrs }, g); },
    vline(v, attrs = {}) { return S('path', { d: `M${sx(v)} 0V${h}`, stroke: 'var(--accent3)', 'stroke-width': 2, 'stroke-dasharray': '6 6', fill: 'none', ...attrs }, g); },
    band(y0, y1, attrs = {}) { return S('rect', { x: 0, y: sy(y1), width: w, height: sy(y0) - sy(y1), fill: 'var(--accent)', opacity: 0.14, ...attrs }, g); },
    text(vx, vy, str, attrs = {}) { return S('text', { x: sx(vx), y: sy(vy), ...label, ...attrs }, g, str); },
  };
}

/** Value on a sampled curve [[x, y], ...] at x (linear interpolation). */
export function sample(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1], [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return points[points.length - 1][1];
}
