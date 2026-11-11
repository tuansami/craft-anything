// Reusable 3D lab kit. Every vessel is a lathe (a profile spun round the y axis), so one piece of code
// makes test tubes, flasks, beakers and burettes, and liquid always fits the glass it is in.
import * as THREE from 'three';

const col = (c) => new THREE.Color(c);

/**
 * Glass without the cost of real refraction: nearly clear where you look straight through it and
 * brighter towards the edges (a Fresnel term), which is what makes a vessel read as glass.
 */
export function glassMaterial(style) {
  const c = style.three || {};
  const m = new THREE.MeshPhysicalMaterial({
    color: col(c.glassTint || '#cfe2ff'), roughness: 0.05, metalness: 0, transparent: true, opacity: 1,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.04,
  });
  const lo = (c.glassOpacity ?? 0.2) * 0.3, hi = c.glassEdge ?? 0.75;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      `#include <opaque_fragment>
       float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
       gl_FragColor.a = mix(${lo.toFixed(3)}, ${hi.toFixed(3)}, fres);`);
  };
  return m;
}

export function liquidMaterial(color, opacity = 0.82) {
  return new THREE.MeshPhysicalMaterial({ color: col(color), roughness: 0.35, transparent: true, opacity, depthWrite: false, envMapIntensity: 0.25 });
}

export const solid = (color, roughness = 0.55, metalness = 0) => new THREE.MeshStandardMaterial({ color: col(color), roughness, metalness });

/** Radius of a profile [[r, y], ...] at height y. */
function radiusAt(profile, y) {
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
    if (y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][0];
}

/**
 * A glass vessel from a profile [[radius, height], ...] listed bottom to top.
 * layer(color) adds a liquid whose surface you move with set(yBottom, yTop).
 */
export function vessel(style, profile, { wall = 0.93, segments = 48 } = {}) {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), glassMaterial(style));
  glass.renderOrder = 3;
  group.add(glass);
  const top = profile[profile.length - 1];
  const rim = new THREE.Mesh(new THREE.TorusGeometry(top[0], Math.max(0.012, top[0] * 0.035), 10, segments), glassMaterial(style));
  rim.rotation.x = Math.PI / 2; rim.position.y = top[1]; rim.renderOrder = 3;
  group.add(rim);
  const yMin = profile[0][1], yMax = top[1];
  const inner = (y) => radiusAt(profile, y) * wall;
  // Volume of revolution up to each height, so a liquid level can be set from a real volume.
  const STEPS = 400, cum = [0];
  for (let i = 1; i <= STEPS; i++) {
    const y = yMin + ((yMax - yMin) * (i - 0.5)) / STEPS;
    cum.push(cum[i - 1] + Math.PI * inner(y) ** 2 * ((yMax - yMin) / STEPS));
  }
  const volumeTo = (y) => {
    const f = ((Math.min(Math.max(y, yMin), yMax) - yMin) / (yMax - yMin)) * STEPS, i = Math.min(Math.floor(f), STEPS - 1);
    return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
  };
  const api = {
    group, glass, yMin, yMax, inner, volumeTo,
    /** Surface height when the liquid fills `fraction` of the volume below yFull (bisection on the profile). */
    levelFor(fraction, yFull = yMax) {
      const want = volumeTo(yFull) * fraction;
      let lo = yMin, hi = yFull;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (volumeTo(mid) < want) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    },
    layer(color, opacity) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), liquidMaterial(color, opacity));
      mesh.renderOrder = 1;
      group.add(mesh);
      let last = '';
      return {
        mesh, material: mesh.material,
        /** Fill between two heights (world units of the vessel). Hidden when empty. */
        set(y0, y1) {
          y0 = Math.max(y0, yMin + 0.01); y1 = Math.min(y1, yMax);
          const key = y0.toFixed(3) + ':' + y1.toFixed(3);
          if (key === last) return;
          last = key;
          mesh.visible = y1 - y0 > 0.004;
          if (!mesh.visible) return;
          const pts = [new THREE.Vector2(0, y0)];
          // Follow the glass: sample the profile's own corners plus an even grid between the two heights.
          const ys = [y0, y1, ...profile.map((p) => p[1]).filter((y) => y > y0 && y < y1)];
          for (let i = 1; i < 12; i++) ys.push(y0 + ((y1 - y0) * i) / 12);
          ys.sort((a, b) => a - b);
          for (const y of ys) pts.push(new THREE.Vector2(Math.max(inner(y), 0.001), y));
          pts.push(new THREE.Vector2(0, y1));
          mesh.geometry.dispose();
          mesh.geometry = new THREE.LatheGeometry(pts, segments);
        },
        color(c) { mesh.material.color.set(c); },
      };
    },
  };
  return api;
}

const arc = (r, cy, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const a = -Math.PI / 2 + (Math.PI / 2) * (i / n);
  return [Math.max(r * Math.cos(a), 0.001), cy + r * Math.sin(a)];
});

export const testTube = (style, { r = 0.42, h = 4.2 } = {}) => vessel(style, [...arc(r, r), [r, h], [r * 1.1, h + 0.05]]);

export const beaker = (style, { r = 1, h = 2.2 } = {}) => vessel(style, [[0.001, 0], [r * 0.96, 0], [r, 0.08], [r, h], [r * 1.06, h + 0.06]]);

