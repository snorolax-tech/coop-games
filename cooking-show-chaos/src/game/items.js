// Item definitions, procedural low-poly meshes and the Item class.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// he = physics half-extents (box) or r = sphere radius
export const ITEM_DEFS = {
  bun:      { name: 'Bun', emoji: '🍞', food: true, he: [0.12, 0.07, 0.12], mass: 0.3, stackH: 0.07 },
  patty:    { name: 'Patty', emoji: '🥩', food: true, he: [0.1, 0.035, 0.1], mass: 0.3, stackH: 0.045, cookable: true },
  lettuce:  { name: 'Lettuce', emoji: '🥬', food: true, choppable: true, he: [0.12, 0.09, 0.12], mass: 0.3, stackH: 0.03 },
  tomato:   { name: 'Tomato', emoji: '🍅', food: true, choppable: true, he: [0.085, 0.085, 0.085], mass: 0.25, stackH: 0.03 },
  cucumber: { name: 'Cucumber', emoji: '🥒', food: true, choppable: true, he: [0.16, 0.05, 0.05], mass: 0.25, stackH: 0.03 },
  carrot:   { name: 'Carrot', emoji: '🥕', food: true, choppable: true, he: [0.15, 0.045, 0.045], mass: 0.2, stackH: 0.03 },
  onion:    { name: 'Onion', emoji: '🧅', food: true, choppable: true, he: [0.075, 0.08, 0.075], mass: 0.2, stackH: 0.03 },
  plate:    { name: 'Plate', emoji: '🍽', container: true, he: [0.2, 0.02, 0.2], mass: 0.6 },
  bowl:     { name: 'Bowl', emoji: '🥣', container: true, he: [0.16, 0.06, 0.16], mass: 0.6 },
  pan:      { name: 'Pan', emoji: '🍳', container: true, cookware: true, he: [0.19, 0.035, 0.19], mass: 1.2, essential: true },
  pot:      { name: 'Pot', emoji: '🍲', container: true, cookware: true, he: [0.19, 0.12, 0.19], mass: 1.6, essential: true },
  extinguisher: { name: 'Fire Extinguisher', emoji: '🧯', he: [0.09, 0.25, 0.09], mass: 3, essential: true },
  showcam:  { name: 'Show Camera', emoji: '🎥', he: [0.12, 0.11, 0.2], mass: 1.5, essential: true },
  mixer:    { name: 'Stand Mixer', emoji: '🌀', he: [0.17, 0.25, 0.16], mass: 4 },
};

const HITBOX_MAT = new THREE.MeshBasicMaterial();
const matCache = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return matCache.get(key);
}
function mesh(geo, color, extra) {
  const m = new THREE.Mesh(geo, mat(color, extra)); m.castShadow = true; m.receiveShadow = true; return m;
}
const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHex();

export function pattyColor(k) {
  if (k < 1) return lerpColor(0xf28b82, 0x8b5a2b, k);
  return lerpColor(0x8b5a2b, 0x1a1a1a, (k - 1));
}

