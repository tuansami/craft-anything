---
name: motion-engine
description: Build, preview and render a scene with the studio's deterministic motion-graphics engine (Three.js 3D lab kit, SVG charts, overlay cards and labels, style packs, frame-by-frame MP4 and SVG output). Use when writing or fixing scenes/main.js, adding a reusable component or a style pack, or rendering sheets, stills and final videos.
---

# Motion engine

Studio root `$S` = `${CLAUDE_PLUGIN_ROOT}` (or the folder holding `engine/render/render.cjs`).

A scene is one ES module: `export default async function build(stage)` returns `{ update(t) }`.
`update(t)` sets everything on screen for time `t` in seconds. It is a pure function of `t`: the renderer
asks for frames in any order, on several workers. No `Math.random()`, no clocks, no state carried from
one call to the next (use `rng(seed)` for scatter).

```js
import { seg, win, keys, ease, clamp, lerp, rng, ui, lab, svg } from 'studio';
```

Start from `$S/templates/project/scenes/main.js`; `$S/examples/` holds one finished scene per kind
(3D lab, 2D proof, orbit diagram).

## Where things come from

| Need | Use | Never |
|------|-----|-------|
| timing | `stage.beats` (`B.p(id, t)`, `B.on(id, t)`, `B.get(id).t_start`) | seconds typed in code |
| on-screen text | `stage.text(key)` from `storyboard.texts` | string literals |
| a scientific constant | `stage.fact(id)` | numbers typed in code |
| a curve or table | `stage.data.<name>` (from `project.json` `data`) | values typed in code |
| colours | `stage.style.palette`, CSS variables | hex codes in scenes |
| positions | `stage.zone(name)`, `stage.at(zone, fx, fy)` | pixel positions |

Numbers that change during the video (a readout) are formatted in code from data; their text template
(`"V = {v} mL"`) still lives in `storyboard.texts`.

## Time

- `seg(t, a, b, ease.inOut)`: progress 0..1 between two times.
- `win(t, a, b)`: fade in at `a`, out at `b`.
- `keys(t, [[time, value], ...])`: keyframes; values are numbers or arrays (a camera is 6 numbers).
- `B.p(beat, t, from, to)`: progress through a beat or part of it. `B.on(beat, t, untilBeat)`: visible
  for that beat.

## Stage and layout

Logical sizes: `9x16` 1080x1920, `16x9` 1920x1080, `1x1` 1080x1080. Zones per format: `wordmark`,
`header`, `subject`, `card`, `caption`. Place by zone so one scene renders in every format; text zones
already stay clear of the area a Shorts or Reels player covers.

3D: `const { THREE, scene } = await stage.use3D()`, then `stage.focus('subject')` (centres the camera's
view in that zone), `stage.cam([px, py, pz, tx, ty, tz])`, `stage.project([x, y, z])`.
2D: draw into `stage.art` with `svg.S(tag, attrs, parent)`. A scene that never calls `use3D()` renders
several times faster and can export SVG.

## Kit

Overlay (`ui`): `wordmark`, `header({title, subtitle, reserve})`, `pill`, `card({heading, math, note,
progress, body})`, `caption`, `callout({text, at, anchor, side})`, `tex(latex)`, `rich(text)`.
Each returns an element with `.show(p)`. Text markup: `$...$` LaTeX, `{1|text}` `{2|text}` `{3|text}`
accent colours, `<small>` second line in a chip. Titles may be upper-cased by a style: write chemical
symbols such as pH inside `$\mathrm{pH}$` when the title needs them.

3D lab (`lab`): `vessel(style, profile)` and its presets `testTube`, `beaker`, `conicalFlask`, `burette`;
each has `layer(color)` with `set(y0, y1)`, and `levelFor(fraction)` to set a level from a real volume.
Also `stand`, `bottle({lines})`, `bench`, `drop`, `glow`, `molecule({atoms, bonds})`.

Charts (`svg`): `chart(parent, {w, h, xr, yr, xTicks, yTicks})` with `line`, `d(points)`, `dot`, `band`,
`hline`, `vline`, `text`; `sample(curve, x)`; `drawOn(path, p)`.

Before writing a new part, check the kit. A part that a second video could use goes into
`$S/engine/runtime/` (see `references/extending.md`), not into the scene.

## Loop

```bash
python3 -I $S/engine/verify/lint_project.py <project>
node $S/engine/render/render.cjs <project> --sheet 12        # look at this
node $S/engine/render/render.cjs <project> --still 7.5       # one frame, full size, when needed
node $S/engine/render/render.cjs <project> --serve           # scrub in a browser
node $S/engine/render/render.cjs <project> --workers 4       # final MP4 in <project>/out
```

Options: `--format`, `--style`, `--scale` (0.5 for a draft, 2 for 4K), `--fps`, `--from`, `--to`,
`--audio <file>`, `--svg <t>` (2D scenes), `--png` (lossless frames), `--gpu` (use the machine's GPU
instead of software rendering).

Check on the sheet: text inside its panel and readable, nothing covering the header or card, labels
pointing at the right part, the subject inside the `subject` zone at every camera position, liquids
inside their glass, the last beat long enough to read. Fix, re-run the sheet, then render once.

Speed: a 3D scene renders at about 3 frames a second at 1080x1920 on four CPU cores with software
rendering; 2D scenes are much faster. Use `--scale 0.5` for drafts and a GPU machine for long videos.
