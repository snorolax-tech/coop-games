// All scrap parts: stats + low-poly meshes built from primitives (no model files).
import * as THREE from 'three';

export const SLOTS = ['head', 'leftArm', 'rightArm', 'back', 'legs'];
export const SLOT_NAMES = { head: 'Head', leftArm: 'Left Arm', rightArm: 'Right Arm', back: 'Back', legs: 'Legs' };
// What a slot falls back to when empty (null = nothing there).
export const DEFAULTS = { head: null, leftArm: 'fist', rightArm: 'fist', back: null, legs: 'stubby' };
export const FRAME_WEIGHT = 6;

export const PARTS = {
  // ---- arms ----
  fist:   { kind: 'arm', name: 'Stubby Fist', desc: 'Weak little punch', weight: 1, hp: 0, isDefault: true,
            atk: { type: 'swing', range: 2.6, arc: 80, dmg: 6, cd: 0.45, kb: 5 } },
  drill:  { kind: 'arm', name: 'Drill', desc: 'Hold to grind. Shreds parts', weight: 4, hp: 55,
            atk: { type: 'hold', range: 3.2, arc: 55, dps: 30, partMult: 1.8, kb: 1.5 } },
  saw:    { kind: 'arm', name: 'Saw Blade', desc: 'Wide slash', weight: 3.5, hp: 50,
            atk: { type: 'swing', range: 3.7, arc: 150, dmg: 14, cd: 0.7, kb: 7, partMult: 1.2 } },
  glove:  { kind: 'arm', name: 'Spring Glove', desc: 'Long reach, HUGE knockback', weight: 3, hp: 45,
            atk: { type: 'swing', range: 6.5, arc: 34, dmg: 11, cd: 1.1, kb: 26 } },
  magnet: { kind: 'arm', name: 'Magnet', desc: 'Hold: pulls enemy in + rips their parts off', weight: 3, hp: 45,
            atk: { type: 'beam', range: 11, arc: 28, dps: 5, partMult: 6, pull: 3.2 } },
  flame:  { kind: 'arm', name: 'Flamethrower', desc: 'Hold: burn everything in a cone', weight: 3.5, hp: 45,
            atk: { type: 'hold', range: 6.5, arc: 60, dps: 19, kb: 0.4 } },

  // ---- legs ----
  stubby: { kind: 'legs', name: 'Stubby Legs', desc: 'Basic legs', weight: 2, hp: 0, isDefault: true,
            legs: { speed: 7.5, jump: 10, grip: 10 } },
  treads: { kind: 'legs', name: 'Tank Treads', desc: 'Slow, +40 HP, hard to knock around', weight: 6, hp: 80,
            legs: { speed: 5.5, jump: 6, grip: 9, hpBonus: 40, kbResist: 0.6 } },
  spider: { kind: 'legs', name: 'Spider Legs', desc: 'Climb walls, big jumps', weight: 3, hp: 55,
            legs: { speed: 8.5, jump: 15, grip: 12, climb: true } },
  rocket: { kind: 'legs', name: 'Rocket Boots', desc: 'Super fast but slippery', weight: 2.5, hp: 45,
            legs: { speed: 15, jump: 12, grip: 1.7, kbDecay: 1.3 } },
  pogo:   { kind: 'legs', name: 'Pogo Stick', desc: 'Always bouncing. Slams on big landings', weight: 1.5, hp: 40,
            legs: { speed: 8, jump: 20, grip: 4, pogo: true } },

  // ---- back ----
  jetpack:  { kind: 'back', name: 'Jetpack', desc: 'Hold Shift: fly', weight: 2.5, hp: 45, back: { type: 'jet', fuel: 2.2 } },
  shield:   { kind: 'back', name: 'Shield Generator', desc: 'Shift: block 80% damage for 2.5s', weight: 3, hp: 50,
              back: { type: 'shield', cd: 8, dur: 2.5 } },
  missiles: { kind: 'back', name: 'Missile Pod', desc: 'Shift: 4 homing missiles', weight: 3.5, hp: 45,
              back: { type: 'missiles', cd: 7, n: 4, dmg: 7 } },
  extra:    { kind: 'back', name: 'Extra Arms', desc: 'Shift: spin attack', weight: 3, hp: 50,
              back: { type: 'spin', cd: 6, dur: 1.2, dmg: 4.5, range: 4.2 } },

  // ---- head ----
  helmet: { kind: 'head', name: 'Armored Helmet', desc: '+35 core HP', weight: 2.5, hp: 60, head: { hpBonus: 35 } },
  horn:   { kind: 'head', name: 'Ram Horn', desc: 'Dash (Q) rams for big damage', weight: 2, hp: 50, head: { ram: true } },
  radar:  { kind: 'head', name: 'Radar Dish', desc: 'Abilities recharge 35% faster', weight: 1.5, hp: 40, head: { cdMult: 0.65 } },
  googly: { kind: 'head', name: 'Googly Eyes', desc: 'Does nothing. Weighs nothing. Looks amazing', weight: 0.2, hp: 30, head: {} },
};

