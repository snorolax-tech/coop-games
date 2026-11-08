// Ranch life: befriended creatures living on the ranch. They wander (inside their pen if
// they have one), nap, eat from troughs, play together and come say hi. Care (feeding,
// petting, brushing, clean pens, decorations) raises happiness; happy creatures produce
// resources. Host simulates; the guest mirrors snapshots.
import * as THREE from 'three';
import { SPECIES_BY_ID, SPECIES } from '../data/creatures.js';
import { TYPES, PERSONALITIES } from '../data/types.js';
import { ITEMS } from '../data/items.js';
import { PRODUCE, PEN_CAPACITY, RANCH_BASE_CAPACITY } from '../data/buildings.js';
import { HUB_R } from '../world/zones.js';
import { Colliders } from '../world/colliders.js';
import { angDiff } from '../core/noise.js';
import { buildCreatureModel } from '../creatures/model.js';
import { Emote } from '../creatures/emote.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MOODS = [[80, 'Overjoyed'], [60, 'Happy'], [40, 'Content'], [20, 'Glum'], [0, 'Miserable']];
export const moodName = (h) => MOODS.find(([t]) => h >= t)[1];

function ensureNeeds(inst) {
  if (inst.hunger === undefined) inst.hunger = 80;
  if (inst.happiness === undefined) inst.happiness = 70;
}

class RanchCreature {
  constructor(sim, rid, inst) {
    this.sim = sim;
    this.rid = rid;
    this.inst = inst;
    this.sp = SPECIES_BY_ID[inst.species];
    this.view = buildCreatureModel(this.sp, { shiny: inst.shiny });
    this.root = this.view.root;
    this.emote = new Emote(this.root, this.view.height);
    sim.game.scene.add(this.root);
    const p = sim.randomHubSpot();
    this.pos = new THREE.Vector3(p.x, sim.game.world.groundY(p.x, p.z), p.z);
    this.netTarget = this.pos.clone();
    this.yaw = Math.random() * 6.28;
    this.target = this.pos.clone();
    this.state = 'idle'; this.stateT = 1 + Math.random() * 3;
    this.speed = 0;
    this.sleeping = false;
    this.excited = 0;
    this.penId = null;
    this.prodT = 60 + Math.random() * 60;
    this.messT = 100 + Math.random() * 100;
    this.moodT = 5 + Math.random() * 10;
    this.greetCd = 0; this.petCd = 0; this.brushCd = 0; this.feedCd = 0;
    this.root.position.copy(this.pos);
    ensureNeeds(inst);
    const t = TYPES[this.sp.type];
    this.interact = sim.game.interactions.add({
      id: 'rc:' + rid, root: this.root, range: 30, useRange: 3.5, color: t.color, holdable: true,
      name: `${this.sp.name}${inst.shiny ? ' ✨' : ''}  Lv ${inst.level}`,
      sub: () => {
        const h = Math.round(this.inst.happiness), f = Math.round(this.inst.hunger);
        const bits = [`${h >= 60 ? '♥' : h < 35 ? '☁' : '•'} ${moodName(h)} ${h}`, `🍒 Fed ${f}%`];
        if (this.sleeping) bits.push('Zz');
        const close = sim.game.interactions.hitDist <= 3.5;
        return bits.join('  ·  ') + (close ? '   —   Tap E: feed  ·  Hold E: pet  ·  Brush (3)' : '');
      },
      use: (actor, mode) => this.care(actor, mode),
      hit: (actor, tool) => this.tool(actor, tool),
    });
  }

  get game() { return this.sim.game; }

  dispose() {
    this.game.scene.remove(this.root);
    this.game.interactions.remove(this.interact);
  }

  say(sym, d = 1.5) { this.emote.show(sym, d); this.game.worldEvent({ t: 'remote', id: this.rid, s: sym, d }); }
  cry(mood) { this.game.worldSound(`cry_${Math.round(900 / Math.sqrt(this.sp.model.size || 1))}_${mood}`, this.pos); }
  happy(n) { this.inst.happiness = clamp(this.inst.happiness + n, 0, 100); this.sim.dirtyRating = true; }

