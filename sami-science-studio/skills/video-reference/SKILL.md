---
name: video-reference
description: Analyse a sample video the person wants to imitate and write a full JSON spec of it (style, layout, camera, timeline, every on-screen text), then map it to a style pack and the engine's components. Use when given a reference or sample video, asked for a "prompt" or JSON to recreate a video, or asked to add a new visual style.
argument-hint: "<path to video file(s)>"
---

# From a sample video to a spec and a style

Studio root `$S` = `${CLAUDE_PLUGIN_ROOT}` (or the folder holding `engine/render/render.cjs`).

## 1. Probe (no model needed)

```bash
python3 -I $S/engine/tools/probe_video.py <video> --out <folder>
```

It writes `probe.json` (size, frame rate, duration, audio presence and level, scene cuts), a contact sheet
of 24 frames and a few full-size stills. Look at the sheet first; open stills only where text is too
small to read. To learn whether the audio is speech or music, transcribe it if a speech tool is available;
otherwise say it was not determined.

## 2. Write the spec

Write `<name>.video-spec.json` with the shape in `$S/schemas/video-spec.schema.json`. The four files in
`$S/references/samples/` are worked examples: copy the closest one and replace its contents.

- Record what is seen, with times. Mark anything unreadable as unreadable; do not guess text.
- Re-check the science: balance each equation, recompute sums. Put what does not hold under
  `science.weak_points_in_the_original`.
- `provenance.reuse` says how it may be used. A sample is a model of style and structure. The new video
  gets its own brand, wording, data and calculation; do not reproduce another channel's video or wordmark.

## 3. Map to the studio

- Style: choose the nearest pack in `$S/engine/styles/`. If none fits, add `<id>.json` there with the
  same keys as `midnight-lab.json` (CSS variables, 3D lighting, palette, motion). A pack is data only, so
  a new style needs no code. Render an existing example with `--style <id>` to check it.
- Components: list which `ui.*`, `lab.*` and `svg.*` parts cover the sample under `render.components`,
  and what is missing under `render.missing_components`. Missing parts are built once in
  `$S/engine/runtime/` and reused by every later video.

## 4. Hand over

The spec path, the style pack chosen or added, the missing components, and what could not be read.
To make a new video in that style, continue with the `science-video` skill using the spec as the model.
