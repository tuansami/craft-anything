// The one-drop flip. Timing comes from storyboard.json, text from storyboard.texts, constants from
// facts.json and the curve from data/titration.json (written by labs/titration.py).
import { seg, win, keys, ease, clamp, lerp, ui, lab, svg } from 'studio';

const FLASK_ML = 100, BURETTE_ML = 50; // sizes of the glassware drawn (geometry, not chemistry)
const BASE = 0.14, TIP = BASE + 2.9, DROP_PERIOD = 0.42, FALL = 0.3;

export default async function build(stage) {
  const { THREE, scene } = await stage.use3D();
  const B = stage.beats, T = (k) => stage.text(k), P = stage.style.palette, D = stage.data.titration;
  const at = (id, f = 0) => lerp(B.get(id).t_start, B.get(id).t_end, f);
  const va = stage.fact('va'), lo = stage.fact('ind_low'), hi = stage.fact('ind_high');

  // ---- apparatus
  scene.add(lab.bench(stage.style));
  const st = lab.stand(stage.style, { h: 7.9, clampY: 6.0, reach: 1.3, baseW: 3.6, baseD: 2.9, baseX: 1.3 });
  st.position.x = -1.3;
  const flask = lab.conicalFlask(stage.style);
  flask.group.position.y = BASE;
  const sample = flask.layer(P.acid, 0.55);
  const bur = lab.burette(stage.style, { h: 4 });
  bur.group.position.y = TIP;
  const titrant = bur.layer(P.base, 0.75);
  const b1 = lab.bottle(stage.style, { cap: '#2f5bd8', liquid: '#aebfda', lines: T('bottle_base').split('|') });
  b1.position.set(-2.7, 0, 0.5);
  const b2 = lab.bottle(stage.style, { cap: '#d9952b', liquid: '#b9c6dc', lines: T('bottle_acid').split('|') });
  b2.position.set(2.9, 0, 0.3);
  const drop = lab.drop(P.base, 0.065), flash = lab.glow(P.pink, 1);
  scene.add(st, flask.group, bur.group, b1, b2, drop, flash);
  const cAcid = new THREE.Color(P.acid), cPink = new THREE.Color(P.pink);
  stage.focus('subject');

  // ---- overlay
  ui.wordmark(stage, T('wordmark')).show(1);
  const head = ui.header(stage, { title: T('title'), subtitle: T('subtitle'), reserve: 320 });
  const pills = Object.fromEntries(['setup', 'titrate', 'endpoint', 'result'].map((id) => [id, ui.pill(stage, T('pill_' + id))]));
  const chipBase = ui.callout(stage, { text: T('chip_base'), at: stage.at('subject', 0.6, 0.2), anchor: () => [0, TIP + 2.6, 0.1] });
  const chipAcid = ui.callout(stage, { text: T('chip_acid'), at: stage.at('subject', 0.05, 0.6), side: 'right', anchor: () => [-0.45, BASE + 0.3, 0.9] });
  const chipPink = ui.callout(stage, { text: T('chip_pink'), at: stage.at('subject', 0.5, 0.05), anchor: () => [0.35, BASE + 0.55, 0.8] });
  const card1 = ui.card(stage, { heading: T('c1_heading'), math: T('c1_math'), note: T('c1_note') });
  const card4 = ui.card(stage, { heading: T('c4_heading'), math: T('c4_math'), note: T('c4_note') });

  function chartCard(headingKey, noteKey) {
    const el = ui.card(stage, { heading: T(headingKey), body: '<svg width="860" height="196" viewBox="0 0 860 196"></svg>', note: noteKey ? T(noteKey) : '&nbsp;' });
    const c = svg.chart(el.querySelector('svg'), { x: 96, y: 8, w: 690, h: 150, xr: [0, 30], yr: [0, 14], xTicks: [0, 10, 20, 30], yTicks: [0, 7, 14] });
    c.band(lo, hi, { fill: P.pink, opacity: 0.28 });
    c.text(30, 0, T('axis_x'), { dx: 14, dy: 7 });
    c.text(0, 14, T('axis_y'), { dx: -14, dy: -12, 'text-anchor': 'end' });
    return { el, c, line: c.line([[0, 0]]), dot: c.dot(), note: el.querySelector('.note') };
  }
  const card2 = chartCard('c2_heading', null), card3 = chartCard('c3_heading', 'c3_note');

  // ---- the one slow drop of the end point
  const hang = at('endpoint', 0.29), impact = hang + 0.45;

  const cam = [
    [0, [3.5, 5.0, 36, 0, 3.8, 0]], [at('setup', 1), [2.8, 4.7, 33.5, 0, 3.8, 0]],
    [at('titrate', 0.45), [2.6, 3.0, 17, 0, 2.2, 0]], [at('titrate', 1), [2.4, 2.8, 15, 0, 2.0, 0]],
    [at('endpoint', 0.4), [1.9, 2.3, 12.5, 0, 1.7, 0]], [at('endpoint', 1), [1.9, 2.3, 12.3, 0, 1.7, 0]],
    [at('result', 0.55), [3.0, 4.2, 26, 0, 3.0, 0]], [at('result', 1), [3.2, 4.3, 27, 0, 3.0, 0]],
  ];

  return {
    update(t) {
      // Volume of base delivered, then everything else follows from it.
      const V = D.v_before_drop_ml * B.p('titrate', t, 0, 1, ease.out) + (D.v_after_drop_ml - D.v_before_drop_ml) * seg(t, impact, impact + 0.7);
      const pH = svg.sample(D.curve, V);
      const pink = clamp((pH - lo) / (hi - lo));

      titrant.set(0.02, bur.columnTop - 0.2 - (V / BURETTE_ML) * (bur.columnTop - bur.columnBottom));
      const level = flask.levelFor((va + V) / FLASK_ML, 1.85);
      sample.set(0, level);
      sample.material.color.copy(cAcid).lerp(cPink, pink);
      sample.material.opacity = lerp(0.55, 0.9, pink);

      // Drops: a steady drip while titrating, then one drop that hangs and falls.
      const surface = BASE + level, bt = B.get('titrate'), be = B.get('endpoint');
      let y = null, size = 1, glow = 0;
      if (t >= bt.t_start + 0.3 && t < bt.t_end - 0.15) {
        const ph = (t - bt.t_start) % DROP_PERIOD;
        if (ph < FALL) y = TIP - (TIP - surface) * (ph / FALL) ** 2;
        // Near the end each drop leaves a pink flash that fades: local excess of base before it mixes in.
        else glow = seg(t, at('titrate', 0.55), bt.t_end) * 0.8 * Math.exp(-(ph - FALL) * 9);
      } else if (t >= be.t_start && t < impact) {
        size = t < hang ? seg(t, be.t_start + 0.2, hang, ease.out) : 1;
        y = t < hang ? TIP - 0.06 : TIP - 0.06 - (TIP - 0.06 - surface) * ((t - hang) / (impact - hang)) ** 2;
      } else if (t >= impact) {
        glow = 0.7 * Math.exp(-(t - impact) * 1.6);
      }
      drop.visible = y !== null && size > 0.02;
      if (drop.visible) { drop.position.set(0, y, 0); drop.scale.set(size, size * 1.35, size); }
      flash.visible = glow > 0.01;
      flash.position.set(0, surface, 0.4);
      flash.material.opacity = glow;
      flash.scale.setScalar(1.2 + (t >= impact ? seg(t, impact, impact + 1.2, ease.out) * 2.4 : 0));

      stage.cam(keys(t, cam));

      head.show(seg(t, 0.25, 0.9, ease.out));
      for (const id in pills) pills[id].show(B.on(id, t), 0);
      chipBase.show(B.on('setup', t));
      chipAcid.show(win(t, at('setup', 0.2), at('setup', 1)));
      chipPink.show(win(t, impact + 0.5, be.t_end));
      card1.show(B.on('setup', t));
      card2.el.show(B.on('titrate', t));
      card3.el.show(B.on('endpoint', t));
      card4.show(B.on('result', t));
      const drawn = D.curve.filter((p) => p[0] <= V);
      drawn.push([V, pH]);
      for (const c of [card2, card3]) {
        c.line.setAttribute('d', c.c.d(drawn));
        svg.set(c.dot, { cx: c.c.sx(V), cy: c.c.sy(pH) });
      }
      card2.note.textContent = T('readout').replace('{v}', V.toFixed(2)).replace('{ph}', pH.toFixed(2));
    },
  };
}
