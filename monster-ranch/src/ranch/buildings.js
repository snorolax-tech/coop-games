// Player-built ranch buildings: models, colliders, placement rules and the shared list.
// The host owns the list (place / demolish requests from either rancher) and both
// clients rebuild meshes from it.
import * as THREE from 'three';
import { BUILDINGS, HATCH_TIME } from '../data/buildings.js';
import { TYPES } from '../data/types.js';
import { HUB_R } from '../world/zones.js';
import { G } from '../world/props.js';
import { SPECIES_BY_ID } from '../data/creatures.js';
import { buildCreatureModel } from '../creatures/model.js';

const M = (c, e) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...(e || {}) });
const mesh = (geo, mat, parent, x, y, z, sx, sy = sx, sz = sx) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
};
const lampMat = M('#ffe08a', { emissive: 0xffc94a, emissiveIntensity: 0.2 });
const PEN_HALF = 5;
const GATE_HALF = 1.3;

/** Build the visual model for a building type (local space, +z = front). */
export function buildModel(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'pen': {
      mesh(G.box, M('#d9c38a'), g, 0, 0.03, 0, PEN_HALF * 2, 0.06, PEN_HALF * 2);
      const post = M('#a0612f'), rail = M('#e0a96d');
      const sides = [
        [[-PEN_HALF, -PEN_HALF], [PEN_HALF, -PEN_HALF]],
        [[PEN_HALF, -PEN_HALF], [PEN_HALF, PEN_HALF]],
        [[-PEN_HALF, -PEN_HALF], [-PEN_HALF, PEN_HALF]],
        [[-PEN_HALF, PEN_HALF], [-GATE_HALF, PEN_HALF]],
        [[GATE_HALF, PEN_HALF], [PEN_HALF, PEN_HALF]],
      ];
      for (const [[ax, az], [bx, bz]] of sides) {
        const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / 2));
        for (let i = 0; i <= n; i++) mesh(G.box, post, g, ax + (bx - ax) * i / n, 0.6, az + (bz - az) * i / n, 0.2, 1.2, 0.2);
        for (const h of [0.45, 0.95]) { const r = mesh(G.box, rail, g, (ax + bx) / 2, h, (az + bz) / 2, 0.1, 0.14, len); r.rotation.y = ang; }
      }
      // hay pile + water bowl
      mesh(G.sphere, M('#f2d27a'), g, -3.4, 0.25, -3.4, 1.4, 0.5, 1.1);
      mesh(G.cyl, M('#7d7d88'), g, 3.6, 0.15, -3.6, 0.6, 0.3, 0.6);
      mesh(G.cyl, M('#4cc9f0'), g, 3.6, 0.31, -3.6, 0.5, 0.02, 0.5);
      break;
    }
    case 'trough': {
      const wood = M('#a0612f');
      mesh(G.box, wood, g, 0, 0.45, 0, 2.4, 0.2, 0.9);
      mesh(G.box, wood, g, 0, 0.7, 0.42, 2.4, 0.5, 0.08);
      mesh(G.box, wood, g, 0, 0.7, -0.42, 2.4, 0.5, 0.08);
      mesh(G.box, wood, g, 1.18, 0.7, 0, 0.08, 0.5, 0.9);
      mesh(G.box, wood, g, -1.18, 0.7, 0, 0.08, 0.5, 0.9);
      for (const x of [-1, 1]) for (const z of [-0.35, 0.35]) mesh(G.box, M('#6b3e2e'), g, x, 0.2, z, 0.12, 0.4, 0.12);
      const food = new THREE.Group(); food.name = 'food'; g.add(food);
      for (let i = 0; i < 10; i++) {
        const b = mesh(G.sphere, M(i % 3 ? '#e63946' : '#7ae7ff'), food, -0.95 + (i % 5) * 0.47, 0.62 + Math.floor(i / 5) * 0.1, i < 5 ? -0.15 : 0.15, 0.2);
        b.visible = false;
      }
      break;
    }
    case 'pond': {
      const water = mesh(new THREE.CircleGeometry(1, 28), M('#4cc9f0', { emissive: 0x0a3550, transparent: true, opacity: 0.85 }), g, 0, 0.08, 0, 4);
      water.rotation.x = -Math.PI / 2;
      mesh(new THREE.CircleGeometry(1, 28), M('#d9c38a'), g, 0, 0.04, 0, 4.5).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        mesh(G.dodec, M(i % 2 ? '#a2a2ad' : '#8d8f86'), g, Math.cos(a) * 4.3, 0.15, Math.sin(a) * 4.3, 0.55, 0.35, 0.55).rotation.set(i, i * 2, 0);
      }
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        mesh(G.cyl, M('#3fae4f'), g, Math.cos(a) * 2.2, 0.1, Math.sin(a) * 2.2, 0.55, 0.03, 0.55);
      }
      mesh(G.ico, M('#ff9fc7'), g, 1.5, 0.25, -1.2, 0.3);
      break;
    }
    case 'flowers': {
      mesh(G.box, M('#8b5a2b'), g, 0, 0.15, 0, 2, 0.3, 2);
      mesh(G.box, M('#5e3b1c'), g, 0, 0.31, 0, 1.8, 0.04, 1.8);
      const cols = ['#ff70a6', '#ffd670', '#70d6ff', '#c77dff', '#ffffff'];
      for (let i = 0; i < 9; i++) {
        const x = -0.6 + (i % 3) * 0.6, z = -0.6 + Math.floor(i / 3) * 0.6;
        mesh(G.cylLow, M('#3f9b4a'), g, x, 0.5, z, 0.05, 0.4, 0.05);
        mesh(G.ico, M(cols[i % cols.length]), g, x, 0.75, z, 0.22, 0.14, 0.22);
      }
      break;
    }
    case 'lamp': {
      mesh(G.cyl, M('#3d405b'), g, 0, 1.4, 0, 0.12, 2.8, 0.12);
      mesh(G.box, M('#3d405b'), g, 0, 2.85, 0, 0.5, 0.08, 0.5);
      mesh(G.box, lampMat, g, 0, 3.15, 0, 0.36, 0.5, 0.36).userData.noHighlight = true;
      mesh(G.cone, M('#3d405b'), g, 0, 3.55, 0, 0.6, 0.3, 0.6);
      mesh(G.cyl, M('#3d405b'), g, 0, 0.1, 0, 0.35, 0.2, 0.35);
      break;
    }
    case 'bench': {
      const wood = M('#c98d4b');
      mesh(G.box, wood, g, 0, 0.5, 0, 2.2, 0.12, 0.6);
      mesh(G.box, wood, g, 0, 0.95, -0.28, 2.2, 0.5, 0.08);
      for (const x of [-0.95, 0.95]) for (const z of [-0.22, 0.22]) mesh(G.box, M('#5e3b1c'), g, x, 0.25, z, 0.1, 0.5, 0.1);
      break;
    }
    case 'sapling': {
      mesh(G.cyl, M('#8b5a2b'), g, 0, 1.2, 0, 0.3, 2.4, 0.3);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6;
        mesh(G.ico, M(i % 2 ? '#ffb7d5' : '#ffc9e0'), g, Math.sin(a) * (i ? 0.7 : 0), 2.7 + (i ? 0.2 : 0.5), Math.cos(a) * (i ? 0.7 : 0), i ? 1.5 : 2);
      }
      break;
    }
    case 'breeder': {
      mesh(new THREE.CircleGeometry(1, 20), M('#ffd6e8'), g, 0, 0.04, 0, 3.4).rotation.x = -Math.PI / 2;
      const post = M('#ff8fb8'), rail = M('#ffffff');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; // gate gap facing +z
        mesh(G.box, post, g, Math.sin(a) * 3.5, 0.5, Math.cos(a) * 3.5, 0.18, 1, 0.18);
      }
      const ring = mesh(new THREE.TorusGeometry(3.5, 0.06, 4, 40, Math.PI * 1.8), rail, g, 0, 0.85, 0, 1);
      ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 2 + 0.31;
      mesh(G.sphere, M('#f2d27a'), g, 0, 0.25, -0.5, 1.8, 0.45, 1.5); // nest
      // heart sign
      const heart = new THREE.Group(); heart.position.set(0, 2.4, -3.4); g.add(heart);
      const hm = M('#ff4d8d', { emissive: 0x661030 });
      mesh(G.sphere, hm, heart, -0.22, 0.1, 0, 0.32, 0.32, 0.12);
      mesh(G.sphere, hm, heart, 0.22, 0.1, 0, 0.32, 0.32, 0.12);
      const tip = mesh(G.cone, hm, heart, 0, -0.25, 0, 0.42, 0.55, 0.12); tip.rotation.z = Math.PI;
      mesh(G.cyl, M('#8b5a2b'), g, 0, 1.1, -3.45, 0.08, 2.2, 0.08);
      break;
    }
    case 'incubator': {
      mesh(G.box, M('#e0e0ea'), g, 0, 0.5, 0, 1.6, 1, 1.4);
      mesh(G.box, M('#ffb347'), g, 0, 1.02, 0, 1.4, 0.06, 1.2);
      const dome = mesh(G.sphere, M('#cdeffd', { transparent: true, opacity: 0.45 }), g, 0, 1.05, 0, 0.75, 0.6, 0.65);
      dome.userData.noHighlight = true;
      const warm = mesh(G.sphere, M('#ffcf70', { emissive: 0xff9a30, emissiveIntensity: 0.4 }), g, 0, 1.12, 0, 0.12);
      warm.name = 'warm';
      const slot = new THREE.Group(); slot.name = 'eggSlot'; slot.position.y = 1.25; g.add(slot);
      mesh(G.box, M('#3d405b'), g, 0.55, 0.65, 0.71, 0.3, 0.2, 0.02);
      break;
    }
    case 'trainyard': {
      mesh(new THREE.CircleGeometry(1, 24), M('#e9c46a'), g, 0, 0.04, 0, 4.4).rotation.x = -Math.PI / 2;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        mesh(G.dodec, M('#a2a2ad'), g, Math.sin(a) * 4.5, 0.12, Math.cos(a) * 4.5, 0.35, 0.22, 0.35);
      }
      for (const [x, z] of [[-2.2, -1.8], [2.2, -1.8]]) {
        mesh(G.cyl, M('#8b5a2b'), g, x, 0.9, z, 0.12, 1.8, 0.12);
        mesh(G.sphere, M('#f2d27a'), g, x, 1.5, z, 0.45, 0.6, 0.45);
        mesh(G.sphere, M('#ef476f'), g, x, 1.55, z + 0.35, 0.18, 0.18, 0.05);
      }
      const log = mesh(G.cyl, M('#9a6334'), g, 0, 0.3, 1.6, 0.3, 2.6, 0.3); log.rotation.z = Math.PI / 2;
      break;
    }
    case 'statue': {
      mesh(G.box, M('#b9b9c4'), g, 0, 0.5, 0, 1.6, 1, 1.6);
      mesh(G.box, M('#d0d0da'), g, 0, 1.03, 0, 1.8, 0.08, 1.8);
      const sp = SPECIES_BY_ID[['emberpup', 'puddlop', 'sproutle', 'zapkit', 'puffpip'][Math.floor(Math.random() * 5)]];
      const model = buildCreatureModel(sp);
      const stone = M('#c4c4ce');
      model.root.traverse((o) => { if (o.isMesh) o.material = stone; });
      model.root.scale.setScalar(1.5);
      model.root.position.y = 1.07;
      g.add(model.root);
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Rotate a local (x, z) offset by rot (same convention as Object3D.rotation.y). */
function rotXZ(x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x * c + z * s, -x * s + z * c];
}