const POOL = Object.entries(PARTS).filter(([, p]) => !p.isDefault);
const KIND_WEIGHT = { arm: 0.42, legs: 0.2, back: 0.22, head: 0.16 };

export function randomPartId(rng = Math.random) {
  const r = rng();
  let acc = 0, kind = 'arm';
  for (const [k, w] of Object.entries(KIND_WEIGHT)) { acc += w; if (r < acc) { kind = k; break; } }
  const opts = POOL.filter(([, p]) => p.kind === kind);
  return opts[Math.floor(rng() * opts.length)][0];
}

export function slotKind(slot) { return slot === 'leftArm' || slot === 'rightArm' ? 'arm' : slot; }

/** id actually in a slot (falls back to the default part) */
export function slotId(parts, slot) { return parts?.[slot]?.id || DEFAULTS[slot]; }

export function partsSig(parts) { return SLOTS.map((s) => parts?.[s]?.id || '-').join('|'); }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function computeStats(parts) {
  let weight = FRAME_WEIGHT;
  for (const s of SLOTS) { const id = slotId(parts, s); if (id) weight += PARTS[id].weight; }
  const legs = PARTS[slotId(parts, 'legs')].legs;
  const headId = slotId(parts, 'head');
  const head = headId ? PARTS[headId].head : {};
  const wf = clamp(1.3 - weight / 45, 0.55, 1.15);
  return {
    weight,
    speed: legs.speed * wf,
    jump: legs.jump * (0.85 + 0.15 * wf),
    grip: legs.grip,
    climb: !!legs.climb,
    pogo: !!legs.pogo,
    kbDecay: legs.kbDecay || 4,
    kbResist: clamp((legs.kbResist || 0) + weight / 120, 0, 0.8),
    dmgMult: clamp(0.45 + weight / 25, 0.5, 1.6),
    maxHp: 100 + (legs.hpBonus || 0) + (head.hpBonus || 0),
    cdMult: head.cdMult || 1,
    ram: !!head.ram,
    wf,
  };
}

// ------------------------------------------------------------------ meshes
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.35, ...opts }));
  return matCache.get(key);
}
const METAL = 0x8d939c, DARK = 0x3f454d, RUST = 0xa0582c;

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
const cyl = (rt, rb, h, m, x, y, z, seg = 10) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
const sph = (r, m, x, y, z) => mesh(new THREE.SphereGeometry(r, 10, 8), m, x, y, z);

/** upper arm pointing forward (+z) from the shoulder */
function upperArm(g, accent) {
  const a = cyl(0.22, 0.22, 1.0, mat(METAL), 0, 0, 0.5);
  a.rotation.x = Math.PI / 2;
  g.add(a, box(0.5, 0.5, 0.35, mat(accent), 0, 0, 1.05));
}

/**
 * Build a part mesh. `accent` is the owner's color.
 * Returns a Group; group.userData.animate(g, a) (optional) is called every frame with
 *  a = { t, dt, walkPhase, walk, active, held, prog, gr, vy }
 */
