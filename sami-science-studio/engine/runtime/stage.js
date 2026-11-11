// The stage: one logical canvas size per format, named layout zones, an optional Three.js scene,
// an SVG art layer for 2D work, and a DOM overlay for cards and labels.
import { Beats } from './timeline.js';

export const FORMATS = {
  '9x16': {
    w: 1080, h: 1920,
    zones: {
      wordmark: { x: 56, y: 96, w: 600, h: 50 },
      header: { x: 56, y: 170, w: 968, h: 168 },
      subject: { x: 0, y: 350, w: 1080, h: 860 },
      card: { x: 56, y: 1216, w: 968, h: 396 },
      caption: { x: 56, y: 1500, w: 968, h: 90 },
    },
    // Keep text out of the area a Shorts/Reels player covers with its own buttons and titles.
    safe: { top: 90, bottom: 300, left: 56, right: 56 },
  },
  '16x9': {
    w: 1920, h: 1080,
    zones: {
      wordmark: { x: 64, y: 44, w: 600, h: 50 },
      header: { x: 64, y: 108, w: 900, h: 168 },
      subject: { x: 0, y: 200, w: 1180, h: 880 },
      card: { x: 1210, y: 330, w: 646, h: 560 },
      caption: { x: 360, y: 940, w: 1200, h: 90 },
    },
    safe: { top: 40, bottom: 50, left: 64, right: 64 },
  },
  '1x1': {
    w: 1080, h: 1080,
    zones: {
      wordmark: { x: 48, y: 40, w: 600, h: 50 },
      header: { x: 48, y: 100, w: 984, h: 150 },
      subject: { x: 0, y: 250, w: 1080, h: 520 },
      card: { x: 48, y: 780, w: 984, h: 260 },
      caption: { x: 48, y: 950, w: 984, h: 90 },
    },
    safe: { top: 40, bottom: 40, left: 48, right: 48 },
  },
};

export async function createStage({ format, style, project, storyboard, data }) {
  const F = FORMATS[format];
  if (!F) throw new Error(`unknown format "${format}" (have: ${Object.keys(FORMATS).join(', ')})`);
  const root = document.getElementById('stage');
  root.style.width = F.w + 'px';
  root.style.height = F.h + 'px';
  for (const [k, v] of Object.entries(style.css || {})) root.style.setProperty(k, v);
  for (const id of ['art', 'lines']) document.getElementById(id).setAttribute('viewBox', `0 0 ${F.w} ${F.h}`);

  const stage = {
    format, w: F.w, h: F.h, zones: F.zones, safe: F.safe, style, project, storyboard, data,
    beats: new Beats(storyboard),
    root,
    overlay: document.getElementById('overlay'),
    art: document.getElementById('art'),
    lines: document.getElementById('lines'),
    three: null,
    _sync: [],
    /** On-screen text comes from the storyboard only, so the fact lint covers everything shown. */
    text(key) {
      const v = (storyboard.texts || {})[key];
      if (v === undefined) throw new Error(`storyboard.texts has no "${key}"`);
      return typeof v === 'string' ? v : v.text;
    },
    zone(name) {
      const z = F.zones[name];
      if (!z) throw new Error(`format ${format} has no zone "${name}"`);
      return z;
    },
    /** A point inside a zone, as fractions of its width and height: layouts adapt to every format. */
    at(name, fx, fy) { const z = this.zone(name); return [z.x + z.w * fx, z.y + z.h * fy]; },
    /** A constant from the fact ledger. Scene code never types a scientific number itself. */
    fact(id) {
      const f = ((data.facts || {}).facts || []).find((x) => x.id === id);
      if (!f || typeof f.value !== 'number') throw new Error(`facts.json has no numeric fact "${id}"`);
      return f.value;
    },
    onSync(fn) { this._sync.push(fn); },
    render() {
      if (this.three) this.three.renderer.render(this.three.scene, this.three.camera);
      for (const fn of this._sync) fn();
    },
    exportSVG() {
      const svg = this.art.cloneNode(true);
      svg.setAttribute('width', F.w);
      svg.setAttribute('height', F.h);
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', F.w); bg.setAttribute('height', F.h);
      bg.setAttribute('fill', (style.css || {})['--bg'] || '#000');
      svg.insertBefore(bg, svg.firstChild);
      // Replace var(--token) with the style pack's value so the file opens the same in any SVG program.
      const css = style.css || {};
      const resolve = (s) => s.replace(/var\((--[\w-]+)(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, k, fb) => css[k] ?? (fb ? resolve(fb) : 'currentColor'));
      for (const el of [svg, ...svg.querySelectorAll('*')]) {
        for (const a of [...el.attributes]) if (a.value.includes('var(')) el.setAttribute(a.name, resolve(a.value));
      }
      return svg;
    },
  };

  /** Turn on WebGL. 2D-only scenes never call this, so they render fast and can export SVG. */
  stage.use3D = async () => {
    if (stage.three) return stage.three;
    const THREE = await import('three');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const cfg = style.three || {};
    const canvas = document.getElementById('gl');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(F.w, F.h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cfg.exposure ?? 1.0;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = cfg.envIntensity ?? 0.8;
    if (cfg.fog) scene.fog = new THREE.Fog(cfg.fog[0], cfg.fog[1], cfg.fog[2]);
    scene.add(new THREE.AmbientLight('#ffffff', cfg.ambient ?? 0.5));
    for (const key of ['key', 'rim']) {
      if (!cfg[key]) continue;
      const light = new THREE.DirectionalLight(cfg[key][1], cfg[key][0]);
      light.position.set(...cfg[key][2]);
      scene.add(light);
    }
    const camera = new THREE.PerspectiveCamera(28, F.w / F.h, 0.1, 200);
    const target = new THREE.Vector3();
    stage.three = { THREE, renderer, scene, camera, target };
    /** Camera from a flat [px, py, pz, tx, ty, tz] so it can be keyframed with keys(). */
    stage.cam = (v, fov) => {
      camera.position.set(v[0], v[1], v[2]);
      target.set(v[3], v[4], v[5]);
      camera.lookAt(target);
      if (fov && camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    };
    /** Put the camera's centre of view in the middle of a layout zone instead of the frame. */
    stage.focus = (zoneName) => {
      const z = stage.zone(zoneName);
      camera.setViewOffset(F.w, F.h, F.w / 2 - (z.x + z.w / 2), F.h / 2 - (z.y + z.h / 2), F.w, F.h);
    };
    const v = new THREE.Vector3();
    /** World point to logical pixels. */
    stage.project = (p) => {
      v.set(p[0], p[1], p[2]).project(camera);
      return [(v.x * 0.5 + 0.5) * F.w, (-v.y * 0.5 + 0.5) * F.h, v.z];
    };
    return stage.three;
  };

  return stage;
}