export class Buildings {
  constructor(game) {
    this.game = game;
    this.map = new Map(); // id -> entry
    this.nextId = 1;
  }

  get world() { return this.game.world; }

  /** Where creatures in pen `id` may wander (world-space points). */
  penPoint(entry, fx, fz) {
    const [dx, dz] = rotXZ(fx * (PEN_HALF - 1), fz * (PEN_HALF - 1), entry.rot);
    return new THREE.Vector3(entry.x + dx, 0, entry.z + dz);
  }

  pens() { return [...this.map.values()].filter((e) => e.type === 'pen'); }
  troughs() { return [...this.map.values()].filter((e) => e.type === 'trough'); }
  ponds() { return [...this.map.values()].filter((e) => e.type === 'pond'); }
  decorCount() { return [...this.map.values()].filter((e) => BUILDINGS[e.type].kind === 'decor').length; }

  /** Placement check. Returns '' if ok, else a reason. */
  check(type, x, z, ignoreId = null) {
    const def = BUILDINGS[type];
    if (!def) return 'Unknown building';
    if (Math.hypot(x, z) + def.r > HUB_R - 2) return 'Must be inside the ranch fence';
    if (Math.abs(x) < 2.6 + def.r * 0.4 && Math.hypot(x, z) > 8 || Math.abs(z) < 2.6 + def.r * 0.4 && Math.hypot(x, z) > 8) return 'Keep the paths clear';
    for (const s of this.world.reserved) {
      if (s.r < 2.5 && Math.hypot(x - s.x, z - s.z) > s.r + def.r) continue;
      if (Math.hypot(x - s.x, z - s.z) < s.r + def.r - 0.5) return 'Something is in the way';
    }
    for (const e of this.map.values()) {
      if (e.id === ignoreId) continue;
      if (Math.hypot(x - e.x, z - e.z) < BUILDINGS[e.type].r + def.r) return 'Too close to another building';
    }
    return '';
  }

