// Loads project.json + storyboard.json + the style pack, builds the scene, and exposes
// window.__seek(t) for the frame-by-frame renderer. With ?play=1 it plays in real time for preview.
import { createStage } from './stage.js';

const q = new URLSearchParams(location.search);
const getJSON = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
};

async function main() {
  const project = await getJSON('/project/project.json');
  const storyboard = await getJSON('/project/' + (project.storyboard || 'storyboard.json'));
  const format = q.get('format') || project.format || '9x16';
  const styleId = q.get('style') || project.style || 'midnight-lab';
  const style = await getJSON(`/engine/styles/${styleId}.json`);
  const data = {};
  for (const [k, file] of Object.entries(project.data || {})) data[k] = await getJSON('/project/' + file);
  data.facts = await getJSON('/project/facts.json').catch(() => ({ facts: [] }));

  // Fonts first: canvas textures (bottle labels) are drawn once and must not fall back to a system font.
  await Promise.all(['400', '600', '700', '800'].map((w) => document.fonts.load(`${w} 20px Inter`)));
  const stage = await createStage({ format, style, project, storyboard, data });
  const mod = await import('/project/' + (project.scene || 'scenes/main.js'));
  const scene = await mod.default(stage);
  const duration = scene.duration ?? stage.beats.duration;

  await document.fonts.ready;
  window.__duration = duration;
  window.__fps = project.fps || 30;
  window.__seek = async (t) => {
    scene.update(Math.min(t, duration));
    stage.render();
  };
  window.__svg = () => new XMLSerializer().serializeToString(stage.exportSVG());
  await window.__seek(0);
  window.__ready = true;

  if (q.get('play')) {
    const scrub = document.getElementById('scrub'), bar = document.getElementById('bar');
    const clock = document.getElementById('clock'), pp = document.getElementById('pp');
    scrub.hidden = false;
    let playing = true, t = 0, last = performance.now();
    pp.onclick = () => { playing = !playing; pp.textContent = playing ? '⏸' : '▶'; last = performance.now(); };
    bar.oninput = () => { t = (bar.value / 1000) * duration; window.__seek(t); };
    const loop = (now) => {
      if (playing) {
        t = (t + (now - last) / 1000) % duration;
        bar.value = Math.round((t / duration) * 1000);
        window.__seek(t);
      }
      last = now;
      clock.textContent = `${t.toFixed(2)} / ${duration.toFixed(2)} s`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

main().catch((e) => {
  window.__error = String(e && e.stack ? e.stack : e);
  document.body.insertAdjacentHTML('beforeend', `<pre id="err">${window.__error.replace(/</g, '&lt;')}</pre>`);
});
