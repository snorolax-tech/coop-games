// The town: buildings (solid), lootable containers, the base, lighting for day/night.
// Layout is fixed so the host and guest build identical towns (same container ids).
import * as THREE from 'three';

export const MAP = 66;          // players are kept inside +-MAP
export const SPAWN_R = 72;      // zombies spawn on this ring
export const BENCH = { x: 4, z: 4 };
export const BASE = { x: 0, z: 0 };

const LOOT = {
  toolbox: ['pipe', 'drill', 'sawblade', 'wire', 'battery', 'tape', 'nails', 'chain', 'spring', 'scrap', 'carbatt'],
  kitchen: ['knife', 'bottle', 'pan', 'bleach', 'glue', 'lighter', 'tape', 'alarm', 'fan', 'bandage', 'machete'],
  car: ['carbatt', 'gascan', 'rope', 'flashlight', 'tape', 'spring', 'bat', 'scrap', 'pipe'],
  dumpster: ['scrap', 'plank', 'bottle', 'brick', 'nails', 'bucket', 'chain', 'fence', 'plank'],
  gas: ['gascan', 'lighter', 'propane', 'firework', 'bottle', 'flashlight', 'gascan'],
  shed: ['mowblade', 'rake', 'fence', 'plank', 'rope', 'bucket', 'spring', 'fan', 'magnet'],
  medicine: ['bandage', 'pills', 'medkit', 'bandage', 'pills'],
  store: ['firework', 'bowling', 'bat', 'magnet', 'battery', 'flashlight', 'alarm', 'glue', 'bleach', 'propane'],
};
export const CONTAINER_NAMES = { toolbox: 'Toolbox', kitchen: 'Kitchen Cabinet', car: 'Car Trunk', dumpster: 'Dumpster',
  gas: 'Gas Station Shelf', shed: 'Garden Shed', medicine: 'Medicine Cabinet', store: 'Store Shelf', stash: 'Base Stash' };

export function rollLoot(type, rng = Math.random) {
  if (type === 'stash') return ['plank', 'plank', 'knife', 'bat', 'tape', 'bandage'];
  const t = LOOT[type];
  const n = 2 + (rng() < 0.45 ? 1 : 0);
  return Array.from({ length: n }, () => t[Math.floor(rng() * t.length)]);
}

// ---------------------------------------------------------------- layout
const HOUSE_COLORS = [0xd8c3a5, 0xa3c4bc, 0xe8b4a0, 0xc9d6df, 0xf1e3c8, 0xb8a9c9];
function layout() {
  const B = []; // {x,z,w,d,h,kind}
  const C = []; // containers {type,x,z,rot}
  const house = (x, z, face) => {
    B.push({ x, z, w: 10, d: 8, h: 5, kind: 'house' });
    C.push({ type: 'kitchen', x: x - 2, z: z + face * 5, rot: 0 });
    C.push({ type: 'medicine', x: x + 3, z: z + face * 5, rot: 0 });
  };
  house(20, 18, -1); house(38, 18, -1); house(-20, 18, -1); house(-40, 18, -1);
  house(20, -18, 1); house(40, -18, 1); house(-44, -20, 1);
  house(-20, -44, 1); house(-42, -44, 1); house(22, -44, 1); house(44, 42, -1);
  // auto shop
  B.push({ x: 20, z: 42, w: 14, d: 10, h: 6, kind: 'garage' });
  C.push({ type: 'toolbox', x: 14, z: 35.5 }, { type: 'toolbox', x: 24, z: 35.5 }, { type: 'car', x: 30, z: 33, rot: 0.3, collide: true });
  // store
  B.push({ x: -28, z: 42, w: 18, d: 10, h: 6, kind: 'store' });
  C.push({ type: 'store', x: -33, z: 35.5 }, { type: 'store', x: -23, z: 35.5 }, { type: 'dumpster', x: -40, z: 36, collide: true });
  // gas station
  B.push({ x: -26, z: -26, w: 8, d: 6, h: 4, kind: 'gasshop' });
  C.push({ type: 'gas', x: -26, z: -21.5 }, { type: 'gas', x: -18, z: -14 }, { type: 'gas', x: -32, z: -14 });
  // sheds
  B.push({ x: 44, z: -42, w: 6, d: 5, h: 3.5, kind: 'shed' });
  C.push({ type: 'shed', x: 44, z: -38.5 }, { type: 'shed', x: -8, z: 30 }, { type: 'dumpster', x: 30, z: -30, collide: true });
  // parked cars on the streets
  for (const [x, z, r] of [[12, -3, 0], [-14, 3, 0], [3, 22, Math.PI / 2], [-3, -24, Math.PI / 2], [34, 3, 0], [-48, -3, 0], [3, -52, Math.PI / 2], [-3, 50, Math.PI / 2]])
    C.push({ type: 'car', x, z, rot: r, collide: true });
  C.push({ type: 'dumpster', x: 8, z: -10, collide: true }, { type: 'stash', x: -4, z: 5 });
  C.forEach((c, i) => { c.id = i; c.rot = c.rot || 0; });
  return { B, C };
}
export const LAYOUT = layout();