  /** Host: place a building paid for by `actor`. */
  place(actor, type, x, z, rot) {
    const def = BUILDINGS[type];
    const why = this.check(type, x, z);
    if (why) { actor.toast(why, 'bad'); return false; }
    const inv = actor.inventory;
    for (const [k, n] of Object.entries(def.cost)) {
      if ((inv[k] || 0) < n) { actor.toast(`Not enough ${k === 'coins' ? 'coins' : k}! ${def.name} costs ${costText(def.cost)}`, 'bad'); return false; }
    }
    for (const [k, n] of Object.entries(def.cost)) inv[k] -= n;
    this.game.inventoryChanged(actor);
    const e = { id: this.nextId++, type, x, z, rot, food: 0 };
    this._create(e);
    this.game.worldFx('puff', new THREE.Vector3(x, this.world.groundY(x, z) + 0.5, z), 0xffffff);
    this.game.worldSound('knock', new THREE.Vector3(x, 0, z));
    actor.toast(`Built a ${def.name}!`, 'good');
    this.game.ranchChanged();
    return true;
  }

  /** Host: demolish (refund half the coins and all-but-half the materials). */
  demolish(actor, id) {
    const e = this.map.get(id);
    if (!e) return;
    const def = BUILDINGS[e.type];
    for (const [k, n] of Object.entries(def.cost)) {
      const back = Math.floor(n / 2);
      if (!back) continue;
      if (k === 'coins') { actor.inventory.coins += back; } else actor.inventory[k] = (actor.inventory[k] || 0) + back;
    }
    this.game.inventoryChanged(actor);
    this._remove(e);
    this.game.worldFx('puff', new THREE.Vector3(e.x, this.world.groundY(e.x, e.z) + 0.5, e.z), 0xc98d4b);
    actor.toast(`Removed the ${def.name} (half the cost refunded)`, 'muted');
    this.game.ranchChanged();
  }