  // ----- care (host) -----
  care(actor, mode) {
    const inst = this.inst;
    if (this.sleeping && mode !== 'pet') { this.sleeping = false; this.say('?', 1); }
    if (mode === 'pet') {
      this.sleeping = false;
      if (this.petCd > 0) { actor.toast(`${this.sp.name} is still basking in the last pets ♥`, 'muted'); return; }
      this.petCd = 25; this.happy(7); this.excited = 2;
      this.say('♥', 1.8); this.cry('happy');
      this.game.worldFx('sparkle', this.root.position.clone().add(new THREE.Vector3(0, this.view.height, 0)), 0xff8fb8);
      actor.toast(`You pet ${this.sp.name}. It loves you! (+7 ♥)`, 'good');
      return;
    }
    // tap E: feed (treat if holding one, otherwise berries)
    if (inst.hunger >= 95) { actor.toast(`${this.sp.name} is full!`, 'muted'); return; }
    const inv = actor.inventory;
    const holdingTreat = actor.held?.() === 'treat';
    let what = null;
    if (holdingTreat && inv.treat > 0) { inv.treat--; inst.hunger = clamp(inst.hunger + 50, 0, 100); this.happy(6); what = 'a Tasty Treat'; }
    else if (inv.berry > 0) { inv.berry--; inst.hunger = clamp(inst.hunger + 25, 0, 100); this.happy(2); what = 'a Sweetberry'; }
    else if (inv.glowberry > 0) { inv.glowberry--; inst.hunger = clamp(inst.hunger + 35, 0, 100); this.happy(4); what = 'a Glowberry'; }
    else if (inv.treat > 0) { inv.treat--; inst.hunger = clamp(inst.hunger + 50, 0, 100); this.happy(6); what = 'a Tasty Treat'; }
    if (!what) { actor.toast('You have nothing to feed it — gather berries or fill a trough.', 'muted'); return; }
    this.game.inventoryChanged(actor);
    this.say('♥', 1.2); this.cry('happy'); this.excited = 1;
    actor.toast(`You fed ${this.sp.name} ${what}. Yum!`, 'good');
  }

  tool(actor, tool) {
    if (tool === 'brush') {
      if (this.brushCd > 0) { actor.toast(`${this.sp.name}'s coat is already shiny!`, 'muted'); return; }
      this.brushCd = 30; this.happy(6); this.sleeping = false;
      this.say('♪', 1.4); this.cry('happy');
      this.game.worldFx('sparkle', this.root.position.clone().add(new THREE.Vector3(0, this.view.height * 0.6, 0)), 0xffffff);
      actor.toast(`Brushed ${this.sp.name} — so fluffy! (+6 ♥)`, 'good');
    } else if (tool === 'can') {
      if (this.sp.type === 'flame') { this.happy(-3); this.say('💢', 1.2); this.cry('angry'); actor.toast(`${this.sp.name} hates getting wet! (-3 ♥)`, 'bad'); }
      else if (this.sp.type === 'splash' || this.sp.type === 'leaf') { this.happy(4); this.say('♥', 1.2); this.cry('happy'); actor.toast(`${this.sp.name} loves the splash! (+4 ♥)`, 'good'); }
      else { this.say('?', 1); actor.toast(`${this.sp.name} shakes off the water.`, 'muted'); }
    }
  }

