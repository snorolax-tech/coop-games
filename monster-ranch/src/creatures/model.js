// Builds a creature's 3D model from primitives, driven by the `model` block in
// data/creatures.js, and animates it (breathing, hopping, walking, wings, tail wag, blinking).
// Every creature faces +z in its local space.
import * as THREE from 'three';

const SPH = new THREE.SphereGeometry(1, 24, 16);
const SPH_LO = new THREE.SphereGeometry(1, 12, 8);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const OCTA = new THREE.OctahedronGeometry(1, 0);
const DODE = new THREE.DodecahedronGeometry(1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);

// Cartoon shading: a 4-step light ramp instead of smooth lighting.
const TOON_RAMP = (() => {
  const data = new Uint8Array([110, 170, 225, 255]);
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

const matCache = new Map();
function mat(color, emissive = 0, intensity = 0.6) {
  const key = color + '|' + emissive + '|' + intensity;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: TOON_RAMP, emissive: emissive || 0x000000, emissiveIntensity: emissive ? intensity : 1 });
    matCache.set(key, m);
  }
  return m;
}
const PUPIL = new THREE.MeshBasicMaterial({ color: 0x1b1b2f });
const SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const TONGUE = new THREE.MeshBasicMaterial({ color: 0xff6b8b });
const EYE_WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2b2d42, side: THREE.BackSide });
const irisCache = new Map();
const IRIS_MATS = new Set();
const _look = new THREE.Vector3();
const _wp = new THREE.Vector3();
let LOOK_TARGET = null;
/** Creatures within ~14 m look at this point (the game sets it to the camera each frame). */
export function setLookTarget(v) { LOOK_TARGET = v; }
function irisMat(hex) {
  let m = irisCache.get(hex);
  if (!m) {
    const c = new THREE.Color(hex);
    const hsl = {}; c.getHSL(hsl);
    // keep irises rich and readable: not too pale, not too dark
    c.setHSL(hsl.h, Math.min(0.75, Math.max(0.4, hsl.s)), Math.min(0.32, Math.max(0.2, hsl.l * 0.6)));
    m = new THREE.MeshBasicMaterial({ color: c });
    irisCache.set(hex, m);
    IRIS_MATS.add(m);
  }
  return m;
}
// set per build: iris colour + whether the species is grumpy (gets a fang)
let EYE_STYLE = { iris: '#3a86ff', grumpy: false };

function mesh(geo, material, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

function shinyColor(hex, shift) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.12) c.setHSL((hsl.h + 0.6) % 1, 0.45, Math.min(0.8, hsl.l)); // greys become pastel
  else c.offsetHSL(shift, 0.1, 0.02);
  return '#' + c.getHexString();
}

function palette(m, shiny) {
  const p = { body: m.body, belly: m.belly, accent: m.accent, wings: m.wings || m.accent };
  if (shiny) for (const k of Object.keys(p)) p[k] = shinyColor(p[k], 0.42);
  return p;
}

// --- eyes ----------------------------------------------------------------------

const SMILE = new THREE.TorusGeometry(1, 0.26, 6, 14, Math.PI);

function addEyes(head, parts, { spacing, y, z, r, angle = 0.35 }) {
  const iris = irisMat(EYE_STYLE.iris);
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * spacing, y, z);
    g.rotation.y = s * angle;
    const white = mesh(SPH, EYE_WHITE, g, 0, 0, 0, r, r * 1.12, r * 0.8);
    white.userData.noOutline = true;
    // the part that moves to look around
    const look = new THREE.Group(); g.add(look);
    mesh(SPH_LO, iris, look, 0, -r * 0.04, r * 0.48, r * 0.7, r * 0.8, r * 0.38);
    mesh(SPH_LO, PUPIL, look, 0, -r * 0.04, r * 0.6, r * 0.48, r * 0.56, r * 0.32);
    mesh(SPH_LO, SHINE, look, r * 0.24, r * 0.3, r * 0.8, r * 0.2);
    mesh(SPH_LO, SHINE, look, -r * 0.18, -r * 0.22, r * 0.8, r * 0.09);
    head.add(g);
    parts.eyes.push(g);
    parts.looks.push({ look, eye: g, r });
  }
  // mouth: a smile normally, opens up when happy or excited
  const my = y - r * 1.3, mz = z + r * 0.15;
  const smile = mesh(SMILE, PUPIL, head, 0, my, mz, r * 0.34);
  smile.rotation.z = Math.PI;
  smile.rotation.x = -0.3;
  const open = new THREE.Group(); open.position.set(0, my - r * 0.05, mz + r * 0.02); open.visible = false; head.add(open);
  mesh(SPH_LO, PUPIL, open, 0, 0, 0, r * 0.36, r * 0.26, r * 0.12);
  mesh(SPH_LO, TONGUE, open, 0, -r * 0.1, r * 0.04, r * 0.22, r * 0.1, r * 0.08);
  parts.smile = smile; parts.mouthOpen = open;
  if (EYE_STYLE.grumpy) {
    for (const s of [-1, 1]) {
      const f = mesh(CONE, SHINE, head, s * r * 0.24, my - r * 0.16, mz + r * 0.04, r * 0.08, r * 0.2, r * 0.08);
      f.rotation.z = Math.PI;
    }
  }
}