  _create(e) {
    const g = this.game, w = this.world;
    const group = buildModel(e.type);
    const y = w.groundY(e.x, e.z);
    group.position.set(e.x, y, e.z);
    group.rotation.y = e.rot;
    g.scene.add(group);
    e.group = group;
    e.colliders = [];
    const col = w.colliders;
    const at = (lx, lz) => { const [dx, dz] = rotXZ(lx, lz, e.rot); return [e.x + dx, e.z + dz]; };
    switch (e.type) {
      case 'pen': {
        const segs = [
          [[-PEN_HALF, -PEN_HALF], [PEN_HALF, -PEN_HALF]], [[PEN_HALF, -PEN_HALF], [PEN_HALF, PEN_HALF]],
          [[-PEN_HALF, -PEN_HALF], [-PEN_HALF, PEN_HALF]], [[-PEN_HALF, PEN_HALF], [-GATE_HALF, PEN_HALF]], [[GATE_HALF, PEN_HALF], [PEN_HALF, PEN_HALF]],
        ];
        for (const [a, b] of segs) { const [ax, az] = at(...a), [bx, bz] = at(...b); e.colliders.push(col.segment(ax, az, bx, bz, 0.18, y + 1.2)); }
        break;
      }
      case 'trough': e.colliders.push(col.box(e.x, e.z, 1.25, 0.5, e.rot, y + 0.95)); break;
      case 'lamp': e.colliders.push(col.circle(e.x, e.z, 0.25, y + 3.6)); break;
      case 'bench': e.colliders.push(col.box(e.x, e.z, 1.1, 0.32, e.rot, y + 0.56)); break;
      case 'sapling': e.colliders.push(col.circle(e.x, e.z, 0.35, y + 4)); break;
      case 'statue': e.colliders.push(col.box(e.x, e.z, 0.8, 0.8, e.rot, y + 1.07)); break;
      case 'incubator': e.colliders.push(col.box(e.x, e.z, 0.8, 0.7, e.rot, y + 1.05)); break;
      case 'trainyard':
        for (const [lx, lz] of [[-2.2, -1.8], [2.2, -1.8]]) { const [x, z] = at(lx, lz); e.colliders.push(col.circle(x, z, 0.4, y + 2)); }
        break;
      case 'breeder': {
        // ring fence with a gap at the front (+z)
        for (let i = 0; i < 14; i++) {
          const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2;
          const mid = (a0 + a1) / 2;
          if (Math.abs(Math.sin(mid)) < 0.3 && Math.cos(mid) > 0) continue;
          const [ax, az] = at(Math.sin(a0) * 3.5, Math.cos(a0) * 3.5), [bx, bz] = at(Math.sin(a1) * 3.5, Math.cos(a1) * 3.5);
          e.colliders.push(col.segment(ax, az, bx, bz, 0.15, y + 1));
        }
        break;
      }
    }
    const def = BUILDINGS[e.type];
    e.interact = g.interactions.add({
      id: 'bd:' + e.id, root: group, name: def.name,
      sub: () => this.subtitle(e),
      use: (actor) => this.use(actor, e),
    });
    this.map.set(e.id, e);
    this._showFood(e);
  }