// ---------------------------------------------------------------- collision
export const COLLIDERS = [];
for (const b of LAYOUT.B) COLLIDERS.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
for (const c of LAYOUT.C) if (c.collide) {
  const along = c.type === 'car' ? 2.2 : 1.6, across = c.type === 'car' ? 1.1 : 0.9;
  const ax = Math.abs(Math.cos(c.rot)) > 0.5;
  COLLIDERS.push(ax ? { minX: c.x - along, maxX: c.x + along, minZ: c.z - across, maxZ: c.z + across }
    : { minX: c.x - across, maxX: c.x + across, minZ: c.z - along, maxZ: c.z + along });
}
COLLIDERS.push({ minX: BENCH.x - 1.2, maxX: BENCH.x + 1.2, minZ: BENCH.z - 0.6, maxZ: BENCH.z + 0.6 });

/** push a circle (pos.x,pos.z,r) out of all colliders (+ extra list). returns true if it hit something */
export function collide(pos, r, extra) {
  let hit = false;
  const test = (c) => {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX)), cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    hit = true;
    if (d2 > 1e-6) { const d = Math.sqrt(d2), p = r - d; pos.x += dx / d * p; pos.z += dz / d * p; }
    else { // centre inside the box: push out the nearest side
      const o = [pos.x - c.minX, c.maxX - pos.x, pos.z - c.minZ, c.maxZ - pos.z];
      const i = o.indexOf(Math.min(...o));
      if (i === 0) pos.x = c.minX - r; else if (i === 1) pos.x = c.maxX + r; else if (i === 2) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
    }
  };
  for (const c of COLLIDERS) test(c);
  if (extra) for (const c of extra) test(c);
  return hit;
}

// ---------------------------------------------------------------- visuals
const mats = new Map();
const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o })); return mats.get(k); };
function box(w, h, d, c, x, y, z, parent, o) { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; parent.add(me); return me; }

