// Wild creatures: spawning per zone (time-of-day aware), roaming AI driven by personality,
// reactions to players, treats and thrown orbs. The host simulates; the guest mirrors
// compact snapshots and renders the same models.
//
// Personalities: shy -> runs away, playful -> curious, follows you, grumpy -> charges,
// lazy -> barely notices you and naps a lot.
import * as THREE from 'three';
import { SPECIES, SPECIES_BY_ID, ZONE_LEVELS } from '../data/creatures.js';
import { TYPES, PERSONALITIES, RARITY } from '../data/types.js';
import { WILD_ZONES, ZONE_R, WORLD_R } from '../world/zones.js';
import { WATER_Y } from '../world/terrain.js';
import { Colliders } from '../world/colliders.js';
import { rng, angDiff } from '../core/noise.js';
import { buildCreatureModel } from './model.js';
import { createCreature, PERSONALITY_IDS } from './instance.js';
import { Emote } from './emote.js';

const SLOTS_PER_ZONE = 16;
const SPAWN_DIST = 125;
const DESPAWN_DIST = 170;
const VIEW_DIST = 115;
const DETECT = { shy: 15, playful: 12, grumpy: 11, lazy: 6 };
const _v = new THREE.Vector3();

function cryName(sp, mood) {
  const pitch = Math.round(900 / Math.sqrt(sp.model.size || 1));
  return `cry_${pitch}_${mood}`;
}

