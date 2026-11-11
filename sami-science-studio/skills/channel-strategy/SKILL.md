---
name: channel-strategy
description: Plan and package science videos for YouTube and Facebook audiences in the US and Europe - channel profiles, series and content pillars, titles, descriptions, tags, calls to action, thumbnails, and the signature elements that make a channel hard to copy. Use when creating or editing a channel profile, planning a series or content calendar, or writing publish.json for a video.
argument-hint: "<channel id or new channel idea> [plan=<n> episodes]"
---

# Channel strategy and publishing

Studio root `$S` = `${CLAUDE_PLUGIN_ROOT}` (or the folder holding `engine/render/render.cjs`).

## Channel profile

One JSON file per channel in `$S/channels/`. It fixes what should not be decided again for each video:
promise, audience, tone and humour level (0 none to 3 central), pillars, formats and lengths, style pack,
signature elements, call-to-action patterns, title pattern, cadence, accuracy policy. Three profiles
ship: `pure-science`, `everyday-science`, `absurd-lab`. For a new channel copy the nearest one.

The director reads the profile before writing a storyboard; the publisher reads it before `publish.json`.

## publish.json

```json
{
  "youtube": {
    "titles": ["three candidates, the first is the pick"],
    "description": "first two lines carry the promise and the key term; then method, sources, chapters",
    "tags": ["specific first, broad last"],
    "chapters": [{ "t": 0, "label": "..." }],
    "category": "Education", "made_for_kids": false
  },
  "facebook": { "caption": "one or two lines, then the question" },
  "hashtags": ["3 to 5"],
  "cta": { "on_screen": "...", "description": "...", "pinned_comment": "..." },
  "thumbnail": { "still_t": 17.6, "text": "at most 3 words", "note": "what must be visible" },
  "sources": ["what the description must credit"],
  "disclosure": "how the visuals were made, if the platform asks"
}
```

`lint_project.py` checks lengths (title 100 characters, warns over 60; description 5000; tags 500 in
total), that a title and a call to action exist, and hashtag count.

Rules:

- The title states the exact, checkable surprise the video pays off, with the search term people use
  ("titration", "Kepler's third law"). No promise the video does not keep.
- The first 2 seconds show the result or the question, not a logo. The title on screen and the title in
  the listing say the same thing in different words.
- One call to action per video, after the payoff, and it points to the next episode or asks one
  answerable question.
- The description lists the method and sources from `facts.json` (cited facts with their locators). This
  is both honest and a reason for people to trust and link the video.
- Write for US and European readers: plain English, SI units with a familiar comparison, spelling per
  the channel profile.

More, including series design, retention patterns, a posting plan and what keeps a channel hard to copy:
`references/playbook.md`.