  // ----- behaviour (host) -----
  think(dt, night) {
    const s = this.sim, inst = this.inst, g = this.game;
    this.petCd -= dt; this.brushCd -= dt; this.greetCd -= dt;
    this.excited = Math.max(0, this.excited - dt);
    this.stateT -= dt;
    this.speed = 0;
    inst.hunger = clamp(inst.hunger - dt / 12, 0, 100);

    // mood drift every few seconds
    this.moodT -= dt;
    if (this.moodT <= 0) {
      this.moodT = 10;
      let d = 0;
      if (inst.hunger > 50) d += 0.6; else if (inst.hunger < 20) d -= 2;
      if (this.penId != null) d += s.messCount(this.penId) >= 2 ? -1.5 : 0.5; else d -= 0.2;
      d += Math.min(1.2, g.buildings.decorCount() * 0.15);
      if (this.sp.type === 'splash' && g.buildings.ponds().length) d += 0.5;
      this.happy(d);
      if (inst.happiness >= 80 && Math.random() < 0.3) this.say('♥', 1.4);
      else if (inst.happiness < 35 && Math.random() < 0.5) this.say('☁', 2);
      else if (inst.hunger < 25 && Math.random() < 0.5) this.say('🍒', 1.8);
    }

    // produce resources when happy
    if (inst.happiness >= 60 && inst.hunger > 25 && !this.sleeping) {
      this.prodT -= dt;
      if (this.prodT <= 0) { this.prodT = 90 + Math.random() * 60; s.produce(this); }
    }
    // pens get messy
    if (this.penId != null) {
      this.messT -= dt;
      if (this.messT <= 0) { this.messT = 140 + Math.random() * 100; s.spawnMess(this); }
    }

    const walk = 1.0 + this.sp.base.spd / 80;
    const nearest = s.nearestPlayer(this.pos);
    switch (this.state) {
      case 'idle':
        if (this.stateT > 0) break;
        if ((night && Math.random() < 0.7) || (this.inst.personality === 'lazy' && Math.random() < 0.3)) { this.sleeping = true; this.setState('sleep', 20 + Math.random() * 30); break; }
        if (inst.hunger < 60) { const t = s.troughWithFood(this); if (t) { this.trough = t; this.setState('eat', 20); break; } }
        if (Math.random() < 0.25) { const mate = s.playmate(this); if (mate) { this.mate = mate; mate.mate = this; mate.setState('play', 8); this.setState('play', 8); break; } }
        this.target.copy(s.wanderPoint(this));
        this.setState('wander', 12);
        break;
      case 'sleep':
        if (Math.random() < dt * 0.12) this.say('Zz', 2);
        if (this.stateT <= 0 && !(night && Math.random() < 0.8)) { this.sleeping = false; this.setState('idle', 1); }
        else if (this.stateT <= 0) this.stateT = 15;
        break;
      case 'wander':
        if (this.pos.distanceTo(this.target) < 0.8 || this.stateT <= 0 || !this.moveTo(this.target, walk * 0.6, dt)) this.setState('idle', 2 + Math.random() * 5);
        break;
      case 'eat': {
        const t = this.trough;
        if (!t || !g.buildings.map.has(t.id) || t.food <= 0 || this.stateT <= 0) { this.setState('idle', 1); break; }
        const p = new THREE.Vector3(t.x, 0, t.z);
        if (this.pos.distanceTo(p) > 2) this.moveTo(p, walk, dt);
        else {
          t.food--; inst.hunger = clamp(inst.hunger + 40, 0, 100); this.happy(2);
          g.buildings._showFood(t); g.ranchChanged();
          this.say('♥', 1.2); this.cry('happy');
          this.setState('idle', 3);
        }
        break;
      }
      case 'play': {
        const m = this.mate;
        if (!m || m.state !== 'play' || this.stateT <= 0) { this.mate = null; this.setState('idle', 2); break; }
        // chase each other in little circles
        const a = performance.now() / 600 + (this.rid % 2) * Math.PI;
        const c = m.pos.clone().add(this.pos).multiplyScalar(0.5);
        this.moveTo(new THREE.Vector3(c.x + Math.cos(a) * 2.2, 0, c.z + Math.sin(a) * 2.2), walk * 1.4, dt);
        this.excited = 1;
        if (Math.random() < dt * 0.4) this.say('♪', 1);
        break;
      }
      case 'greet': {
        if (!nearest || nearest.d > 14 || this.stateT <= 0) { this.setState('idle', 2); break; }
        if (nearest.d > 2.6) this.moveTo(nearest.pos, walk * 1.3, dt);
        else { this.face(nearest.pos, dt); this.excited = 0.8; }
        break;
      }
    }
    // come say hi when a rancher walks up
    if (nearest && nearest.d < 9 && this.greetCd <= 0 && !this.sleeping && (this.state === 'idle' || this.state === 'wander')) {
      const p = this.inst.personality;
      const friendly = p === 'playful' || inst.happiness >= 70 || (p !== 'shy' && inst.happiness >= 50);
      this.greetCd = 25;
      if (friendly) { this.setState('greet', 6); this.say(inst.happiness >= 70 ? '♥' : '!', 1.2); this.cry('curious'); }
      else if (p === 'shy') this.say('…', 1.2);
    }
    this.pos.y = g.world.groundY(this.pos.x, this.pos.z);
  }