/** One creature in the world (used on both host and guest). */
class WildCreature {
  constructor(mgr, nid, inst, x, z, zone) {
    this.mgr = mgr;
    this.nid = nid;
    this.inst = inst;
    this.sp = SPECIES_BY_ID[inst.species];
    this.zone = zone;
    this.pos = new THREE.Vector3(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'idle';
    this.stateT = 1 + Math.random() * 3;
    this.cooldown = 0;   // ignore players for a while
    this.calmT = 0;      // fed a treat recently
    this.excited = 0;
    this.sleeping = false;
    this.target = new THREE.Vector3(x, 0, z);
    this.focus = null;   // observer we're reacting to
    this.swims = this.sp.type === 'splash';

    const view = buildCreatureModel(this.sp, { shiny: inst.shiny });
    this.view = view;
    this.root = view.root;
    this.flies = view.hover > 0;
    this.emote = new Emote(this.root, view.height);
    this.center = new THREE.Vector3();
    mgr.game.scene.add(this.root);
    this._placeY();
    this.root.position.copy(this.pos);
    this.netTarget = this.pos.clone();

    const t = TYPES[this.sp.type];
    const pers = PERSONALITIES[inst.personality];
    this.interact = mgr.game.interactions.add({
      id: 'cr:' + nid,
      speciesId: this.sp.id,
      root: this.root,
      name: `${this.sp.name}${inst.shiny ? ' ✨' : ''}  Lv ${inst.level}`,
      color: t.color,
      range: 40,
      useRange: 3.5,
      sub: () => {
        const bits = [`${t.icon} ${t.name}`, `${pers.icon} ${pers.name}`];
        if (this.sp.rarity !== 'common') bits.push('★'.repeat(RARITY[this.sp.rarity].stars) + ' ' + RARITY[this.sp.rarity].name);
        if (this.battleId || this.inBattle) bits.push(`⚔️ ${this.inst.hp}/${this.inst.stats.hp} HP`);
        else if (this.sleeping) bits.push('Zz Sleeping');
        else if (this.calmT > 0 || this.calm) bits.push('♥ Calm');
        const g = mgr.game;
        if (g.items.current.kind === 'partner' && !this.battleId) return bits.join('  ·  ') + '   —   Click: send out partner';
        return bits.join('  ·  ') + (g.interactions.hitDist <= 3.5 ? '   —   E  Pet' : '');
      },
      use: (actor) => this.pet(actor),
    });

    if (mgr.authority) {
      this.target3 = { pos: this.center, radius: view.radius * 0.9, onHit: (p) => this.onProjectileHit(p) };
      mgr.game.projectiles.targets.push(this.target3);
    }
  }

  get radius() { return this.view.radius; }

  _placeY() {
    const w = this.mgr.game.world;
    let y = w.groundY(this.pos.x, this.pos.z);
    if (y < WATER_Y) y = this.flies ? WATER_Y : WATER_Y - 0.25 * this.view.size;
    this.pos.y = y;
  }

  dispose() {
    const g = this.mgr.game;
    g.scene.remove(this.root);
    g.interactions.remove(this.interact);
    if (this.target3) {
      const i = g.projectiles.targets.indexOf(this.target3);
      if (i >= 0) g.projectiles.targets.splice(i, 1);
    }
  }

  // ---------- host-side behaviour ----------

  say(sym, dur) {
    this.emote.show(sym, dur);
    this.mgr.game.worldEvent({ t: 'emote', id: this.nid, s: sym, d: dur });
  }

  cry(mood) { this.mgr.game.worldSound(cryName(this.sp, mood), this.pos); }

  setState(s, t = 0) { this.state = s; this.stateT = t; }

  detectRadius(obs) {
    let r = DETECT[this.inst.personality] * (this.view.size > 1.4 ? 1.2 : 1);
    if (obs.speed > 7) r *= 1.6; else if (obs.speed < 0.5) r *= 0.5; else if (obs.speed < 4) r *= 0.8;
    // sneaking up from behind is much harder to notice
    _v.set(obs.pos.x - this.pos.x, 0, obs.pos.z - this.pos.z).normalize();
    const fwd = Math.sin(this.yaw) * _v.x + Math.cos(this.yaw) * _v.z;
    if (fwd < -0.2) r *= 0.5;
    if (this.sleeping) r *= 0.4;
    return r;
  }

  /** React to an observer by personality. */
  react(obs) {
    this.focus = obs;
    if (this.sleeping) { this.sleeping = false; }
    this.setState('alert', 0.6);
    this.say(this.inst.personality === 'playful' ? '?' : this.inst.personality === 'lazy' ? '…' : '!', 1.2);
    this.cry(this.inst.personality === 'grumpy' ? 'angry' : this.inst.personality === 'shy' ? 'alarm' : 'curious');
  }

  _afterAlert() {
    switch (this.inst.personality) {
      case 'shy': this.setState('flee', 6); break;
      case 'grumpy': this.setState('charge', 6); break;
      case 'playful': this.setState('follow', 12 + Math.random() * 8); break;
      default: this.setState('watch', 5); break;
    }
  }

  pet(actor) {
    if (this.battleId || this.captured || this.fainted) return;
    const obs = this.mgr.observerFor(actor);
    if (this.sleeping) {
      this.sleeping = false;
      this.say('?', 1);
      actor.toast(`${this.sp.name} woke up!`, 'muted');
      if (this.calmT <= 0 && this.inst.personality !== 'lazy') { this.focus = obs; this.setState('alert', 0.5); }
      return;
    }
    if (this.calmT > 0 || this.inst.personality === 'playful') {
      this.say('♥', 1.6);
      this.cry('happy');
      this.excited = 1.5;
      this.mgr.game.worldFx('sparkle', this.center.clone(), 0xff8fb8);
      actor.toast(`${this.sp.name} loves the attention!`, 'good');
      return;
    }
    switch (this.inst.personality) {
      case 'shy': this.focus = obs; this.say('!', 1); this.cry('alarm'); this.setState('flee', 6); actor.toast(`${this.sp.name} is too shy and runs off!`, 'muted'); break;
      case 'grumpy': this.focus = obs; this.say('💢', 1.2); this.cry('angry'); this.setState('charge', 5); actor.toast(`${this.sp.name} does NOT want pets!`, 'bad'); break;
      default: this.say('Zz', 1.4); actor.toast(`${this.sp.name} yawns and ignores you.`, 'muted'); break;
    }
  }

  onProjectileHit(p) {
    if (this.captured || this.fainted) return 'bounce';
    if (p.kind === 'treat') {
      if (this.battleId) return 'bounce';
      // snatched out of the air!
      this.eat(null, p.owner);
      return 'consume';
    }
    return this.mgr.game.catching.attempt(this, p);
  }

  /** Go eat a treat lying on the ground (p) or eat one caught in the air (null). by = who threw it. */
  eat(p, by) {
    if (by) this.calmBy = by;
    if (p) { this.treat = p; this.calmBy = p.owner; this.sleeping = false; this.setState('eat', 12); this.say('?', 1); return; }
    this.sleeping = false;
    this.calmT = 30;
    this.cooldown = 0;
    this.excited = 2;
    this.say('♥', 2);
    this.cry('happy');
    this.mgr.game.worldFx('sparkle', this.center.clone(), 0xffd6e8);
    this.setState('idle', 3);
  }

  _move(dx, dz, speed, dt) {
    const g = this.mgr.game;
    const w = g.world;
    const want = Math.atan2(dx, dz);
    const d = angDiff(want, this.yaw);
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), 7 * dt);
    const align = Math.max(0, Math.cos(d));
    const step = speed * align * dt;
    const nx = this.pos.x + Math.sin(this.yaw) * step;
    const nz = this.pos.z + Math.cos(this.yaw) * step;
    // stay in our zone, out of the hub and inside the world
    const r = Math.hypot(nx, nz);
    if (w.zoneAt(nx, nz) !== this.zone || r < ZONE_R + 3 || r > WORLD_R - 10) { this.speed = 0; return false; }
    if (!this.swims && !this.flies && w.groundY(nx, nz) < WATER_Y + 0.15) { this.speed = 0; return false; }
    this.pos.x = nx; this.pos.z = nz;
    // push out of trees / rocks
    const list = w.colliders.query(this.pos.x, this.pos.z, this.radius + 1, this.mgr._q);
    for (const c of list) {
      if (this.pos.y > c.top - 0.3) continue;
      const pen = Colliders.penetration(c, this.pos.x, this.pos.z, this.radius * 0.8);
      if (pen) { this.pos.x += pen.nx * pen.depth; this.pos.z += pen.nz * pen.depth; }
    }
    this.speed = step / dt;
    return true;
  }

  _pickWander() {
    const w = this.mgr.game.world;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 16;
      const x = this.home.x + Math.sin(a) * r, z = this.home.z + Math.cos(a) * r;
      if (w.zoneAt(x, z) !== this.zone || Math.hypot(x, z) < ZONE_R + 5) continue;
      if (!this.swims && !this.flies && w.groundY(x, z) < WATER_Y + 0.3) continue;
      this.target.set(x, 0, z);
      return true;
    }
    this.target.copy(this.home);
    return false;
  }

  think(dt, observers, night) {
    this.cooldown -= dt;
    this.calmT -= dt;
    this.excited = Math.max(0, this.excited - dt);
    this.stateT -= dt;
    this.speed = 0;
    const walk = 1.2 + this.sp.base.spd / 60;

    if (this.captured) return;
    if (this.fainted) {
      this.fadeT -= dt;
      if (this.fadeT <= 0) this.mgr.remove(this, true);
      return;
    }
    if (this.battleId) { this.excited = 0.3; this._placeY(); return; }

    // notice players
    const near = this.mgr.nearestObserver(this.pos);
    const calmState = this.state === 'wander' || this.state === 'idle' || this.state === 'sleep';
    if (near && calmState && this.cooldown <= 0 && this.calmT <= 0 && near.dist < this.detectRadius(near.obs)) {
      this.react(near.obs);
    }

    const toFocus = () => {
      const f = this.focus?.pos || near?.obs.pos;
      return f ? { dx: f.x - this.pos.x, dz: f.z - this.pos.z, d: Math.hypot(f.x - this.pos.x, f.z - this.pos.z) } : null;
    };

    switch (this.state) {
      case 'idle':
        if (this.stateT <= 0) {
          const sleepy = (night && this.sp.time !== 'night' ? 0.55 : 0) + (this.inst.personality === 'lazy' ? 0.25 : 0.05);
          if (Math.random() < sleepy) { this.sleeping = true; this.setState('sleep', 15 + Math.random() * 25); }
          else { this._pickWander(); this.setState('wander', 12); }
        }
        break;
      case 'sleep':
        if (Math.random() < dt * 0.15) this.emote.sprite.visible || this.say('Zz', 2);
        if (this.stateT <= 0 && !(night && this.sp.time === 'day' && Math.random() < 0.7)) { this.sleeping = false; this.setState('idle', 2); }
        else if (this.stateT <= 0) this.stateT = 20;
        break;
      case 'wander': {
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1 || this.stateT <= 0 || !this._move(dx, dz, walk * 0.6, dt)) this.setState('idle', 2 + Math.random() * 5);
        break;
      }
      case 'alert': {
        const f = toFocus();
        if (f) { const d = angDiff(Math.atan2(f.dx, f.dz), this.yaw); this.yaw += d * Math.min(1, dt * 8); }
        this.excited = 0.3;
        if (this.stateT <= 0) this._afterAlert();
        break;
      }
      case 'flee': {
        const f = toFocus();
        if (!f || (f.d > 30 && this.stateT <= 0)) { this.cooldown = 6; this.focus = null; this.setState('idle', 2); break; }
        const run = Math.max(walk * 2.4, 7);
        if (!this._move(-f.dx + Math.sin(this.stateT * 2) * f.d * 0.4, -f.dz + Math.cos(this.stateT * 2) * f.d * 0.4, run, dt)) {
          // cornered: dash sideways
          this._move(-f.dz, f.dx, run * 0.9, dt);
        }
        if (this.stateT <= 0) this.stateT = 1;
        break;
      }
      case 'charge': {
        const f = toFocus();
        if (!f || this.stateT <= 0 || f.d > 35) { this.cooldown = 5; this.focus = null; this.setState('idle', 2); break; }
        this._move(f.dx, f.dz, walk * 2.6, dt);
        if (f.d < this.radius + 0.9) {
          this.mgr.bump(this.focus || near.obs, f.dx / (f.d || 1), f.dz / (f.d || 1), 7 + this.view.size * 3);
          this.say('💢', 1);
          this.cry('angry');
          this.cooldown = 7;
          this.retreatFrom = this.focus;
          this.setState('retreat', 1.8);
        }
        break;
      }
      case 'retreat': {
        const f = toFocus();
        if (f) this._move(-f.dx, -f.dz, walk * 1.2, dt);
        if (this.stateT <= 0) { this.focus = null; this.setState('idle', 2); }
        break;
      }
      case 'follow': {
        const f = toFocus();
        if (!f || this.stateT <= 0 || f.d > 30) { this.cooldown = 15; this.focus = null; this.setState('idle', 2); break; }
        if (f.d > 3) this._move(f.dx, f.dz, walk * (f.d > 8 ? 1.6 : 1), dt);
        else {
          const d = angDiff(Math.atan2(f.dx, f.dz), this.yaw); this.yaw += d * Math.min(1, dt * 5);
          this.excited = 0.6;
          if (Math.random() < dt * 0.25) this.say(Math.random() < 0.5 ? '♪' : '♥', 1.2);
        }
        break;
      }
      case 'watch': {
        const f = toFocus();
        if (f) { const d = angDiff(Math.atan2(f.dx, f.dz), this.yaw); this.yaw += d * Math.min(1, dt * 3); }
        if (this.stateT <= 0 || !f || f.d > 15) { this.cooldown = 8; this.focus = null; this.setState('idle', 2); }
        break;
      }
      case 'eat': {
        const p = this.treat;
        const alive = p && this.mgr.game.projectiles.list.includes(p);
        if (!alive || this.stateT <= 0) { this.treat = null; this.setState('idle', 1); break; }
        const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < this.radius + 0.5) {
          this.mgr.game.projectiles.remove(p);
          this.treat = null;
          this.eat(null);
        } else if (!this._move(dx, dz, walk * 1.3, dt)) { this.treat = null; this.setState('idle', 1); }
        break;
      }
    }
    this._placeY();
  }

  // ---------- shared ----------

  updateView(dt, camPos) {
    const dist = camPos.distanceTo(this.pos);
    this.root.visible = dist < VIEW_DIST && !this.captured;
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, this.fainted ? 1.3 : 0);
    if (this.fainted) this.root.position.y -= 0.15;
    this.center.set(this.pos.x, this.pos.y + this.view.height * 0.5, this.pos.z);
    if (!this.root.visible) return;
    this.view.update(dt, { speed: this.speed, sleeping: this.sleeping || this.fainted, excited: this.excited > 0 ? Math.min(1, this.excited) : 0 });
    this.emote.update(dt);
  }
}