// --- features ---------------------------------------------------------------------

/** Point on the head sphere surface: (dirX, dirY, dirZ) normalised * radius. */
function surf(hr, x, y, z) {
  const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(hr);
  return [v.x, v.y, v.z];
}

function addEars(type, head, hr, pal, parts) {
  if (!type || type === 'none') return;
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    head.add(g);
    if (type === 'pointy') {
      g.position.set(...surf(hr, s * 0.55, 0.8, -0.1));
      g.rotation.z = -s * 0.35;
      mesh(CONE, mat(pal.body), g, 0, hr * 0.22, 0, hr * 0.28, hr * 0.6, hr * 0.18);
      mesh(CONE, mat(pal.belly), g, 0, hr * 0.2, hr * 0.06, hr * 0.15, hr * 0.4, hr * 0.06);
    } else if (type === 'round') {
      g.position.set(...surf(hr, s * 0.65, 0.75, 0));
      mesh(SPH, mat(pal.body), g, 0, 0, 0, hr * 0.26, hr * 0.26, hr * 0.12);
      mesh(SPH, mat(pal.belly), g, 0, 0, hr * 0.05, hr * 0.15, hr * 0.15, hr * 0.06);
    } else if (type === 'long') {
      g.position.set(...surf(hr, s * 0.35, 0.95, -0.1));
      g.rotation.z = -s * 0.18;
      mesh(SPH, mat(pal.body), g, 0, hr * 0.55, 0, hr * 0.18, hr * 0.62, hr * 0.1);
      mesh(SPH, mat(pal.belly), g, 0, hr * 0.55, hr * 0.05, hr * 0.1, hr * 0.48, hr * 0.05);
    } else if (type === 'fin') {
      g.position.set(...surf(hr, s * 1, 0.3, -0.1));
      g.rotation.z = -s * 1.1;
      mesh(CONE, mat(pal.accent), g, 0, hr * 0.2, 0, hr * 0.3, hr * 0.5, hr * 0.08);
    }
    parts.ears.push(g);
  }
}

function addTail(type, ctx) {
  if (!type) return;
  const { rig, pal, parts, tailPos, s: k } = ctx;
  const g = new THREE.Group();
  g.position.copy(tailPos);
  rig.add(g);
  parts.tail = g;
  switch (type) {
    case 'flame': {
      const fl = new THREE.Group(); fl.rotation.x = -0.7; g.add(fl);
      mesh(CONE, mat('#ff6b1a', 0xff4400, 0.9), fl, 0, 0.22 * k, -0.02, 0.13 * k, 0.45 * k, 0.13 * k);
      mesh(CONE, mat('#ffd23f', 0xffaa00, 0.9), fl, 0, 0.2 * k, 0.03, 0.08 * k, 0.32 * k, 0.08 * k);
      parts.flames.push(fl);
      break;
    }
    case 'fluffy': mesh(SPH, mat(pal.belly), g, 0, 0, -0.04 * k, 0.15 * k); break;
    case 'stub': mesh(SPH, mat(pal.body), g, 0, 0, -0.03 * k, 0.09 * k); break;
    case 'bolt': {
      const b = new THREE.Group(); b.rotation.x = -0.9; g.add(b);
      const m = mat(pal.body);
      mesh(BOX, m, b, 0, 0.12 * k, 0, 0.08 * k, 0.26 * k, 0.05 * k).rotation.z = 0.5;
      mesh(BOX, m, b, 0.06 * k, 0.3 * k, 0, 0.08 * k, 0.24 * k, 0.05 * k).rotation.z = -0.6;
      mesh(BOX, mat(pal.accent), b, 0, 0.47 * k, 0, 0.12 * k, 0.22 * k, 0.05 * k).rotation.z = 0.5;
      break;
    }
    case 'leaf': mesh(SPH, mat(pal.accent), g, 0, 0.05 * k, -0.2 * k, 0.12 * k, 0.03 * k, 0.25 * k); break;
    case 'fin': {
      const f = mesh(CONE, mat(pal.accent), g, 0, 0, -0.18 * k, 0.22 * k, 0.4 * k, 0.05 * k);
      f.rotation.x = -Math.PI / 2;
      f.scale.set(0.22 * k, 0.4 * k, 0.05 * k);
      f.rotation.z = Math.PI / 2;
      break;
    }
    case 'spiky': {
      const m = mat(pal.body);
      for (let i = 0; i < 3; i++) {
        mesh(SPH, m, g, 0, -i * 0.04 * k, -i * 0.13 * k, (0.1 - i * 0.02) * k);
        const c = mesh(CONE, mat(pal.accent), g, 0, (0.08 - i * 0.04) * k, -i * 0.13 * k, 0.05 * k, 0.14 * k, 0.05 * k);
        c.rotation.x = -0.3;
      }
      break;
    }
    case 'long': {
      const t = mesh(CYL, mat(pal.body), g, 0, -0.08 * k, -0.2 * k, 0.03 * k, 0.45 * k, 0.03 * k);
      t.rotation.x = -1.1;
      mesh(SPH, mat(pal.accent), g, 0, -0.18 * k, -0.42 * k, 0.09 * k, 0.12 * k, 0.09 * k);
      break;
    }
    case 'fan': {
      for (let i = -2; i <= 2; i++) {
        const f = new THREE.Group(); f.rotation.set(-0.5, 0, i * 0.35); g.add(f);
        mesh(SPH, mat(i % 2 ? pal.accent : pal.body), f, 0, 0.12 * k, -0.08 * k, 0.05 * k, 0.17 * k, 0.03 * k);
      }
      break;
    }
  }
}

