// Scene for this video. Rules: timing from storyboard beats (B), text from stage.text(), scientific
// constants from stage.fact(), curves from data files written by lab scripts. Pure function of t.
import { seg, win, keys, ease, clamp, lerp, ui, lab, svg } from 'studio';

export default async function build(stage) {
  const B = stage.beats, T = (k) => stage.text(k);
  ui.wordmark(stage, T('wordmark')).show(1);
  const head = ui.header(stage, { title: T('title') });

  return {
    update(t) {
      head.show(seg(t, 0.25, 0.9, ease.out));
    },
  };
}