// --- Ingredient mesh (whole or chopped). Origin at center of its physics box. ---
export function buildIngredient(type, ch = 0, k = 0) {
  const g = new THREE.Group();
  switch (type) {
    case 'bun': {
      const top = mesh(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe9a64b); top.scale.y = 0.75; top.position.y = -0.01; g.add(top);
      const bot = mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.05, 10), 0xf4c27a); bot.position.y = -0.04; g.add(bot);
      for (let i = 0; i < 5; i++) { const s = mesh(new THREE.SphereGeometry(0.012, 4, 3), 0xfff8e1); const a = i * 1.3; s.position.set(Math.cos(a) * 0.06, 0.06, Math.sin(a) * 0.06); g.add(s); }
      break;
    }
    case 'patty': {
      const p = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), pattyColor(k)); g.add(p);
      if (k >= 2) for (let i = 0; i < 3; i++) { const c = mesh(new THREE.BoxGeometry(0.04, 0.02, 0.04), 0x000000); c.position.set((Math.random() - 0.5) * 0.12, 0.03, (Math.random() - 0.5) * 0.12); g.add(c); }
      break;
    }
    case 'lettuce':
      if (!ch) { const l = mesh(new THREE.IcosahedronGeometry(0.12, 0), 0x70c040); l.scale.y = 0.75; g.add(l); const l2 = mesh(new THREE.IcosahedronGeometry(0.08, 0), 0xa7e07a); l2.position.y = 0.04; g.add(l2); }
      else for (let i = 0; i < 4; i++) { const l = mesh(new THREE.BoxGeometry(0.09, 0.015, 0.09), i % 2 ? 0x70c040 : 0xa7e07a); l.position.set((i % 2 - 0.5) * 0.08, -0.06 + i * 0.012, (Math.floor(i / 2) - 0.5) * 0.08); l.rotation.y = i; g.add(l); }
      break;
    case 'tomato':
      if (!ch) { g.add(mesh(new THREE.IcosahedronGeometry(0.09, 1), 0xe63946)); const st = mesh(new THREE.ConeGeometry(0.03, 0.04, 5), 0x2d6a4f); st.position.y = 0.09; g.add(st); }
      else for (let i = 0; i < 3; i++) { const s = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), 0xe63946); s.position.set((i - 1) * 0.06, -0.06, 0); s.rotation.z = 0.2 * (i - 1); g.add(s); const c = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 8), 0xff8fa3); c.position.copy(s.position); g.add(c); }
      break;
    case 'cucumber':
      if (!ch) { const c = mesh(new THREE.CapsuleGeometry(0.05, 0.22, 3, 8), 0x2d6a4f); c.rotation.z = Math.PI / 2; g.add(c); }
      else for (let i = 0; i < 4; i++) { const s = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), 0x2d6a4f); s.position.set((i - 1.5) * 0.06, -0.03, 0); g.add(s); const c = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.022, 8), 0xc7f9cc); c.position.copy(s.position); g.add(c); }
      break;
    case 'carrot':
      if (!ch) { const c = mesh(new THREE.ConeGeometry(0.045, 0.26, 7), 0xf77f00); c.rotation.z = Math.PI / 2; g.add(c); const lf = mesh(new THREE.ConeGeometry(0.03, 0.1, 4), 0x52b788); lf.rotation.z = Math.PI / 2; lf.position.x = -0.17; g.add(lf); }
      else for (let i = 0; i < 4; i++) { const s = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), 0xf77f00); s.position.set((i - 1.5) * 0.06, -0.025, (i % 2) * 0.03); g.add(s); }
      break;
    case 'onion':
      if (!ch) { const o = mesh(new THREE.IcosahedronGeometry(0.08, 1), 0xc77dff); o.scale.y = 0.9; g.add(o); const tip = mesh(new THREE.ConeGeometry(0.025, 0.06, 5), 0xe0aaff); tip.position.y = 0.09; g.add(tip); }
      else for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), i % 2 ? 0xe0aaff : 0xf3e8ff); r.rotation.x = Math.PI / 2; r.position.set((i - 1) * 0.06, -0.06, 0); g.add(r); }
      break;
  }
  return g;
}

function buildContainerBase(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'plate': {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.03, 18), 0xffffff));
      const rim = mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 18), 0xbde0fe); rim.rotation.x = Math.PI / 2; rim.position.y = 0.015; g.add(rim);
      break;
    }
    case 'bowl': {
      const b = mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 14, 1, true), 0x90e0ef, { side: THREE.DoubleSide }); g.add(b);
      const bottom = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 14), 0x90e0ef); bottom.position.y = -0.055; g.add(bottom);
      break;
    }
    case 'pan': {
      g.add(mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.05, 16), 0x2b2d42));
      const inner = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.052, 16), 0x4a4e69); inner.position.y = 0.003; g.add(inner);
      const handle = mesh(new THREE.BoxGeometry(0.28, 0.03, 0.05), 0x8d5524); handle.position.set(0.32, 0.01, 0); g.add(handle);
      break;
    }
    case 'pot': {
      const body = mesh(new THREE.CylinderGeometry(0.19, 0.18, 0.24, 16, 1, true), 0xadb5bd, { side: THREE.DoubleSide }); g.add(body);
      const bottom = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), 0x6c757d); bottom.position.y = -0.11; g.add(bottom);
      for (const s of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.05, 0.015, 4, 8, Math.PI), 0x343a40); h.position.set(s * 0.21, 0.07, 0); h.rotation.z = s * -Math.PI / 2; g.add(h); }
      break;
    }
  }
  return g;
}

const SOUP_COLOR = (k) => (k < 1 ? lerpColor(0x8ecae6, 0xf4a259, k) : lerpColor(0xf4a259, 0x3d2c1e, k - 1));