  _remove(e) {
    const g = this.game;
    g.scene.remove(e.group);
    for (const c of e.colliders) {
      c.active = false;
    }
    g.interactions.remove(e.interact);
    this.map.delete(e.id);
  }

  subtitle(e) {
    const g = this.game;
    if (e.type === 'trough') return `Food ${e.food}/${g.troughMax()}   —   E  Fill with berries`;
    if (e.type === 'incubator') {
      if (e.egg) return `Warming an egg… ${Math.min(99, Math.floor((e.hatchT || 0) / HATCH_TIME * 100))}%`;
      return (g.eggs?.length ? `E  Place your egg (${g.eggs.length} carried)` : 'Empty — bring an egg from the Breeding Pen');
    }
    if (e.type === 'breeder') return g.ranchSim ? g.ranchSim.breedStatus(e) : '';
    if (e.type === 'trainyard') return g.ranchSim ? `${g.ranchSim.trainees().length}/4 training · assign creatures in the Barn` : '';
    if (e.type === 'pen') {
      const n = g.ranchSim ? g.ranchSim.inPen(e.id) : 0;
      return `${n}/4 creatures  ·  Barn (E) to move creatures here`;
    }
    if (g.buildMode?.active) return 'X  Demolish';
    return BUILDINGS[e.type].desc;
  }