export class Town {
  constructor(scene) {
    this.scene = scene;
    this.containerMeshes = new Map();
    this.hemi = new THREE.HemisphereLight(0xdde8ff, 0x55603a, 1.4);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0x9fc4e0, 40, 140);
    scene.background = new THREE.Color(0x9fc4e0);
    this.night = 0;
    this._build();
  }

  _build() {
    const s = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x5b7a3a));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    // roads
    const road = mat(0x3b3d42);
    for (const [w, d] of [[140, 9], [9, 140]]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), road); r.rotation.x = -Math.PI / 2; r.position.y = 0.02; r.receiveShadow = true; s.add(r); }
    for (let i = -66; i < 66; i += 6) {
      if (Math.abs(i) < 6) continue;
      for (const [x, z, w, d] of [[i, 0, 3, 0.25], [0, i, 0.25, 3]]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0xf2e394)); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.03, z); s.add(l); }
    }
    // base plaza
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 24), mat(0x6e6a62)); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.04; plaza.receiveShadow = true; s.add(plaza);
    // buildings
    LAYOUT.B.forEach((b, i) => {
      const g = new THREE.Group(); g.position.set(b.x, 0, b.z); s.add(g);
      const col = b.kind === 'house' ? HOUSE_COLORS[i % HOUSE_COLORS.length] : b.kind === 'garage' ? 0x8d99ae : b.kind === 'store' ? 0xe9d8a6 : b.kind === 'gasshop' ? 0xf1f1f1 : 0x9c6644;
      box(b.w, b.h, b.d, col, 0, b.h / 2, 0, g);
      if (b.kind === 'house' || b.kind === 'shed') {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(b.w, b.d) / 2 + 0.4, 3, 4), mat(b.kind === 'shed' ? 0x5e503f : [0x7f4f24, 0x6c584c, 0x9d0208, 0x495057][i % 4]));
        roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, b.d / b.w); roof.position.y = b.h + 1.5; roof.castShadow = true; g.add(roof);
      } else box(b.w + 0.4, 0.5, b.d + 0.4, 0x495057, 0, b.h + 0.25, 0, g);
      // door + windows on both long sides
      for (const sd of [-1, 1]) {
        box(1.4, 2.4, 0.1, 0x5c3d2e, 0, 1.2, sd * (b.d / 2 + 0.03), g);
        for (const wx of [-b.w / 3, b.w / 3]) box(1.6, 1.2, 0.1, 0x22313f, wx, 2.6, sd * (b.d / 2 + 0.03), g, { emissive: 0x000000 });
      }
      if (b.kind === 'store') box(10, 1.2, 0.3, 0xd62828, 0, b.h - 0.8, -(b.d / 2 + 0.2), g);
      if (b.kind === 'garage') box(6, 3.5, 0.1, 0x6c757d, 0, 1.75, -(b.d / 2 + 0.03), g);
    });
    // gas station canopy + pumps
    const can = box(18, 0.6, 9, 0xd62828, -25, 5, -15, s);
    for (const [x, z] of [[-33, -11], [-17, -11], [-33, -19], [-17, -19]]) box(0.4, 5, 0.4, 0xdddddd, x, 2.5, z, s);
    can.castShadow = true;
    // town edge: fence + trees
    const rng = mulberry(11);
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2, d = MAP + 6 + rng() * 30;
      this._tree(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rng() * 0.8);
    }
    for (let i = 0; i < 18; i++) { const x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 120; if (Math.abs(x) > 8 && Math.abs(z) > 8 && !COLLIDERS.some((c) => x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3)) this._tree(x, z, 0.7); }
    for (let i = 0; i < 4; i++) {
      const L = 2 * MAP + 2, side = new THREE.Group();
      for (let k = -MAP; k <= MAP; k += 4) box(0.2, 1.4, 0.2, 0x7f5539, k, 0.7, 0, side);
      box(L, 0.15, 0.1, 0x7f5539, 0, 1.1, 0, side); box(L, 0.15, 0.1, 0x7f5539, 0, 0.5, 0, side);
      side.rotation.y = i * Math.PI / 2; side.position.set(i === 1 ? MAP + 1 : i === 3 ? -MAP - 1 : 0, 0, i === 0 ? MAP + 1 : i === 2 ? -MAP - 1 : 0);
      s.add(side);
    }
    // base: workbench, campfire, sandbags
    const bench = new THREE.Group(); bench.position.set(BENCH.x, 0, BENCH.z); s.add(bench);
    box(2.4, 0.15, 1.2, 0x8b5e34, 0, 1, 0, bench);
    for (const [x, z] of [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]]) box(0.12, 1, 0.12, 0x5c3d2e, x, 0.5, z, bench);
    box(0.5, 0.3, 0.3, 0xd62828, -0.6, 1.22, 0, bench); box(0.15, 0.15, 0.6, 0x888888, 0.5, 1.15, 0.1, bench);
    box(2.4, 1, 0.1, 0x6c584c, 0, 1.6, -0.55, bench);
    this.benchSign = bench;
    const fire = new THREE.Group(); fire.position.set(-2, 0, -2); s.add(fire);
    for (let i = 0; i < 6; i++) { const r = box(0.9, 0.15, 0.15, 0x5c3d2e, 0, 0.1, 0, fire); r.rotation.y = i; }
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xff8c1a }));
    this.flame.position.y = 0.7; fire.add(this.flame);
    this.fireLight = new THREE.PointLight(0xff8a2a, 0, 22, 1.6); this.fireLight.position.set(-2, 1.6, -2); s.add(this.fireLight);
    // street lamps (only bright at night)
    this.lamps = [];
    for (const [x, z] of [[6, 6], [-6, -6], [6, -30], [-6, 30], [30, 6], [-30, -6]]) {
      box(0.2, 6, 0.2, 0x333333, x, 3, z, s);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x777766 })); bulb.position.set(x, 6, z); s.add(bulb);
      const l = new THREE.PointLight(0xffe6a8, 0, 20, 1.5); l.position.set(x, 5.6, z); s.add(l);
      this.lamps.push({ l, bulb });
    }
    // containers
    for (const c of LAYOUT.C) this.containerMeshes.set(c.id, this._container(c));
  }

  _tree(x, z, k) {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.scale.setScalar(k);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), mat(0x6b4f2a)); trunk.position.y = 1.5; t.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 7), mat(0x2d6a4f)); top.position.y = 5; top.castShadow = true; t.add(top);
    this.scene.add(t);
  }

  _container(c) {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); g.rotation.y = c.rot; this.scene.add(g);
    switch (c.type) {
      case 'car': {
        const col = [0x2b59c3, 0xc1121f, 0xe9c46a, 0x6a994e, 0xadb5bd][c.id % 5];
        box(4.2, 0.9, 1.9, col, 0, 0.75, 0, g); box(2.2, 0.8, 1.7, col, -0.2, 1.55, 0, g);
        box(2.0, 0.6, 1.72, 0x22313f, -0.2, 1.55, 0, g);
        for (const [x, z] of [[-1.4, 1], [1.4, 1], [-1.4, -1], [1.4, -1]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), mat(0x111111)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.4, z * 0.95); g.add(w); }
        g.userData.lid = box(0.9, 0.1, 1.6, col, 1.75, 1.25, 0, g);
        break;
      }
      case 'dumpster': box(3.2, 1.6, 1.8, 0x2d6a4f, 0, 0.8, 0, g); g.userData.lid = box(3.3, 0.12, 1.9, 0x1b4332, 0, 1.66, 0, g); break;
      case 'toolbox': box(1.2, 0.9, 0.6, 0xc1121f, 0, 0.45, 0, g); g.userData.lid = box(1.25, 0.12, 0.65, 0x9d0208, 0, 0.96, 0, g); break;
      case 'kitchen': box(1.4, 1.0, 0.6, 0xa47148, 0, 0.5, 0, g); g.userData.lid = box(1.45, 0.1, 0.65, 0xe9ecef, 0, 1.05, 0, g); break;
      case 'medicine': box(0.8, 1.2, 0.4, 0xf8f9fa, 0, 0.6, 0, g); box(0.4, 0.12, 0.05, 0xe63946, 0, 0.8, 0.21, g); box(0.12, 0.4, 0.05, 0xe63946, 0, 0.8, 0.21, g); g.userData.lid = box(0.85, 0.08, 0.45, 0xdddddd, 0, 1.24, 0, g); break;
      case 'gas': box(1.6, 1.4, 0.6, 0x495057, 0, 0.7, 0, g); g.userData.lid = box(1.65, 0.1, 0.65, 0xd62828, 0, 1.45, 0, g); break;
      case 'shed': box(1.6, 1.0, 1.0, 0x6c584c, 0, 0.5, 0, g); g.userData.lid = box(1.7, 0.12, 1.1, 0x3d3229, 0, 1.06, 0, g); break;
      case 'store': box(2.0, 1.6, 0.6, 0xadb5bd, 0, 0.8, 0, g); for (const y of [0.5, 1.0]) box(2.0, 0.06, 0.6, 0x6c757d, 0, y, 0, g); g.userData.lid = box(2.05, 0.08, 0.65, 0x6c757d, 0, 1.62, 0, g); break;
      case 'stash': box(1.4, 0.8, 0.9, 0x8b5e34, 0, 0.4, 0, g); g.userData.lid = box(1.45, 0.12, 0.95, 0x6f4518, 0, 0.86, 0, g); break;
    }
    // glow marker (hidden once looted)
    const mk = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    mk.position.y = c.type === 'car' ? 2.6 : c.type === 'dumpster' ? 2.4 : 1.9; g.add(mk); g.userData.marker = mk;
    return g;
  }

  setLooted(looted) {
    for (const [id, g] of this.containerMeshes) {
      const l = looted.has(id);
      g.userData.marker.visible = !l;
      if (g.userData.lid) g.userData.lid.rotation.x = l ? -0.5 : 0;
    }
  }

  /** k: 0 = full day, 1 = full night */
  setNight(k, focus) {
    this.night = k;
    const day = new THREE.Color(0x9fc4e0), night = new THREE.Color(0x0b1020);
    this.scene.background.copy(day).lerp(night, k);
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.near = 40 - k * 25; this.scene.fog.far = 140 - k * 85;
    this.hemi.intensity = 1.4 - k * 1.05;
    this.hemi.color.set(0xdde8ff).lerp(new THREE.Color(0x4060a0), k);
    this.sun.intensity = 2.4 * (1 - k) + 0.25 * k;
    this.sun.color.set(0xfff0d8).lerp(new THREE.Color(0x8899cc), k);
    this.fireLight.intensity = 6 + k * 40;
    for (const L of this.lamps) { L.l.intensity = k * 35; L.bulb.material.color.setHex(k > 0.4 ? 0xffe6a8 : 0x777766); }
    if (focus) { this.sun.position.set(focus.x + 30, 60, focus.z + 20); this.sun.target.position.set(focus.x, 0, focus.z); }
  }

  update(dt, t) {
    this.flame.scale.set(1 + Math.sin(t * 13) * 0.12, 1 + Math.sin(t * 9) * 0.2, 1);
    for (const g of this.containerMeshes.values()) if (g.userData.marker.visible) { g.userData.marker.rotation.y = t * 2; g.userData.marker.position.y += Math.sin(t * 3) * 0.002; }
  }
}

export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
