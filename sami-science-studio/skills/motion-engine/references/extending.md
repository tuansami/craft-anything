# Extending the engine

## A new style pack

Copy `engine/styles/midnight-lab.json` to `engine/styles/<id>.json` and change values. Keys:

- `css`: variables read by `engine/runtime/base.css`. Background (`--bg`, `--bg-image`), panels
  (`--panel`, `--border`, `--radius`, `--panel-shadow`), text (`--text`, `--muted`), three accents,
  label chips (`--chip-bg`, `--chip-text`, `--chip-border`), title treatment (`--title-case`,
  `--title-size`), fonts, and the wordmark gradient.
- `three`: exposure, environment strength, ambient, key and rim lights, fog, bench, glass tint and
  opacity, fixture and metal colours.
- `palette`: named colours scenes may use (`acid`, `base`, `pink`, `teal`, `amber`, `water`). Keep the
  names; add new ones for all packs at once so every scene works in every style.
- `motion`: default fades and camera drift.

Check it by rendering an example in the new style: `render.cjs examples/chem-titration --style <id> --sheet 12`.
New fonts: add the `@fontsource/<name>` package to `engine/package.json` and its CSS to `player.html`.

## A new component

1. Put it in `engine/runtime/ui.js` (overlay), `lab3d.js` (3D) or `svg2d.js` (2D); for a new domain add a
   file (for example `space2d.js`) and export it from `index.js`.
2. It takes the style or stage, creates its nodes once, and exposes setters that the scene calls from
   `update(t)`. It holds no time state and uses no randomness without `rng(seed)`.
3. Colours come from the style pack; sizes from zones or arguments.
4. Use it in an example scene so there is a render that proves it.

## A new format

Add an entry to `FORMATS` in `engine/runtime/stage.js` (size, zones, safe margins) and to `SIZES` in
`engine/render/render.cjs`.

## A new check kind

Add a branch in `check_project` in `engine/verify/facts.py`, and document it in the `fact-ledger` skill.