  use(actor, e) {
    if (e.type === 'incubator') { this.game.ranchSim.incubate(actor, e); return; }
    if (e.type !== 'trough') return;
    const inv = actor.inventory;
    const space = this.game.troughMax() - e.food;
    if (space <= 0) { actor.toast('The trough is already full!', 'muted'); return; }
    const berries = Math.min(space, inv.berry || 0);
    const glow = Math.min(space - berries, inv.glowberry || 0);
    if (!berries && !glow) { actor.toast('You need Sweetberries (or Glowberries) to fill the trough.', 'muted'); return; }
    inv.berry -= berries; inv.glowberry -= glow;
    e.food += berries + glow;
    this.game.inventoryChanged(actor);
    actor.toast(`Filled the trough with ${berries + glow} berries`, 'good');
    this.game.worldSound('pick', new THREE.Vector3(e.x, 0, e.z));
    this._showFood(e);
    this.game.ranchChanged();
  }

  _showFood(e) {
    if (e.type !== 'trough') return;
    const food = e.group.getObjectByName('food');
    const shown = Math.ceil((e.food / this.game.troughMax()) * 10);
    food.children.forEach((b, i) => { b.visible = i < shown; });
  }

  update(night, dt = 0) {
    lampMat.emissiveIntensity = 0.2 + night * 1.6;
    this._t = (this._t || 0) + dt;
    for (const e of this.map.values()) {
      if (e.type !== 'incubator') continue;
      const warm = e.group.getObjectByName('warm');
      if (warm) warm.material.emissiveIntensity = e.egg ? 0.6 + Math.sin(this._t * 3) * 0.3 : 0.15;
      const slot = e.group.getObjectByName('eggSlot');
      if (slot && slot.children[0]) slot.children[0].rotation.z = e.egg && (e.hatchT || 0) > HATCH_TIME * 0.7 ? Math.sin(this._t * 18) * 0.15 : 0;
    }
  }

  _showEgg(e) {
    if (e.type !== 'incubator') return;
    const slot = e.group.getObjectByName('eggSlot');
    if (!slot) return;
    const has = !!e.egg;
    if (has && !slot.children.length) slot.add(makeEggMesh(e.egg.species));
    if (!has) slot.clear();
  }

  serialize() {
    return [...this.map.values()].map((e) => ({
      id: e.id, type: e.type, x: +e.x.toFixed(2), z: +e.z.toFixed(2), rot: +e.rot.toFixed(3), food: e.food,
      egg: e.egg || null, hatchT: Math.round(e.hatchT || 0), owner: e.owner || null, breedT: Math.round(e.breedT || 0),
    }));
  }

  /** Rebuild from a list (load / guest sync). */
  apply(list) {
    const keep = new Set(list.map((b) => b.id));
    for (const e of [...this.map.values()]) if (!keep.has(e.id)) this._remove(e);
    for (const b of list) {
      let e = this.map.get(b.id);
      if (!e) { this._create({ ...b }); e = this.map.get(b.id); }
      else if (e.food !== b.food) { e.food = b.food; this._showFood(e); }
      e.hatchT = b.hatchT || 0; e.breedT = b.breedT || 0; e.owner = b.owner || null;
      const hadEgg = !!e.egg;
      e.egg = b.egg || null;
      if (hadEgg !== !!e.egg) { const slot = e.group.getObjectByName('eggSlot'); slot?.clear(); }
      this._showEgg(e);
      this.nextId = Math.max(this.nextId, b.id + 1);
    }
  }

  first(type) { return [...this.map.values()].find((e) => e.type === type) || null; }
}

/** A speckled egg tinted by the baby's type. */
export function makeEggMesh(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const col = sp ? TYPES[sp.type].color : '#ffffff';
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshLambertMaterial({ color: '#fff7e6' }));
  shell.scale.set(1, 1.3, 1);
  g.add(shell);
  const spotMat = new THREE.MeshLambertMaterial({ color: col });
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, yy = -0.2 + (i % 4) * 0.13;
    const r = Math.sqrt(Math.max(0, 1 - (yy / 0.36) ** 2)) * 0.28;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), spotMat);
    s.position.set(Math.cos(a) * r, yy, Math.sin(a) * r);
    s.scale.set(1, 1, 0.4);
    s.lookAt(0, yy, 0);
    g.add(s);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function costText(cost) {
  const icons = { coins: '🪙', wood: '🪵', stone: '🪨', flower: '🌼' };
  return Object.entries(cost).map(([k, n]) => `${icons[k] || k} ${n}`).join('  ');
}

export { PEN_HALF };