export function makePartMesh(id, accent = RUST) {
  const g = new THREE.Group();
  const ud = g.userData;
  switch (id) {
    // ---------------- arms (origin = shoulder, forward = +z)
    case 'fist': {
      const a = cyl(0.2, 0.2, 0.9, mat(METAL), 0, 0, 0.45); a.rotation.x = Math.PI / 2; g.add(a);
      g.add(box(0.55, 0.55, 0.55, mat(accent), 0, 0, 1.1));
      ud.animate = (g, a) => { g.position.z = Math.sin(a.prog * Math.PI) * 0.9; };
      break;
    }
    case 'drill': {
      upperArm(g, accent);
      const bit = new THREE.Group(); bit.position.z = 1.25;
      const cone = cyl(0, 0.42, 1.5, mat(0xc9ccd1, { metalness: 0.8 }), 0, 0, 0.75, 8); cone.rotation.x = Math.PI / 2;
      bit.add(cone); g.add(bit);
      ud.animate = (g, a) => { bit.rotation.z += a.dt * (a.held ? 40 : 3); g.position.z = a.held ? 0.15 + Math.sin(a.t * 50) * 0.04 : 0; };
      break;
    }
    case 'saw': {
      upperArm(g, accent);
      const blade = new THREE.Group(); blade.position.set(0, 0, 1.6);
      const disc = cyl(0.95, 0.95, 0.08, mat(0xd8dade, { metalness: 0.9, roughness: 0.3 }), 0, 0, 0, 14); disc.rotation.z = Math.PI / 2;
      blade.add(disc);
      for (let i = 0; i < 10; i++) {
        const t = box(0.1, 0.22, 0.22, mat(DARK), 0, Math.cos(i / 10 * Math.PI * 2) * 0.98, Math.sin(i / 10 * Math.PI * 2) * 0.98);
        t.rotation.x = i / 10 * Math.PI * 2; blade.add(t);
      }
      g.add(blade);
      ud.animate = (g, a) => { blade.rotation.x += a.dt * (a.prog > 0 ? 30 : 6); g.rotation.y = a.prog > 0 ? Math.sin(a.prog * Math.PI) * -1.2 * (g.userData.side || 1) : 0; };
      break;
    }
    case 'glove': {
      upperArm(g, accent);
      const ext = new THREE.Group(); ext.position.z = 1.2;
      const spring = cyl(0.12, 0.12, 1, mat(0xdddd55), 0, 0, 0.5, 6); spring.rotation.x = Math.PI / 2;
      const glove = sph(0.55, mat(0xd8312b), 0, 0, 1.1); glove.scale.set(1, 0.9, 1.1);
      ext.add(spring); g.add(ext, glove);
      ud.animate = (g, a) => {
        const e = a.prog > 0 ? Math.sin(a.prog * Math.PI) * 4.5 : 0;
        spring.scale.y = 0.3 + e; spring.position.z = (0.3 + e) / 2; glove.position.z = 1.4 + e;
      };
      break;
    }
    case 'magnet': {
      upperArm(g, accent);
      const u = mesh(new THREE.TorusGeometry(0.5, 0.2, 6, 12, Math.PI), mat(0xd8312b), 0, 0, 1.4);
      u.rotation.set(Math.PI / 2, 0, Math.PI / 2 * 0); u.rotation.x = -Math.PI / 2;
      g.add(u, box(0.4, 0.4, 0.3, mat(0xdddddd), 0.5, 0, 1.55), box(0.4, 0.4, 0.3, mat(0xdddddd), -0.5, 0, 1.55));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 10, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x77ccff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      beam.rotation.x = Math.PI / 2; beam.position.z = 6.6; beam.visible = false; g.add(beam);
      ud.animate = (g, a) => { beam.visible = a.held; if (a.held) beam.material.opacity = 0.18 + Math.sin(a.t * 30) * 0.08; };
      break;
    }
    case 'flame': {
      upperArm(g, accent);
      const n = cyl(0.15, 0.3, 0.8, mat(DARK), 0, 0, 1.6, 8); n.rotation.x = Math.PI / 2;
      g.add(n, cyl(0.25, 0.25, 0.9, mat(0xd8312b), 0.4, 0.15, 0.9, 8));
      ud.tip = new THREE.Object3D(); ud.tip.position.z = 2.1; g.add(ud.tip);
      ud.flame = true;
      break;
    }

    // ---------------- legs (origin = mech feet)
    case 'stubby': {
      const L = new THREE.Group(), R = new THREE.Group(); L.position.set(-0.5, 1.35, 0); R.position.set(0.5, 1.35, 0);
      for (const leg of [L, R]) { leg.add(box(0.45, 1.1, 0.45, mat(METAL), 0, -0.6, 0), box(0.6, 0.3, 0.85, mat(accent), 0, -1.2, 0.1)); }
      g.add(L, R);
      ud.animate = (g, a) => { const s = Math.sin(a.walkPhase) * 0.6 * a.walk; L.rotation.x = s; R.rotation.x = -s; };
      break;
    }
    case 'treads': {
      for (const x of [-0.85, 0.85]) {
        g.add(box(0.6, 0.9, 2.2, mat(0x2b2e33), x, 0.45, 0));
        for (const z of [-0.75, 0, 0.75]) { const w = cyl(0.33, 0.33, 0.65, mat(accent), x, 0.45, z, 8); w.rotation.z = Math.PI / 2; g.add(w); }
      }
      g.add(box(1.2, 0.6, 1, mat(METAL), 0, 1.1, 0));
      ud.animate = (g, a) => { g.position.y = a.walk > 0.05 ? Math.abs(Math.sin(a.t * 25)) * 0.04 : 0; };
      break;
    }
    case 'spider': {
      const legs = [];
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const pivot = new THREE.Group(); pivot.position.set(0, 1.4, 0); pivot.rotation.y = ang;
        const up = box(0.2, 0.2, 1.3, mat(METAL), 0, 0.3, 0.6); up.rotation.x = -0.5; pivot.add(up);
        const low = box(0.18, 1.6, 0.18, mat(accent), 0, -0.45, 1.25); low.rotation.x = 0.25; pivot.add(low);
        g.add(pivot); legs.push(pivot);
      }
      g.add(sph(0.5, mat(DARK), 0, 1.4, 0));
      ud.animate = (g, a) => legs.forEach((p, i) => { p.rotation.x = Math.sin(a.walkPhase * 1.4 + i * 1.6) * 0.3 * a.walk; });
      break;
    }
    case 'rocket': {
      const L = new THREE.Group(), R = new THREE.Group(); L.position.set(-0.5, 1.35, 0); R.position.set(0.5, 1.35, 0);
      const flames = [];
      for (const leg of [L, R]) {
        leg.add(box(0.45, 1.0, 0.45, mat(METAL), 0, -0.55, 0), cyl(0.38, 0.3, 0.5, mat(accent), 0, -1.1, 0, 8));
        const f = cyl(0.25, 0, 0.8, new THREE.MeshBasicMaterial({ color: 0xffaa33 }), 0, -1.65, 0, 8); f.castShadow = false;
        leg.add(f); flames.push(f);
      }
      g.add(L, R);
      ud.animate = (g, a) => {
        const s = Math.sin(a.walkPhase) * 0.35 * a.walk; L.rotation.x = s - a.walk * 0.3; R.rotation.x = -s - a.walk * 0.3;
        flames.forEach((f) => { f.scale.y = 0.4 + a.walk * 0.8 + Math.random() * 0.4; });
      };
      break;
    }
    case 'pogo': {
      const stick = new THREE.Group(); g.add(stick);
      stick.add(cyl(0.12, 0.12, 1.4, mat(METAL), 0, 0.75, 0, 6), box(1.0, 0.18, 0.5, mat(accent), 0, 0.9, 0), cyl(0.3, 0.3, 0.12, mat(DARK), 0, 0.06, 0, 8));
      for (let i = 0; i < 4; i++) { const r = mesh(new THREE.TorusGeometry(0.22, 0.05, 4, 10), mat(0xdddd55), 0, 0.3 + i * 0.12, 0); r.rotation.x = Math.PI / 2; stick.add(r); }
      ud.animate = (g, a) => { stick.scale.y = a.gr ? 0.8 : 1 + Math.min(0.2, Math.abs(a.vy) * 0.01); };
      break;
    }

    // ---------------- back (origin = back mount)
    case 'jetpack': {
      const fl = [];
      for (const x of [-0.35, 0.35]) {
        g.add(cyl(0.28, 0.28, 1.2, mat(METAL), x, 0, -0.1, 8), cyl(0.2, 0.3, 0.3, mat(DARK), x, -0.7, -0.1, 8));
        const f = cyl(0.22, 0, 1, new THREE.MeshBasicMaterial({ color: 0x66ccff }), x, -1.3, -0.1, 8); f.visible = false; g.add(f); fl.push(f);
      }
      g.add(box(0.5, 0.3, 0.3, mat(accent), 0, 0.3, 0.05));
      ud.animate = (g, a) => fl.forEach((f) => { f.visible = a.active; f.scale.y = 0.7 + Math.random() * 0.6; });
      break;
    }
    case 'shield': {
      g.add(box(0.9, 0.9, 0.5, mat(DARK), 0, 0, -0.1), cyl(0.04, 0.04, 0.8, mat(METAL), 0.3, 0.8, -0.1, 4));
      const orb = sph(0.25, new THREE.MeshBasicMaterial({ color: 0x77ddff }), 0, 0.15, -0.4); g.add(orb);
      ud.animate = (g, a) => { orb.scale.setScalar(a.ready ? 1 + Math.sin(a.t * 6) * 0.15 : 0.5); };
      break;
    }
    case 'missiles': {
      g.add(box(1.2, 0.9, 0.7, mat(accent), 0, 0.2, -0.15));
      for (let i = 0; i < 4; i++) { const t = cyl(0.14, 0.14, 0.2, mat(0x222222), -0.3 + (i % 2) * 0.6, 0.6, -0.15 + (i < 2 ? -0.15 : 0.15), 6); g.add(t); }
      g.rotation.x = -0.3;
      break;
    }
    case 'extra': {
      const spin = new THREE.Group(); g.add(spin); spin.position.z = 0.5;
      for (const s of [-1, 1]) {
        const a = box(1.6, 0.25, 0.25, mat(METAL), s * 1.1, 0.4, 0); spin.add(a);
        spin.add(box(0.45, 0.45, 0.45, mat(accent), s * 1.95, 0.4, 0));
      }
      ud.animate = (g, a) => { spin.rotation.y = a.active ? spin.rotation.y + a.dt * 22 : Math.sin(a.t * 2) * 0.15; };
      break;
    }

    // ---------------- head (origin = neck)
    case 'helmet': {
      g.add(mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(accent), 0, 0.15, 0));
      g.add(box(1.0, 0.2, 0.3, mat(0x222222), 0, 0.3, 0.55), box(1.5, 0.1, 1.5, mat(METAL), 0, 0.15, 0));
      break;
    }
    case 'horn': {
      g.add(box(0.8, 0.6, 0.8, mat(METAL), 0, 0.3, 0));
      const h = cyl(0, 0.25, 1.2, mat(0xeeeecc), 0, 0.5, 0.9, 8); h.rotation.x = Math.PI / 2 - 0.3; g.add(h);
      g.add(box(0.6, 0.15, 0.1, mat(0xff3333, { emissive: 0x991111 }), 0, 0.35, 0.41));
      break;
    }
    case 'radar': {
      g.add(box(0.7, 0.5, 0.7, mat(METAL), 0, 0.25, 0));
      const dish = new THREE.Group(); dish.position.y = 0.8;
      const d = mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), mat(0xdddddd, { side: THREE.DoubleSide }), 0, 0, 0);
      d.rotation.x = -Math.PI / 2 + 0.5; dish.add(d, cyl(0.05, 0.05, 0.5, mat(accent), 0, -0.2, 0, 4)); g.add(dish);
      ud.animate = (g, a) => { dish.rotation.y += a.dt * 2; };
      break;
    }
    case 'googly': {
      g.add(box(0.9, 0.55, 0.7, mat(METAL), 0, 0.27, 0));
      const pupils = [];
      for (const x of [-0.25, 0.25]) {
        g.add(sph(0.3, mat(0xffffff, { metalness: 0, roughness: 0.3 }), x, 0.65, 0.3));
        const p = sph(0.13, mat(0x111111, { metalness: 0 }), x, 0.65, 0.55); g.add(p); pupils.push(p);
      }
      ud.animate = (g, a) => pupils.forEach((p, i) => { p.position.y = 0.65 + Math.sin(a.t * 9 + i * 2) * 0.1; p.position.x = (i ? 0.25 : -0.25) + Math.cos(a.t * 7 + i) * 0.08; });
      break;
    }
    case 'basicHead': {
      g.add(box(0.8, 0.55, 0.7, mat(METAL), 0, 0.27, 0), box(0.65, 0.18, 0.1, mat(0x66eeff, { emissive: 0x2299aa }), 0, 0.32, 0.36));
      break;
    }
  }
  return g;
}