export class WildCreatures {
  constructor(game) {
    this.game = game;
    this.list = new Map();
    this.slots = [];
    this.nextId = 1;
    this._q = [];
    this.authority = true;
    this._buildSlots();
  }

  _buildSlots() {
    const rand = rng(4242);
    for (const zone of WILD_ZONES) {
      for (let i = 0; i < SLOTS_PER_ZONE; i++) {
        const p = this.game.world.randomSpot(zone, rand, { clear: 0.5, maxR: 285, water: zone === 'lakeside' && i % 3 === 0 ? 'shore' : 'avoid' });
        if (p) this.slots.push({ zone, x: p.x, z: p.z, creature: null, cool: rand() * 5 });
      }
    }
  }

  /** Everyone who can be noticed: the local player and the remote player (host only). */
  observers() {
    const g = this.game;
    const out = [{ id: 'local', actor: g.local, pos: g.player.pos, speed: Math.hypot(g.player.vel.x, g.player.vel.z) }];
    if (g.remote && g.guestActor) out.push({ id: 'guest', actor: g.guestActor, pos: g.remote.target, speed: g.remote.speed || 0 });
    return out;
  }

  observerFor(actor) {
    return this._obs?.find((o) => o.actor === actor) || this._obs?.[0];
  }

  nearestObserver(pos) {
    let best = null;
    for (const o of this._obs || []) {
      const d = Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z);
      if (!best || d < best.dist) best = { obs: o, dist: d };
    }
    return best;
  }

  bump(obs, dx, dz, strength) {
    if (!obs) return;
    if (obs.id === 'local') this.game.knockback(dx, dz, strength);
    else this.game.net.send({ t: 'knock', d: [dx, dz], s: strength });
  }

  _pickSpecies(zone, night) {
    const cands = SPECIES.filter((s) => s.habitat.includes(zone) && (s.time !== 'night' || night));
    let total = 0;
    for (const s of cands) total += RARITY[s.rarity].weight;
    let r = Math.random() * total;
    for (const s of cands) { r -= RARITY[s.rarity].weight; if (r <= 0) return s; }
    return cands[0];
  }

  _spawn(slot, night) {
    const sp = this._pickSpecies(slot.zone, night);
    if (!sp) return;
    const [lo, hi] = ZONE_LEVELS[slot.zone];
    let level = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (sp.rarity === 'rare') level += 3;
    const inst = createCreature(sp.id, level);
    const c = new WildCreature(this, this.nextId++, inst, slot.x, slot.z, slot.zone);
    c.slot = slot;
    if (night && sp.time !== 'night' && Math.random() < 0.6) { c.sleeping = true; c.setState('sleep', 20 + Math.random() * 20); }
    slot.creature = c;
    this.list.set(c.nid, c);
  }

  _despawn(c) {
    c.dispose();
    this.list.delete(c.nid);
    if (c.slot) { c.slot.creature = null; c.slot.cool = 20 + Math.random() * 20; }
  }

  /** Remove a creature for good (caught, or fainted and wandered off). */
  remove(c, puff = false) {
    if (puff) this.game.worldFx('puff', c.center.clone(), 0xffffff);
    this._despawn(c);
  }

  /** Host: a creature fainted in battle — it lies down, then wanders off. */
  faint(c) {
    c.fainted = true;
    c.fadeT = 3;
    c.sleeping = false;
    c.say('…', 2.5);
  }

  clear() {
    for (const c of [...this.list.values()]) this._despawn(c);
    for (const s of this.slots) s.cool = 0;
  }

  /** Host: a treat came to rest — the nearest interested creature trots over. */
  onTreatRest(p) {
    let best = null, bd = 14;
    for (const c of this.list.values()) {
      if (c.state === 'eat' || c.state === 'charge') continue;
      const d = c.pos.distanceTo(p.pos);
      if (d < bd) { bd = d; best = c; }
    }
    best?.eat(p);
  }

  update(dt) {
    const g = this.game;
    const night = g.world.sky.night > 0.5;
    if (this.authority) {
      this._obs = this.observers();
      // spawn / despawn around players
      for (const s of this.slots) {
        let d = Infinity;
        for (const o of this._obs) d = Math.min(d, Math.hypot(o.pos.x - s.x, o.pos.z - s.z));
        if (!s.creature) {
          s.cool -= dt;
          if (s.cool <= 0 && d < SPAWN_DIST && d > 25) this._spawn(s, night);
        } else {
          const c = s.creature;
          const cd = this.nearestObserver(c.pos)?.dist ?? Infinity;
          const wrongTime = c.sp.time === 'night' && !night && cd > 50;
          if (c.battleId || c.captured || c.fainted) continue;
          if ((cd > DESPAWN_DIST && c.state !== 'flee') || wrongTime) this._despawn(c);
        }
      }
      for (const c of this.list.values()) c.think(dt, this._obs, night);
    } else {
      // guest: smooth toward the host's positions
      for (const c of this.list.values()) {
        const k = 1 - Math.exp(-12 * dt);
        const before = c.pos.clone();
        c.pos.lerp(c.netTarget, k);
        let d = angDiff(c.netYaw ?? c.yaw, c.yaw);
        c.yaw += d * k;
        c.speed = c.netSpeed ?? before.distanceTo(c.pos) / Math.max(dt, 1e-4);
      }
    }
    const cam = g.camera.position;
    for (const c of this.list.values()) c.updateView(dt, cam);

    // the local player can't walk through creatures
    const p = g.player.pos;
    for (const c of this.list.values()) {
      if (c.flies || c.view.size < 0.75) continue;
      const dx = p.x - c.pos.x, dz = p.z - c.pos.z, d = Math.hypot(dx, dz), min = c.radius * 0.9 + 0.4;
      if (d < min && d > 1e-3 && Math.abs(p.y - c.pos.y) < c.view.height) { p.x += (dx / d) * (min - d); p.z += (dz / d) * (min - d); }
    }
  }

  // ---------- networking ----------

  snapshot() {
    const out = [];
    for (const c of this.list.values()) {
      const flags = (c.inst.shiny ? 1 : 0) | (c.sleeping ? 2 : 0) | (c.fainted ? 4 : 0) | (c.captured ? 8 : 0) | (c.battleId ? 16 : 0) | (c.calmT > 0 ? 32 : 0);
      out.push([c.nid, c.sp.num, c.inst.level, flags, PERSONALITY_IDS.indexOf(c.inst.personality),
        Math.round(c.pos.x * 100) / 100, Math.round(c.pos.y * 100) / 100, Math.round(c.pos.z * 100) / 100,
        Math.round(c.yaw * 100) / 100, Math.round(c.speed * 10), Math.round(c.excited * 10), c.inst.hp]);
    }
    return out;
  }

  applySnapshot(arr) {
    const seen = new Set();
    for (const [nid, num, level, flags, pers, x, y, z, yaw, spd, exc, hp] of arr) {
      seen.add(nid);
      let c = this.list.get(nid);
      if (!c) {
        const sp = SPECIES[num - 1];
        const inst = createCreature(sp.id, level, { shiny: !!(flags & 1), personality: PERSONALITY_IDS[pers] });
        c = new WildCreature(this, nid, inst, x, z, null);
        c.pos.set(x, y, z); c.yaw = yaw;
        this.list.set(nid, c);
      }
      c.netTarget.set(x, y, z);
      if (c.pos.distanceTo(c.netTarget) > 12) c.pos.copy(c.netTarget);
      c.netYaw = yaw;
      c.netSpeed = spd / 10;
      c.sleeping = !!(flags & 2);
      c.fainted = !!(flags & 4);
      c.captured = !!(flags & 8);
      c.inBattle = !!(flags & 16);
      c.calm = !!(flags & 32);
      if (hp !== undefined) c.inst.hp = hp;
      c.excited = exc / 10;
    }
    for (const [nid, c] of this.list) if (!seen.has(nid)) { c.dispose(); this.list.delete(nid); }
  }

  showEmote(nid, sym, dur) { this.list.get(nid)?.emote.show(sym, dur); }
}