function addFeature(name, ctx) {
  const { head, hr, rig, pal, parts, backPos, s: k, glow } = ctx;
  switch (name) {
    case 'cheeks':
      for (const sd of [-1, 1]) {
        const c = mesh(SPH_LO, mat(pal.accent === pal.belly ? '#ff9ebb' : '#ff9ebb'), head, ...surf(hr * 1.0, sd * 0.62, -0.15, 0.78), hr * 0.13, hr * 0.08, hr * 0.04);
        c.lookAt(head.localToWorld(new THREE.Vector3(sd * 3, -0.5, 4)));
      }
      break;
    case 'sprout': {
      const g = new THREE.Group(); g.position.set(0, hr * 0.95, 0); head.add(g);
      mesh(CYL, mat('#3f9b4a'), g, 0, hr * 0.15, 0, hr * 0.04, hr * 0.3, hr * 0.04);
      for (const sd of [-1, 1]) {
        const l = mesh(SPH, mat(pal.accent), g, sd * hr * 0.18, hr * 0.32, 0, hr * 0.2, hr * 0.06, hr * 0.11);
        l.rotation.z = sd * 0.4;
      }
      parts.sprout = g;
      break;
    }
    case 'flower': {
      const g = new THREE.Group(); g.position.set(0, hr * 0.95, 0); head.add(g);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        mesh(SPH, mat(pal.accent), g, Math.cos(a) * hr * 0.28, hr * 0.06, Math.sin(a) * hr * 0.28, hr * 0.2, hr * 0.07, hr * 0.2);
      }
      mesh(SPH, mat('#ffd60a'), g, 0, hr * 0.1, 0, hr * 0.16);
      break;
    }
    case 'horn': {
      const h = mesh(CONE, mat(pal.accent, glow ? pal.accent : 0, 0.4), head, ...surf(hr, 0, 0.8, 0.5), hr * 0.14, hr * 0.6, hr * 0.14);
      h.rotation.x = 0.5;
      break;
    }
    case 'horns':
      for (const sd of [-1, 1]) {
        const h = mesh(CONE, mat(pal.accent), head, ...surf(hr, sd * 0.45, 0.85, -0.1), hr * 0.13, hr * 0.55, hr * 0.13);
        h.rotation.set(-0.4, 0, -sd * 0.45);
      }
      break;
    case 'crest':
      for (let i = 0; i < 3; i++) {
        const c = mesh(CONE, mat(pal.accent), head, 0, hr * (0.95 - i * 0.12), hr * (0.15 - i * 0.32), hr * 0.12, hr * (0.5 - i * 0.1), hr * 0.04);
        c.rotation.x = -0.4 - i * 0.3;
      }
      break;
    case 'antennae':
      for (const sd of [-1, 1]) {
        const g = new THREE.Group(); g.position.set(...surf(hr, sd * 0.35, 0.9, 0.2)); g.rotation.set(0.4, 0, -sd * 0.4); head.add(g);
        mesh(CYL, mat(pal.body), g, 0, hr * 0.35, 0, hr * 0.035, hr * 0.7, hr * 0.035);
        mesh(SPH, mat(pal.accent, glow ? pal.accent : 0, 0.8), g, 0, hr * 0.72, 0, hr * 0.11);
        parts.ears.push(g);
      }
      break;
    case 'gem':
      mesh(OCTA, mat(pal.accent, pal.accent, 0.5), head, ...surf(hr * 1.02, 0, 0.55, 0.85), hr * 0.11, hr * 0.15, hr * 0.08);
      break;
    case 'bulb': {
      const g = new THREE.Group(); g.position.set(0, hr * 0.92, 0); head.add(g);
      const stalk = mesh(CYL, mat(pal.body), g, 0, hr * 0.3, hr * 0.1, hr * 0.04, hr * 0.62, hr * 0.04);
      stalk.rotation.x = 0.35;
      const b = mesh(SPH, mat(pal.accent, pal.accent, 0.9), g, 0, hr * 0.62, hr * 0.3, hr * 0.2);
      parts.glows.push(b);
      parts.ears.push(g);
      break;
    }
    case 'flameHead': {
      const g = new THREE.Group(); g.position.set(0, hr * 0.85, -hr * 0.1); head.add(g);
      const cols = [['#ff6b1a', 0xff4400], ['#ffd23f', 0xffaa00], ['#ff6b1a', 0xff4400]];
      cols.forEach(([c, e], i) => {
        const f = mesh(CONE, mat(c, e, 0.9), g, (i - 1) * hr * 0.22, hr * 0.25, 0, hr * 0.18, hr * (i === 1 ? 0.7 : 0.5), hr * 0.18);
        f.rotation.z = (1 - i) * 0.3;
      });
      parts.flames.push(g);
      break;
    }
    case 'mane': {
      const g = new THREE.Group(); g.position.set(0, -hr * 0.35, -hr * 0.35); head.add(g);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        mesh(SPH, mat(pal.accent, glow ? pal.accent : 0, 0.5), g, Math.cos(a) * hr * 0.7, Math.sin(a) * hr * 0.6 + hr * 0.3, -hr * 0.1, hr * 0.26);
      }
      break;
    }
    case 'shell': {
      const sh = mesh(SPH, mat(pal.accent), rig, backPos.x, backPos.y - 0.06 * k, backPos.z, ctx.bodyW * 1.08, ctx.bodyH * 0.85, ctx.bodyL * 1.05);
      sh.userData.part = 'shell';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        mesh(SPH_LO, mat(pal.belly), rig, backPos.x + Math.cos(a) * ctx.bodyW * 0.5, backPos.y + ctx.bodyH * 0.45, backPos.z + Math.sin(a) * ctx.bodyL * 0.5, ctx.bodyW * 0.22, ctx.bodyW * 0.08, ctx.bodyW * 0.22);
      }
      break;
    }
    case 'backSpikes':
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const c = mesh(CONE, mat(pal.accent), rig, ((i % 2) - 0.5) * 0.12 * k, backPos.y + 0.04 * k, backPos.z + (0.25 - t * 0.55) * k * (ctx.bodyL / (0.45 * k)), 0.07 * k, 0.28 * k, 0.07 * k);
        c.rotation.x = -0.5;
      }
      break;
    case 'crystals':
      for (let i = 0; i < 4; i++) {
        const c = mesh(OCTA, mat(pal.accent, pal.accent, 0.35), rig, (i - 1.5) * 0.09 * k, backPos.y + 0.12 * k, backPos.z + (i % 2 ? -0.12 : 0.06) * k, 0.07 * k, (0.18 + (i % 2) * 0.08) * k, 0.07 * k);
        c.rotation.set((i - 1.5) * 0.25, i, (i - 1.5) * 0.3);
        parts.glows.push(c);
      }
      break;
    case 'plates':
      for (let i = 0; i < 4; i++) {
        mesh(DODE, mat(pal.accent), rig, (i % 2 ? 0.1 : -0.1) * k, backPos.y + 0.02 * k, backPos.z + (0.1 - i * 0.1) * k, 0.12 * k, 0.09 * k, 0.12 * k).rotation.set(i, i * 2, 0);
      }
      break;
    case 'puffs':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        mesh(SPH, mat(i % 2 ? pal.body : pal.belly), ctx.bodyNode, Math.cos(a) * hr * 0.85, Math.sin(i * 1.7) * hr * 0.25, Math.sin(a) * hr * 0.75, hr * 0.38);
      }
      break;
    case 'wisps': {
      const g = new THREE.Group(); g.position.set(0, hr * 0.2, 0); ctx.bodyNode.add(g);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        mesh(SPH_LO, mat(pal.accent, pal.accent, 1), g, Math.cos(a) * hr * 1.5, 0, Math.sin(a) * hr * 1.5, hr * 0.12);
      }
      parts.orbit = g;
      break;
    }
    case 'leafCape':
      for (const sd of [-1, 1]) {
        const l = mesh(SPH, mat('#2d6a4f'), rig, sd * 0.16 * k, backPos.y - 0.05 * k, backPos.z - 0.05 * k, 0.14 * k, 0.4 * k, 0.05 * k);
        l.rotation.set(0.3, sd * 0.4, sd * 0.35);
      }
      break;
    case 'mossy':
      for (let i = 0; i < 5; i++) {
        mesh(SPH_LO, mat(i % 2 ? '#52b788' : '#74c69d'), head, ...surf(hr * 0.98, (i - 2) * 0.25, 0.9, -0.2 + (i % 2) * 0.3), hr * 0.14);
      }
      break;
    case 'fins':
      for (const sd of [-1, 1]) {
        const f = mesh(CONE, mat(pal.accent), ctx.bodyNode, sd * hr * 0.95, 0, -hr * 0.1, hr * 0.25, hr * 0.5, hr * 0.06);
        f.rotation.set(0, 0, -sd * 1.9);
        parts.wings.push(f);
      }
      break;
    case 'glowTail': {
      const b = mesh(SPH, mat(pal.accent, pal.accent, 1), rig, ctx.tailPos.x, ctx.tailPos.y, ctx.tailPos.z - 0.05 * k, 0.12 * k);
      parts.glows.push(b);
      break;
    }
  }
}