export const conicalFlask = (style, { r = 1.15, h = 2.6, neck = 0.3, neckH = 0.75 } = {}) =>
  vessel(style, [[0.001, 0], [r * 0.96, 0], [r, 0.1], [neck, h - neckH], [neck, h], [neck * 1.18, h + 0.05]]);

/** Burette: a long narrow tube with a tap and a tip. The liquid column is the reading. */
export function burette(style, { r = 0.11, h = 5, tip = 0.55 } = {}) {
  const v = vessel(style, [[0.02, 0], [0.035, tip * 0.6], [r, tip], [r, tip + h]], { wall: 0.86, segments: 24 });
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 16), solid(style.three?.fixture || '#3a6fd8', 0.4));
  tap.rotation.z = Math.PI / 2; tap.position.y = tip * 0.8;
  v.group.add(tap);
  // Graduation marks every tenth of the tube.
  const marks = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: col(style.three?.mark || '#dfe9ff'), transparent: true, opacity: 0.7 });
  for (let i = 0; i <= 20; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(i % 2 ? 0.07 : 0.12, 0.012, 0.004), mat);
    m.position.set(0, tip + (h * i) / 20, r + 0.004);
    marks.add(m);
  }
  v.group.add(marks);
  v.columnBottom = tip; v.columnTop = tip + h; v.tipY = 0;
  return v;
}

/** Stand with a base, a rod and a clamp arm reaching out along +x at clampY. */
export function stand(style, { h = 7.2, clampY = 5, reach = 1.2, baseW = 2.2, baseD = 1.5, baseX = null } = {}) {
  const g = new THREE.Group();
  const metal = solid(style.three?.metal || '#8b95a8', 0.35, 0.7);
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, 0.14, baseD), solid(style.three?.base || style.three?.fixture || '#27345c', 0.6));
  base.position.set(baseX ?? reach * 0.5, 0.07, 0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 16), metal);
  rod.position.y = h / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(reach, 0.07, 0.07), metal);
  arm.position.set(reach / 2, clampY, 0);
  const boss = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), solid('#20242e', 0.5));
  boss.position.set(0, clampY, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 24), solid('#20242e', 0.5));
  ring.rotation.x = Math.PI / 2; ring.position.set(reach, clampY, 0);
  g.add(base, rod, arm, boss, ring);
  return g;
}

/** Reagent bottle with a printed label. lines: [big, small, ...]. */
export function bottle(style, { r = 0.5, h = 1.5, cap = '#2f5bd8', liquid = '#9fb0c8', lines = [] } = {}) {
  const g = new THREE.Group();
  const prof = [[0.001, 0], [r, 0], [r, h * 0.72], [r * 0.42, h * 0.9], [r * 0.42, h]].map(([a, b]) => new THREE.Vector2(a, b));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), new THREE.MeshPhysicalMaterial({ color: col(liquid), roughness: 0.25, transparent: true, opacity: 0.9, clearcoat: 1 }));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, h * 0.2, 28), solid(cap, 0.45));
  top.position.y = h * 1.07;
  g.add(body, top);
  if (lines.length) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 320;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f6fa'; x.fillRect(0, 0, 512, 320);
    x.fillStyle = cap; x.fillRect(0, 0, 512, 34); x.fillRect(0, 286, 512, 34);
    x.fillStyle = '#1a2233'; x.textAlign = 'center';
    lines.forEach((s, i) => { x.font = `${i === 0 ? '700 84px' : '500 40px'} Inter, sans-serif`; x.fillText(s, 256, i === 0 ? 150 : 150 + i * 62); });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.42, 40, 1, true, -0.9, 1.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    label.position.y = h * 0.38;
    g.add(label);
  }
  return g;
}

export function bench(style, { size = 60, y = 0 } = {}) {
  const mat = solid(style.three?.bench || '#141d3a', 0.95);
  mat.envMapIntensity = style.three?.benchEnv ?? 0.15;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y;
  return m;
}

/** Soft additive glow (a reaction zone, a hot spot, a highlight). */
export function glow(color, size = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: col(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size); s.renderOrder = 4;
  return s;
}

export const drop = (color, r = 0.05) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), liquidMaterial(color, 0.95));
  m.scale.y = 1.35; m.renderOrder = 2;
  return m;
};

// CPK-style element colours and display radii (display only: not to scale with real atomic radii).
export const ELEMENTS = {
  H: ['#f2f4f8', 0.2], C: ['#5b6170', 0.3], N: ['#3b6cf0', 0.3], O: ['#e0323c', 0.29], S: ['#e7c33a', 0.36],
  Cl: ['#3ccf5a', 0.35], Na: ['#a45fe6', 0.4], Fe: ['#d9631e', 0.42], Cu: ['#c8803a', 0.42], P: ['#f08a24', 0.36],
};

/** Ball-and-stick model. atoms: [{el, p: [x, y, z]}], bonds: [[i, j]] (indices into atoms). */
export function molecule({ atoms, bonds = [], scale = 1 }) {
  const g = new THREE.Group();
  for (const a of atoms) {
    const [c, r] = ELEMENTS[a.el] || ['#cccccc', 0.3];
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 28, 20), solid(c, 0.3));
    m.position.set(...a.p);
    g.add(m);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, j] of bonds) {
    const a = new THREE.Vector3(...atoms[i].p), b = new THREE.Vector3(...atoms[j].p);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, a.distanceTo(b), 12), solid('#b8c0cf', 0.4));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    g.add(m);
  }
  return g;
}