function buildContents(type, s) {
  const g = new THREE.Group();
  const c = s.c || [];
  if (type === 'plate' || type === 'pan') {
    // burger-friendly order: bun bottom, patty, veg, others, bun top
    let y = 0.02;
    const order = [...c].sort((a, b) => rank(a) - rank(b));
    const hasBun = order.some((x) => x.t === 'bun');
    order.forEach((ing) => {
      if (ing.t === 'bun') {
        const bot = mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.04, 10), 0xf4c27a); bot.position.y = y + 0.02; g.add(bot); y += 0.04;
        return;
      }
      const m = buildIngredient(ing.t, ing.ch, ing.k); m.scale.setScalar(0.9);
      m.position.y = y + 0.05; if (ing.ch) m.position.y = y + 0.07;
      if (!ing.ch && ing.t !== 'patty') m.position.y = y + 0.07;
      g.add(m); y += ITEM_DEFS[ing.t].stackH + 0.01;
    });
    if (hasBun) { const top = mesh(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe9a64b); top.scale.y = 0.7; top.position.y = y; g.add(top); }
  } else if (type === 'bowl') {
    c.forEach((ing, i) => {
      if (ing.t === 'soup') {
        const disk = mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.02, 14), SOUP_COLOR(ing.k)); disk.position.y = 0.03; g.add(disk);
        for (let j = 0; j < 4; j++) { const bit = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), j % 2 ? 0xf77f00 : 0xe0aaff); bit.position.set(Math.cos(j * 1.7) * 0.07, 0.045, Math.sin(j * 1.7) * 0.07); g.add(bit); }
        return;
      }
      const m = buildIngredient(ing.t, ing.ch, ing.k); m.scale.setScalar(0.75);
      const a = i * 2.1; m.position.set(Math.cos(a) * 0.05, 0.04 + i * 0.02, Math.sin(a) * 0.05); g.add(m);
    });
  } else if (type === 'pot') {
    if (s.w || s.k > 0) {
      const level = s.w ? 0.06 : -0.06;
      const disk = mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.02, 16), s.k > 0 ? SOUP_COLOR(s.k) : 0x8ecae6, { transparent: !s.k, opacity: s.k ? 1 : 0.8 });
      disk.position.y = level; g.add(disk);
    }
    c.forEach((ing, i) => {
      const m = buildIngredient(ing.t, ing.ch, ing.k); m.scale.setScalar(0.6);
      const a = i * 2.3; m.position.set(Math.cos(a) * 0.08, s.w ? 0.08 : -0.05, Math.sin(a) * 0.08); g.add(m);
    });
  }
  return g;
}
function rank(i) { return { bun: 0, patty: 1, lettuce: 2, tomato: 3 }[i.t] ?? 4; }

function buildMisc(type, s) {
  const g = new THREE.Group();
  if (type === 'extinguisher') {
    g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.42, 12), 0xe63946));
    const top = mesh(new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe63946); top.position.y = 0.21; g.add(top);
    const valve = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), 0x222222); valve.position.y = 0.3; g.add(valve);
    const lever = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.14), 0x222222); lever.position.set(0, 0.34, 0.03); g.add(lever);
    const nozzle = mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.14, 8), 0x111111); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.3, -0.09); g.add(nozzle);
    const label = mesh(new THREE.BoxGeometry(0.172, 0.12, 0.12), 0xfff1c1); label.position.y = 0.0; label.scale.set(1, 1, 1.0); g.add(label);
  } else if (type === 'showcam') {
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.34), 0x2b2d42));
    const side = mesh(new THREE.BoxGeometry(0.21, 0.12, 0.2), 0xff006e); side.position.set(0, -0.02, 0.03); g.add(side);
    const lens = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 14), 0x111111); lens.rotation.x = Math.PI / 2; lens.position.z = -0.23; g.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.065, 14), new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }));
    glass.position.z = -0.302; glass.rotation.y = Math.PI; g.add(glass);
    const handle = mesh(new THREE.BoxGeometry(0.04, 0.06, 0.24), 0x111111); handle.position.y = 0.14; g.add(handle);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 })); rec.position.set(0.06, 0.08, -0.17); g.add(rec);
    g.userData.rec = rec;
    const vf = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), 0x111111); vf.position.set(-0.13, 0.04, 0.12); vf.rotation.y = 0.5; g.add(vf);
  } else if (type === 'mixer') {
    const base = mesh(new THREE.BoxGeometry(0.32, 0.06, 0.3), 0x80ed99); base.position.y = -0.22; g.add(base);
    const col = mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), 0x80ed99); col.position.set(0.1, -0.02, 0); g.add(col);
    const head = mesh(new THREE.CapsuleGeometry(0.08, 0.22, 3, 8), 0x80ed99); head.rotation.z = Math.PI / 2; head.position.set(0, 0.18, 0); g.add(head);
    const bowl = mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.16, 12), 0xdee2e6); bowl.position.set(-0.04, -0.11, 0); g.add(bowl);
    const whisk = mesh(new THREE.ConeGeometry(0.04, 0.12, 6), 0xced4da); whisk.position.set(-0.04, 0.05, 0); whisk.rotation.x = Math.PI; g.add(whisk);
    g.userData.whisk = whisk;
    const eyeMat = 0x111111;
    for (const z of [-0.05, 0.05]) { const e = mesh(new THREE.SphereGeometry(0.02, 6, 6), eyeMat); e.position.set(-0.13, 0.21, z); g.add(e); }
    if (s.on) { const angry = mesh(new THREE.BoxGeometry(0.01, 0.015, 0.14), 0x111111); angry.position.set(-0.14, 0.25, 0); g.add(angry); }
  }
  return g;
}