/**
 * Cartoon outlines ("inverted hull"): a slightly bigger, back-face-only dark copy behind
 * each main body part. Skips eyes, tiny details and glowing bits.
 */
function addOutlines(rig) {
  const list = [];
  rig.traverse((o) => {
    if (!o.isMesh || o.userData.noOutline || o.userData.outline) return;
    if (o.material === PUPIL || o.material === SHINE || o.material === EYE_WHITE || o.material === TONGUE || IRIS_MATS.has(o.material)) return;
    const em = o.material.emissive;
    if (em && (em.r + em.g + em.b) > 0.05) return; // flames, glowing crystals
    const big = Math.max(o.scale.x, o.scale.y, o.scale.z);
    const isSphere = o.geometry === SPH;
    const isPointy = o.geometry === CONE;
    if (!((isSphere && big >= 0.1) || (isPointy && big >= 0.12))) return;
    list.push(o);
  });
  for (const o of list) {
    const ol = new THREE.Mesh(o.geometry, OUTLINE);
    ol.position.copy(o.position);
    ol.quaternion.copy(o.quaternion);
    const k = o.geometry === CONE ? 1.12 : 1.07;
    ol.scale.copy(o.scale).multiplyScalar(k);
    ol.userData.outline = true;
    ol.userData.noHighlight = true;
    ol.raycast = () => {};
    o.parent.add(ol);
    o.userData.outlineMesh = ol;
  }
}