  setState(s, t) { this.state = s; this.stateT = t; }

  face(p, dt) {
    const d = angDiff(Math.atan2(p.x - this.pos.x, p.z - this.pos.z), this.yaw);
    this.yaw += d * Math.min(1, dt * 6);
  }

  moveTo(p, speed, dt) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const want = Math.atan2(dx, dz);
    const d = angDiff(want, this.yaw);
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), 6 * dt);
    const step = speed * Math.max(0, Math.cos(d)) * dt;
    const nx = this.pos.x + Math.sin(this.yaw) * step, nz = this.pos.z + Math.cos(this.yaw) * step;
    if (Math.hypot(nx, nz) > HUB_R - 3) return false;
    this.pos.x = nx; this.pos.z = nz;
    const r = this.view.radius * 0.8;
    for (const c of this.game.world.colliders.query(nx, nz, r + 1, this.sim._q)) {
      if (this.pos.y > c.top - 0.3) continue;
      const pen = Colliders.penetration(c, this.pos.x, this.pos.z, r);
      if (pen) { this.pos.x += pen.nx * pen.depth; this.pos.z += pen.nz * pen.depth; }
    }
    this.speed = step / dt;
    return true;
  }

  updateView(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.view.update(dt, { speed: this.speed, sleeping: this.sleeping, excited: Math.min(1, this.excited) });
    this.emote.update(dt);
  }
}

export class RanchSim {
  constructor(game) {
    this.game = game;
    this.creatures = new Map(); // rid -> RanchCreature
    this.byUid = new Map();     // uid -> rid
    this.nextRid = 1;
    this.drops = [];            // { id, item, n, x, y, z }
    this.messes = [];           // { id, penId, x, z }
    this.dropViews = new Map();
    this.messViews = new Map();
    this.nextObj = 1;
    this.authority = true;
    this._q = [];
  }

  get capacity() { return RANCH_BASE_CAPACITY + PEN_CAPACITY * this.game.buildings.pens().length; }