export class Item {
  constructor(id, type, state = {}) {
    this.id = id;
    this.type = type;
    this.def = ITEM_DEFS[type];
    this.s = { ch: 0, cp: 0, k: 0, c: [], w: 0, on: 0, ...state };
    this.holder = -1; this.slot = null;
    this.body = null;
    this.ver = 1; this.sentVer = 0;
    this.mesh = new THREE.Group();
    this.mesh.userData.item = this;
    this.visual = null; this.visualKey = '';
    this.thrownBy = -1; this.thrownAt = 0; this.thrownFrom = null;
    this.home = null;
    // invisible, slightly padded hitbox so small/flat items are easy to aim at
    const he = this.def.he || [this.def.r, this.def.r, this.def.r];
    const hit = new THREE.Mesh(new THREE.BoxGeometry(he[0] * 2 + 0.06, he[1] * 2 + 0.06, he[2] * 2 + 0.06), HITBOX_MAT);
    hit.visible = false; this.mesh.add(hit);
    this.rebuildVisual();
  }
  get isFood() { return !!this.def.food; }
  touch() { this.ver++; }
  computeVisualKey() {
    const s = this.s;
    const kb = Math.floor((s.k || 0) * 6);
    const cs = (s.c || []).map((i) => `${i.t}${i.ch}${Math.floor((i.k || 0) * 6)}`).join(',');
    return `${s.ch}|${kb}|${cs}|${s.w}|${s.on}`;
  }
  rebuildVisual() {
    const key = this.computeVisualKey();
    if (key === this.visualKey && this.visual) return;
    this.visualKey = key;
    if (this.visual) { this.mesh.remove(this.visual); disposeTree(this.visual); }
    const g = new THREE.Group();
    if (this.def.food) g.add(buildIngredient(this.type, this.s.ch, this.s.k));
    else if (this.def.container) { g.add(buildContainerBase(this.type)); g.add(buildContents(this.type, this.s)); }
    else g.add(buildMisc(this.type, this.s));
    this.visual = g;
    this.mesh.add(g);
  }
  createBody(material) {
    const d = this.def;
    const shape = d.r ? new CANNON.Sphere(d.r) : new CANNON.Box(new CANNON.Vec3(...d.he));
    this.body = new CANNON.Body({ mass: d.mass, shape, material, angularDamping: d.r ? 0.5 : 0.3, linearDamping: 0.05 });
    this.body.sleepSpeedLimit = 0.15; this.body.sleepTimeLimit = 0.6;
    this.body.userData = { item: this };
    return this.body;
  }
  halfHeight() { return this.def.r || this.def.he[1]; }
  label() {
    const s = this.s;
    if (this.def.food) {
      let n = this.def.name;
      if (s.ch) n = 'Chopped ' + n;
      if (this.type === 'patty') n = (s.k >= 2 ? 'Burnt ' : s.k >= 1 ? 'Cooked ' : 'Raw ') + n;
      return n;
    }
    if (this.type === 'pot') {
      if (s.k >= 2) return 'Pot of burnt soup';
      if (s.k >= 1) return 'Pot of soup (ready!)';
      if (s.w) return s.c.length ? 'Pot (water + stuff)' : 'Pot of water';
    }
    if (this.def.container && s.c.length) return `${this.def.name} (${s.c.map((i) => (i.t === 'soup' ? '🍲' : ITEM_DEFS[i.t].emoji)).join('')})`;
    return this.def.name;
  }
}

function disposeTree(obj) {
  obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