// --- body plans ---------------------------------------------------------------------

/**
 * Build a model. Returns a CreatureModel-like object:
 * { root, rig, parts, height, radius, hover, plan, update(dt, state) }
 */
export function buildCreatureModel(species, { shiny = false } = {}) {
  const m = species.model;
  const pal = palette(m, shiny);
  const k = 1; // build at unit scale, then scale the rig
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const parts = { eyes: [], looks: [], ears: [], legs: [], arms: [], wings: [], flames: [], glows: [], tail: null, segments: [], orbit: null, floatNode: null };
  const body = mat(pal.body), belly = mat(pal.belly);
  // iris takes the accent colour unless it's too close to the body colour
  const accent = new THREE.Color(pal.accent), bodyC = new THREE.Color(pal.body);
  const close = Math.abs(accent.r - bodyC.r) + Math.abs(accent.g - bodyC.g) + Math.abs(accent.b - bodyC.b) < 0.35;
  EYE_STYLE = { iris: close ? '#4a3b2a' : pal.accent, grumpy: species.personality === 'grumpy' };
  let head, hr, headPos, tailPos, backPos, height, bodyW = 0.4, bodyH = 0.4, bodyL = 0.4, bodyNode = rig, hover = 0;

  switch (m.plan) {
    case 'blob': {
      const b = mesh(SPH, body, rig, 0, 0.45, 0, 0.45, 0.42, 0.45);
      mesh(SPH, belly, rig, 0, 0.36, 0.17, 0.32, 0.28, 0.3);
      head = new THREE.Group(); head.position.set(0, 0.45, 0); rig.add(head); hr = 0.45;
      for (const s of [-1, 1]) parts.legs.push(mesh(SPH, body, rig, s * 0.2, 0.06, 0.16, 0.13, 0.08, 0.15));
      addEyes(head, parts, { spacing: 0.17, y: 0.1, z: 0.36, r: 0.12 });
      tailPos = new THREE.Vector3(0, 0.3, -0.42);
      backPos = new THREE.Vector3(0, 0.82, -0.12);
      bodyW = 0.45; bodyH = 0.42; bodyL = 0.45;
      height = 0.9;
      bodyNode = b;
      break;
    }
    case 'quad': {
      const L = m.legs ?? 0.3;
      const hip = L + 0.08;
      mesh(SPH, body, rig, 0, hip + 0.18, 0, 0.3, 0.26, 0.45);
      mesh(SPH, belly, rig, 0, hip + 0.1, 0.06, 0.24, 0.18, 0.34);
      head = new THREE.Group(); head.position.set(0, hip + 0.42, 0.42); rig.add(head); hr = 0.27;
      mesh(SPH, body, head, 0, 0, 0, hr);
      mesh(SPH, belly, head, 0, -0.07, 0.2, 0.14, 0.1, 0.12);
      mesh(SPH_LO, PUPIL, head, 0, -0.03, 0.315, 0.04, 0.03, 0.025);
      addEyes(head, parts, { spacing: 0.115, y: 0.06, z: 0.19, r: 0.085 });
      for (const [x, z] of [[-0.17, 0.26], [0.17, 0.26], [-0.17, -0.26], [0.17, -0.26]]) {
        const g = new THREE.Group(); g.position.set(x, hip, z); rig.add(g);
        mesh(CYL, body, g, 0, -L / 2, 0, 0.075, L + 0.04, 0.075);
        mesh(SPH, belly, g, 0, -L, 0.02, 0.085, 0.06, 0.1);
        // little toe beans
        for (const tx of [-0.035, 0.035]) mesh(SPH_LO, body, g, tx, -L - 0.005, 0.1, 0.03, 0.025, 0.03).userData.noOutline = true;
        parts.legs.push(g);
      }
      tailPos = new THREE.Vector3(0, hip + 0.25, -0.44);
      backPos = new THREE.Vector3(0, hip + 0.38, -0.05);
      bodyW = 0.3; bodyH = 0.26; bodyL = 0.45;
      height = hip + 0.72;
      break;
    }
    case 'biped': {
      mesh(SPH, body, rig, 0, 0.62, 0, 0.36, 0.4, 0.32);
      mesh(SPH, belly, rig, 0, 0.56, 0.13, 0.26, 0.3, 0.22);
      head = new THREE.Group(); head.position.set(0, 1.12, 0.02); rig.add(head); hr = 0.3;
      mesh(SPH, body, head, 0, 0, 0, hr);
      addEyes(head, parts, { spacing: 0.12, y: 0.03, z: 0.23, r: 0.09 });
      for (const s of [-1, 1]) {
        const g = new THREE.Group(); g.position.set(s * 0.15, 0.3, 0); rig.add(g);
        mesh(CYL, body, g, 0, -0.14, 0, 0.09, 0.3, 0.09);
        mesh(SPH, belly, g, 0, -0.28, 0.04, 0.11, 0.07, 0.14);
        for (const tx of [-0.05, 0, 0.05]) mesh(SPH_LO, body, g, tx, -0.29, 0.16, 0.035, 0.03, 0.035).userData.noOutline = true;
        parts.legs.push(g);
        const a = new THREE.Group(); a.position.set(s * 0.34, 0.8, 0.02); a.rotation.z = s * 0.4; rig.add(a);
        mesh(SPH, body, a, 0, -0.14, 0, 0.08, 0.2, 0.08);
        parts.arms.push(a);
      }
      tailPos = new THREE.Vector3(0, 0.45, -0.3);
      backPos = new THREE.Vector3(0, 0.82, -0.24);
      bodyW = 0.36; bodyH = 0.4; bodyL = 0.32;
      height = 1.45;
      break;
    }
    case 'bird': {
      mesh(SPH, body, rig, 0, 0.55, 0, 0.36, 0.34, 0.4);
      mesh(SPH, belly, rig, 0, 0.5, 0.13, 0.27, 0.25, 0.28);
      head = new THREE.Group(); head.position.set(0, 0.92, 0.12); rig.add(head); hr = 0.25;
      mesh(SPH, body, head, 0, 0, 0, hr);
      const beak = mesh(CONE, mat('#ffb703'), head, 0, -0.04, 0.27, 0.06, 0.14, 0.06);
      beak.rotation.x = Math.PI / 2;
      addEyes(head, parts, { spacing: 0.11, y: 0.05, z: 0.18, r: 0.08 });
      for (const s of [-1, 1]) {
        const w = new THREE.Group(); w.position.set(s * 0.32, 0.66, 0); rig.add(w);
        mesh(SPH, mat(pal.wings), w, s * 0.05, -0.1, -0.03, 0.07, 0.24, 0.3);
        parts.wings.push(w);
        const g = new THREE.Group(); g.position.set(s * 0.12, 0.25, 0.02); rig.add(g);
        mesh(CYL, mat('#ffb703'), g, 0, -0.1, 0, 0.025, 0.25, 0.025);
        mesh(SPH_LO, mat('#ffb703'), g, 0, -0.23, 0.05, 0.05, 0.02, 0.08);
        parts.legs.push(g);
      }
      tailPos = new THREE.Vector3(0, 0.52, -0.38);
      backPos = new THREE.Vector3(0, 0.82, -0.12);
      bodyW = 0.36; bodyH = 0.34; bodyL = 0.4;
      height = 1.17;
      break;
    }
    case 'float': {
      hover = 0.55;
      const f = new THREE.Group(); f.position.y = hover + 0.45; rig.add(f);
      parts.floatNode = f;
      const b = mesh(SPH, body, f, 0, 0, 0, 0.45, 0.43, 0.45);
      mesh(SPH, belly, f, 0, -0.08, 0.17, 0.32, 0.28, 0.3);
      head = new THREE.Group(); f.add(head); hr = 0.45;
      addEyes(head, parts, { spacing: 0.17, y: 0.08, z: 0.36, r: 0.12 });
      tailPos = new THREE.Vector3(0, hover + 0.4, -0.42);
      backPos = new THREE.Vector3(0, hover + 0.82, -0.12);
      bodyW = 0.45; bodyH = 0.43; bodyL = 0.45;
      bodyNode = b;
      height = hover + 0.95;
      break;
    }
    case 'bug': {
      hover = 0.8;
      const f = new THREE.Group(); f.position.y = hover + 0.2; rig.add(f);
      parts.floatNode = f;
      mesh(SPH, body, f, 0, 0, -0.08, 0.16, 0.16, 0.3);
      head = new THREE.Group(); head.position.set(0, 0.06, 0.24); f.add(head); hr = 0.17;
      mesh(SPH, mat(pal.belly), head, 0, 0, 0, hr);
      addEyes(head, parts, { spacing: 0.08, y: 0.04, z: 0.12, r: 0.075, angle: 0.5 });
      for (const s of [-1, 1]) for (const fz of [0.02, -0.18]) {
        const w = new THREE.Group(); w.position.set(s * 0.12, 0.1, fz); f.add(w);
        const big = fz > 0;
        mesh(SPH, mat(pal.wings, m.glow ? pal.wings : 0, 0.35), w, s * (big ? 0.38 : 0.26), 0.02, 0, big ? 0.4 : 0.28, 0.025, big ? 0.28 : 0.2);
        parts.wings.push(w);
      }
      tailPos = new THREE.Vector3(0, hover + 0.2, -0.38);
      backPos = new THREE.Vector3(0, hover + 0.35, -0.08);
      bodyNode = f;
      height = hover + 0.5;
      break;
    }
    case 'serpent': {
      hover = 0.5;
      const f = new THREE.Group(); f.position.y = hover + 0.3; rig.add(f);
      parts.floatNode = f;
      head = new THREE.Group(); head.position.set(0, 0.1, 0.3); f.add(head); hr = 0.28;
      mesh(SPH, body, head, 0, 0, 0, hr);
      addEyes(head, parts, { spacing: 0.11, y: 0.05, z: 0.21, r: 0.085 });
      for (let i = 0; i < 6; i++) {
        const r = 0.22 - i * 0.025;
        const seg = mesh(SPH, i % 2 ? belly : body, f, 0, 0, 0.05 - i * 0.26, r, r, r * 1.2);
        parts.segments.push(seg);
      }
      tailPos = new THREE.Vector3(0, hover + 0.3, -1.5);
      backPos = new THREE.Vector3(0, hover + 0.55, 0);
      bodyNode = f;
      height = hover + 0.7;
      break;
    }
  }

  // head-mounted mesh for plans that use the body as the head
  if (m.plan === 'blob' || m.plan === 'float') { /* body acts as head */ }

  const ctx = { head, hr, rig, pal, parts, backPos, tailPos, s: k, glow: !!m.glow, bodyW, bodyH, bodyL, bodyNode };
  addEars(m.ears, head, hr, pal, parts);
  addTail(m.tail, ctx);
  for (const f of m.features || []) addFeature(f, ctx);

  const size = m.size || 1;
  addOutlines(rig);
  rig.scale.setScalar(size);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.outline && o.geometry === SPH && o.scale.x > 0.15; o.receiveShadow = false; } });

  return new CreatureModel(root, rig, parts, {
    plan: m.plan, height: height * size, radius: Math.max(0.3, 0.45 * size), hover: hover * size, size, hop: !!m.hop || m.plan === 'blob', shiny,
  });
}

