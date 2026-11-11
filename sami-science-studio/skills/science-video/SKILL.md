---
name: science-video
description: Produce a fact-checked science motion-graphics video (maths, space, chemistry; later physics and machines) from a topic, a document or lab notes, through to a rendered MP4 or SVG and a publishing pack. Use when asked to make, plan, storyboard, render or batch science explainer videos, Shorts or Reels for a channel.
argument-hint: "<topic or path to source material> [channel=<id>] [format=9x16|16x9|1x1] [style=<pack>] [profile=premium|balanced|opus-only|carbon]"
---

# Science video pipeline

Studio root: `${CLAUDE_PLUGIN_ROOT}` (if that text is not replaced by a path, the root is the folder that
holds `engine/render/render.cjs`; find it once and reuse it). Below, `$S` means the studio root.

A video is a **project folder** of small files. Each stage reads a few files and writes a few files, so
any stage can be redone, handed to another model, or run in another tool.

```
<project>/
  project.json      id, channel, style, format, fps, duration, data files
  sources/          what the person supplied (papers, lab sheets, notes)
  storyboard.json   the director's spec: intent, timeline beats, every on-screen text
  facts.json        the fact ledger: every number, formula and equation, and how it was checked
  labs/*.py         calculations that produce numbers and curves  ->  data/*.json
  scenes/main.js    the animation, a pure function of time
  publish.json      titles, description, tags, call to action, thumbnail brief
  out/              sheets, stills, MP4, SVG, reports
```

## Stages

| # | Stage | Role | Reads | Writes | Gate |
|---|-------|------|-------|--------|------|
| 0 | Set up | you | request, `$S/channels/<id>.json` | project from template | channel, style and format exist |
| 1 | Direct | director | brief, `sources/`, channel profile | `storyboard.json`, claims in `facts.json` | every claim is listed |
| 2 | Verify | fact checker | `storyboard.json`, `facts.json`, `sources/` | `labs/`, `data/`, finished `facts.json` | `facts.py` exits 0 |
| 3 | Build | scene builder | `storyboard.json`, `facts.json`, `data/` | `scenes/main.js` | `lint_project.py` exits 0; contact sheet looked at |
| 4 | Review | director | contact sheet, lint output | at most 5 fixes, or approval | at most 2 rounds |
| 5 | Render | no model | project | `out/*.mp4` (or `.svg`) | file exists, duration matches |
| 6 | Publish | publisher | `storyboard.json`, channel profile | `publish.json`, thumbnail still | lint passes with `publish.json` |

Commands:

```bash
python3 -I $S/engine/tools/new_project.py <project> --id <slug> --title "<title>" --channel <id> [--style <pack>] [--format 9x16]
python3 -I $S/engine/verify/facts.py <project> --write      # run labs, store data, check every fact
python3 -I $S/engine/verify/lint_project.py <project>       # add --strict before publishing
node $S/engine/render/render.cjs <project> --sheet 12       # one small contact sheet
node $S/engine/render/render.cjs <project> --still 7.5      # one full-size frame
node $S/engine/render/render.cjs <project> [--format 16x9] [--style clean-bench] [--scale 1]
```

First use on a machine: `cd $S/engine && npm install` (and `npm i playwright && npx playwright install chromium`
if Playwright is not already there), `pip install sympy`, and ffmpeg on PATH.

## Who does what

Roles map to the plugin's agents: `science-director`, `fact-checker`, `scene-builder`, `publisher`.
Models and effort per role are in `$S/config/models.json`; use the `premium` profile unless the request
names another. Where agents are not available (Antigravity, a single chat), play the roles in order
yourself and keep the same files and gates.

Hand an agent **paths, not contents**: the project folder, the stage it owns, and what "done" means.
Ask for a reply of five lines or fewer: what it wrote, which gate passed, what is unresolved.

## Rules that keep it accurate

1. Nothing appears on screen unless it is in `storyboard.texts`. Scene code reads text with `stage.text()`.
2. Every number in a text names the fact behind it (`"facts": [...]`). The lint refuses the rest.
3. Scene code takes constants from `stage.fact(id)` and curves from `data/*.json`. It types no science.
4. A failing fact is fixed by changing the script or dropping the claim, never by editing the number
   until it passes. A cited fact stays "unconfirmed" until a person confirms it; say so in the hand-over.
5. If the source material and a calculation disagree, stop and report both. Do not pick one.
6. Report what was verified and what was not. "Rendered" means the MP4 exists and was looked at.

Details: the `fact-ledger` skill.

## Rules that keep it cheap

- Think once, in the director stage. Later stages follow the storyboard and do not reopen its decisions.
- Scripts check; models do not re-read. Run `facts.py` and `lint_project.py` and act on their output.
- Look at one contact sheet (12 frames, low resolution). Ask for a full-size still only for a beat that
  looks wrong. Never read every frame.
- The director does not read engine code. The builder does not read `sources/`.
- Reuse before writing: the lab kit and UI components (`motion-engine` skill), lab scripts from earlier
  projects, a channel's series template, facts already confirmed in another project of the same series.
- A series is directed once (`series.json`: shared hook pattern, beat lengths, card layout), then each
  episode needs only new texts, facts and data. Episodes can be built in parallel.
- Render the sheet at the default low scale; render the final once.

## Sample videos

When the person sends a video to imitate, use the `video-reference` skill first. It produces a
`*.video-spec.json` (the same shape as `storyboard.json`) and says which style pack and components exist
and which are missing. Four worked examples are in `$S/references/samples/`.

## Channels and publishing

The channel profile decides tone, humour, style pack, signature elements and the call to action. Read
`$S/channels/<id>.json`; the `channel-strategy` skill covers search, titles, the publishing pack and what
keeps a channel hard to copy.

## Hand-over

End with: the output files, the lint line, the facts line (pass / unconfirmed / fail counts), the cited
facts that still need a person, and anything you could not check.