  randomHubSpot() {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * (HUB_R - 20);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (this.game.world.isFree(x, z, 1.5)) return { x, z };
    }
    return { x: 8, z: 8 };
  }

  wanderPoint(c) {
    if (c.penId != null) {
      const pen = this.game.buildings.map.get(c.penId);
      if (pen) return this.game.buildings.penPoint(pen, Math.random() * 2 - 1, Math.random() * 2 - 1);
    }
    const p = this.randomHubSpot();
    return new THREE.Vector3(p.x, 0, p.z);
  }

  inPen(penId) { let n = 0; for (const c of this.creatures.values()) if (c.penId === penId) n++; return n; }
  messCount(penId) { return this.messes.filter((m) => m.penId === penId).length; }

  troughWithFood(c) {
    let best = null, bd = 40;
    for (const t of this.game.buildings.troughs()) {
      if (t.food <= 0) continue;
      const d = Math.hypot(t.x - c.pos.x, t.z - c.pos.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  playmate(c) {
    for (const o of this.creatures.values()) {
      if (o === c || o.sleeping || o.state !== 'idle' && o.state !== 'wander') continue;
      if (o.pos.distanceTo(c.pos) < 8) return o;
    }
    return null;
  }

  nearestPlayer(pos) {
    const g = this.game;
    const list = [g.player.pos];
    if (g.remote) list.push(g.remote.target);
    let best = null;
    for (const p of list) { const d = Math.hypot(p.x - pos.x, p.z - pos.z); if (!best || d < best.d) best = { pos: p, d }; }
    return best;
  }

  /** Host: keep one RanchCreature per ranch inst (up to capacity); others rest in the barn. */
  syncCreatures() {
    const g = this.game;
    const visible = g.ranch.slice(0, this.capacity);
    const want = new Set(visible.map((i) => i.uid));
    for (const [uid, rid] of this.byUid) {
      if (want.has(uid)) continue;
      this.creatures.get(rid)?.dispose();
      this.creatures.delete(rid);
      this.byUid.delete(uid);
    }
    for (const inst of visible) {
      ensureNeeds(inst);
      if (this.byUid.has(inst.uid)) continue;
      const rid = this.nextRid++;
      const c = new RanchCreature(this, rid, inst);
      this.creatures.set(rid, c);
      this.byUid.set(inst.uid, rid);
      g.fx.sparkle(c.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff, 10);
    }
    // pen assignment: fill pens in order
    const pens = g.buildings.pens();
    let i = 0;
    for (const c of this.creatures.values()) {
      const pen = pens[Math.floor(i / PEN_CAPACITY)];
      const before = c.penId;
      c.penId = pen ? pen.id : null;
      if (pen && before !== pen.id) {
        // hop straight into the new pen (they can't path through the fence)
        const p = g.buildings.penPoint(pen, Math.random() - 0.5, Math.random() - 0.5);
        c.pos.set(p.x, g.world.groundY(p.x, p.z), p.z);
        c.target.copy(c.pos);
        c.setState('idle', 1);
        g.worldFx('sparkle', c.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffffff);
      }
      i++;
    }
  }

  produce(c) {
    const p = PRODUCE[c.sp.type];
    if (!p || this.drops.length >= 16) return;
    const a = Math.random() * 6.28;
    const x = c.pos.x + Math.cos(a) * 1.2, z = c.pos.z + Math.sin(a) * 1.2;
    this.drops.push({ id: this.nextObj++, item: p.item, n: p.n, x, y: this.game.world.groundY(x, z), z });
    c.say('♪', 1.4);
    this.game.worldFx('sparkle', new THREE.Vector3(x, c.pos.y + 0.6, z), 0xffe066);
    this.game.ranchChanged();
  }

  spawnMess(c) {
    if (this.messCount(c.penId) >= 3) return;
    const pen = this.game.buildings.map.get(c.penId);
    if (!pen) return;
    const p = this.game.buildings.penPoint(pen, Math.random() * 1.6 - 0.8, Math.random() * 1.6 - 0.8);
    this.messes.push({ id: this.nextObj++, penId: c.penId, x: p.x, z: p.z });
    this.game.ranchChanged();
  }

  // ----- drops & messes (meshes on both clients) -----
  _applyObjects() {
    const g = this.game;
    const sync = (list, views, make) => {
      const keep = new Set(list.map((o) => o.id));
      for (const [id, v] of views) if (!keep.has(id)) { g.scene.remove(v.root); g.interactions.remove(v.def); views.delete(id); }
      for (const o of list) if (!views.has(o.id)) views.set(o.id, make(o));
    };
    sync(this.drops, this.dropViews, (o) => {
      const it = ITEMS[o.item];
      const root = new THREE.Group();
      const col = { berry: '#e63946', battery: '#ffd60a', water: '#4cc9f0', ember: '#ff7b2e', stone: '#a2a2ad', feather: '#ffffff' }[o.item] || '#ffffff';
      const box = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 }));
      box.position.y = 0.5; root.add(box);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 18), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; root.add(ring);
      root.position.set(o.x, o.y, o.z);
      g.scene.add(root);
      const def = g.interactions.add({ id: 'dp:' + o.id, root, name: `${it.icon} ${it.name} ×${o.n}`, sub: 'E  Collect', range: 4,
        use: (actor) => this.collect(actor, o.id) });
      return { root, def, gem: box };
    });
    sync(this.messes, this.messViews, (o) => {
      const root = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: '#7a5230', flatShading: true });
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 - i * 0.05, 8, 6), mat); m.position.set(0, 0.12 + i * 0.13, 0); root.add(m); }
      root.position.set(o.x, g.world.groundY(o.x, o.z), o.z);
      g.scene.add(root);
      const def = g.interactions.add({ id: 'ms:' + o.id, root, name: '💩 Mess', sub: 'Clean with the Brush (3) or Watering Can (4)', range: 4,
        hit: (actor, tool) => this.clean(actor, o.id, tool) });
      return { root, def };
    });
  }

  collect(actor, id) {
    const i = this.drops.findIndex((d) => d.id === id);
    if (i < 0) return;
    const d = this.drops[i];
    this.drops.splice(i, 1);
    actor.give(d.item, d.n);
    this.game.ranchChanged();
  }

  clean(actor, id, tool) {
    if (tool !== 'brush' && tool !== 'can') { actor.toast('Use the Brush (3) or Watering Can (4) to clean this up.', 'muted'); return; }
    const i = this.messes.findIndex((m) => m.id === id);
    if (i < 0) return;
    const m = this.messes[i];
    this.messes.splice(i, 1);
    for (const c of this.creatures.values()) if (c.penId === m.penId) c.happy(2);
    this.game.worldFx('puff', new THREE.Vector3(m.x, this.game.world.groundY(m.x, m.z) + 0.3, m.z), 0x9fe3ff);
    actor.toast('Squeaky clean! The pen creatures are happier.', 'good');
    this.game.ranchChanged();
  }

  // ----- loop -----
  update(dt) {
    const g = this.game;
    const night = g.world.sky.night > 0.5;
    if (this.authority) {
      for (const c of this.creatures.values()) c.think(dt, night);
      if (this.dirtyRating) { this._ratingT = (this._ratingT || 0) + dt; if (this._ratingT > 5) { this._ratingT = 0; this.dirtyRating = false; g.updateRating(); } }
    } else {
      for (const c of this.creatures.values()) {
        const before = c.pos.clone();
        c.pos.lerp(c.netTarget, 1 - Math.exp(-10 * dt));
        c.yaw += angDiff(c.netYaw ?? c.yaw, c.yaw) * Math.min(1, dt * 10);
        c.speed = before.distanceTo(c.pos) / Math.max(dt, 1e-4);
      }
    }
    for (const c of this.creatures.values()) c.updateView(dt);
    const t = performance.now() / 1000;
    for (const v of this.dropViews.values()) { v.gem.rotation.y = t * 2; v.gem.position.y = 0.5 + Math.sin(t * 3) * 0.08; }
  }

  happyCount() { let n = 0; for (const inst of this.game.ranch) if ((inst.happiness ?? 70) >= 70) n++; return n; }

  // ----- networking -----
  snapshot() {
    const out = [];
    for (const c of this.creatures.values()) {
      out.push([c.rid, c.sp.num, c.inst.shiny ? 1 : 0, +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), +c.pos.z.toFixed(2), +c.yaw.toFixed(2),
        c.sleeping ? 1 : 0, Math.round(c.inst.happiness), Math.round(c.inst.hunger), Math.round(c.excited * 10), c.inst.level]);
    }
    return out;
  }

  applySnapshot(arr) {
    const seen = new Set();
    for (const [rid, num, shiny, x, y, z, yaw, sleep, hap, hun, exc, lvl] of arr) {
      seen.add(rid);
      let c = this.creatures.get(rid);
      if (!c) {
        const sp = SPECIES[num - 1];
        c = new RanchCreature(this, rid, { species: sp.id, shiny: !!shiny, level: lvl, happiness: hap, hunger: hun, personality: sp.personality });
        c.pos.set(x, y, z);
        this.creatures.set(rid, c);
      }
      c.netTarget.set(x, y, z); c.netYaw = yaw;
      c.sleeping = !!sleep; c.inst.happiness = hap; c.inst.hunger = hun; c.excited = exc / 10;
    }
    for (const [rid, c] of this.creatures) if (!seen.has(rid)) { c.dispose(); this.creatures.delete(rid); }
  }

  showEmote(rid, s, d) { this.creatures.get(rid)?.emote.show(s, d); }

  state() { return { d: this.drops, m: this.messes }; }
  applyState(s) { this.drops = s.d || []; this.messes = s.m || []; this._applyObjects(); }

  clear() {
    for (const c of this.creatures.values()) c.dispose();
    this.creatures.clear(); this.byUid.clear();
    this.drops = []; this.messes = [];
    this._applyObjects();
  }
}

export { PERSONALITIES };