// --- animation ------------------------------------------------------------------

export class CreatureModel {
  constructor(root, rig, parts, info) {
    Object.assign(this, info);
    this.root = root; this.rig = rig; this.parts = parts;
    this.t = Math.random() * 10;
    this.blinkT = 1 + Math.random() * 3;
    this.blinking = 0;
    this.hopPhase = 0;
    this.twitchT = 2 + Math.random() * 4;
    this.squash = 0;
    this.baseFloatY = parts.floatNode ? parts.floatNode.position.y : 0;
    if (shinySparkle && info.shiny) this._addSparkle();
  }

  _addSparkle() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(OCTA, mat('#fff7b0', 0xffee88, 1));
      s.scale.setScalar(0.05);
      g.add(s);
    }
    this.sparkle = g;
    this.root.add(g);
  }

  /**
   * state: { speed (m/s), sleeping, excited (0-1), happy }
   */
  update(dt, state = {}) {
    const p = this.parts;
    const speed = state.speed || 0;
    this.t += dt;
    const t = this.t;
    const moving = speed > 0.15;
    const sleeping = !!state.sleeping;

    // breathing
    const breathe = Math.sin(t * (sleeping ? 1.4 : 2.6)) * (sleeping ? 0.035 : 0.02);
    let y = 0, sy = 1 + breathe, sxz = 1 - breathe * 0.5, tilt = 0;

    if (this.hop && moving && !p.floatNode) {
      // hop along
      this.hopPhase += dt * (5 + speed * 1.5);
      const s = Math.abs(Math.sin(this.hopPhase));
      y = s * 0.28 * this.size;
      sy *= 1 + (s - 0.5) * 0.15; sxz *= 1 - (s - 0.5) * 0.08;
      tilt = 0.12;
    } else if (state.excited) {
      this.hopPhase += dt * 9;
      y = Math.abs(Math.sin(this.hopPhase)) * 0.18 * this.size * state.excited;
    } else {
      this.hopPhase = 0;
    }
    if (sleeping && !p.floatNode) { sy *= 0.9; y -= 0.03 * this.size; }
    this.rig.position.y = y;
    this.rig.scale.set(this.size * sxz, this.size * sy, this.size * sxz);
    this.rig.rotation.x = tilt;

    // floating bodies
    if (p.floatNode) {
      p.floatNode.position.y = this.baseFloatY + Math.sin(t * 2) * 0.1 - (sleeping ? 0.25 : 0);
      p.floatNode.rotation.z = Math.sin(t * 1.3) * 0.08;
    }

    // legs
    const walk = t * (6 + speed * 1.8);
    const amp = moving ? Math.min(0.9, 0.3 + speed * 0.15) : 0;
    if (this.plan === 'quad') {
      p.legs.forEach((l, i) => { l.rotation.x = Math.sin(walk + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });
    } else if (this.plan === 'biped' || this.plan === 'bird') {
      p.legs.forEach((l, i) => { l.rotation.x = Math.sin(walk + i * Math.PI) * amp; });
      p.arms.forEach((a, i) => { a.rotation.x = Math.sin(walk + i * Math.PI + Math.PI) * amp * 0.8; });
    }
    if (this.plan === 'biped' && !moving) p.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 2 + i) * 0.08; });

    // wings
    if (this.plan === 'bird') {
      const flap = moving ? Math.sin(t * 16) * 0.7 : (state.excited ? Math.sin(t * 12) * 0.5 : Math.sin(t * 2) * 0.05);
      p.wings.forEach((w, i) => { w.rotation.z = (i === 0 ? -1 : 1) * (0.15 + flap); });
    } else if (this.plan === 'bug') {
      const flap = Math.sin(t * (sleeping ? 4 : 28)) * (sleeping ? 0.1 : 0.6);
      p.wings.forEach((w, i) => { w.rotation.z = (i < 2 ? -1 : 1) * flap; });
    } else if (p.wings.length) {
      p.wings.forEach((w, i) => { w.rotation.y = Math.sin(t * 6 + i) * 0.4; });
    }

    // tail wag (faster when excited/happy)
    if (p.tail) {
      const rate = state.excited ? 14 : moving ? 8 : 3;
      p.tail.rotation.y = Math.sin(t * rate) * (state.excited ? 0.7 : 0.35);
    }

    // serpent wave
    p.segments.forEach((s, i) => {
      s.position.x = Math.sin(t * 3 - i * 0.8) * 0.12 * (i + 1) * 0.4;
      s.position.y = Math.cos(t * 3 - i * 0.8) * 0.06;
      if (s.userData.outlineMesh) s.userData.outlineMesh.position.copy(s.position);
    });

    // eyes follow the camera when you're close; mouth opens when happy/excited
    if (p.looks.length) {
      let tx = 0, ty = 0;
      if (LOOK_TARGET && !sleeping && this.root.getWorldPosition(_wp).distanceTo(LOOK_TARGET) < 14) {
        const L0 = p.looks[0];
        _look.copy(LOOK_TARGET);
        L0.eye.worldToLocal(_look).normalize();
        tx = Math.max(-1, Math.min(1, _look.x * 1.6));
        ty = Math.max(-1, Math.min(1, _look.y * 1.6));
      }
      for (const L of p.looks) {
        const k = Math.min(1, dt * 10);
        L.look.position.x += (tx * L.r * 0.26 - L.look.position.x) * k;
        L.look.position.y += (ty * L.r * 0.2 - L.look.position.y) * k;
      }
    }
    if (p.mouthOpen) {
      const open = !sleeping && (state.excited || 0) > 0.35;
      p.mouthOpen.visible = open;
      p.smile.visible = !open;
    }

    // flames flicker, glows pulse
    p.flames.forEach((f, i) => { const k = 1 + Math.sin(t * 17 + i * 3) * 0.12 + Math.sin(t * 29) * 0.06; f.scale.set(1, k, 1); });
    if (p.orbit) p.orbit.rotation.y = t * 1.5;

    // ear twitch
    this.twitchT -= dt;
    if (this.twitchT < 0) { this.twitchT = 2 + Math.random() * 5; this.twitch = 0.25; }
    if (this.twitch > 0) {
      this.twitch -= dt;
      p.ears.forEach((e, i) => { e.rotation.x = Math.sin(this.twitch * 40 + i) * 0.25; });
    }

    // blinking (eyes closed while sleeping)
    if (sleeping) {
      p.eyes.forEach((e) => { e.scale.y = 0.12; });
    } else {
      this.blinkT -= dt;
      if (this.blinkT < 0) { this.blinking = 0.14; this.blinkT = 1.5 + Math.random() * 4; }
      const b = this.blinking > 0 ? 0.12 : 1;
      if (this.blinking > 0) this.blinking -= dt;
      p.eyes.forEach((e) => { e.scale.y = b; });
    }

    if (this.sparkle) {
      this.sparkle.children.forEach((s, i) => {
        const a = t * 1.5 + (i / 5) * Math.PI * 2;
        s.position.set(Math.cos(a) * this.radius * 1.4, this.height * (0.4 + 0.4 * Math.sin(t * 2 + i)), Math.sin(a) * this.radius * 1.4);
        s.rotation.y = t * 4;
        s.scale.setScalar(0.04 + Math.abs(Math.sin(t * 5 + i)) * 0.05);
      });
    }
  }
}

const shinySparkle = true;
