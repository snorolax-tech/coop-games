// Host-only simulation: day/night cycle, zombie waves + AI, loot containers, ground items,
// placed structures (barricades, traps, magnets, mines), fire/gas zones, explosions.
import { analyze } from './items.js';
import { ZTYPES } from './zombies.js';
import { LAYOUT, rollLoot, collide, SPAWN_R, MAP, COLLIDERS, STORAGE, STORAGE_SIZE } from './town.js';

export const DAY_LEN = 120;
export const FIRST_DAY_LEN = 150;
const MAX_ALIVE = 45;
const ZT = Object.keys(ZTYPES);
const BOSSES = ['butcher', 'mother', 'hollow'];

/** does a line of sight between two points cross a building? (2D slab test) */
function blocked(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const c of COLLIDERS) {
    let t0 = 0, t1 = 1;
    for (const [p, d, mn, mx] of [[x1, dx, c.minX, c.maxX], [z1, dz, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (p < mn || p > mx) { t0 = 2; break; } continue; }
      let a = (mn - p) / d, b = (mx - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1) return true;
  }
  return false;
}
/** is any standing player looking at this zombie? */
function seenBy(z, players) {
  for (const p of players) {
    if (!p || p.down) continue;
    const dx = z.x - p.x, dz = z.z - p.z, d = Math.hypot(dx, dz);
    if (d > 45) continue;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if ((dx * fx + dz * fz) / (d || 1) < 0.72) continue;
    if (!blocked(p.x, p.z, z.x, z.z)) return true;
  }
  return false;
}

export function wallBox(s) {
  // walls are axis aligned (rot snapped to 90deg): long side along x when rot=0
  const half = s.w / 2, th = 0.35;
  return s.rot % 2 === 0 ? { minX: s.x - half, maxX: s.x + half, minZ: s.z - th, maxZ: s.z + th }
    : { minX: s.x - th, maxX: s.x + th, minZ: s.z - half, maxZ: s.z + half };
}

export class Director {
  constructor(nPlayers) {
    this.nPlayers = nPlayers;
    this.events = [];
    this.nextId = 1;
    this.zombies = [];
    this.pending = []; // fused bombs {x,z,t,parts,stick}
    this.looted = new Set();
    this.restart();
  }

  restart() {
    this.zombies = []; this.pending = [];
    this.looted = new Set();
    this.toSpawn = 0; this.spawnT = 0; this.grace = 2;
    this.state = {
      ph: 'day', day: 1, t: FIRST_DAY_LEN, left: 0, kills: 0,
      looted: [], ground: [], st: [], zones: [], z: [], skip: [false, false], restart: [false, false],
      blackout: false, boss: null, storage: new Array(STORAGE_SIZE).fill(null),
    };
    this.blackoutAt = -1; this.blackoutT = 0; this.bossPending = null; this.acidT = 0; this.nightT = 0;
    this.sinceScare = [60, 60]; // seconds since each player got a scare
    this.scatterGround(1);
    this.emit({ k: 'dawn', day: 1 });
  }

  emit(e) { this.events.push(e); }

  // ------------------------------------------------------------ requests from players
  loot(p, cid) {
    const c = LAYOUT.C[cid];
    if (!c || this.looted.has(cid)) return;
    this.looted.add(cid);
    const day = this.state.day;
    // everyone gets their share: if a player hasn't been scared in a while, this search is going to get them
    const owed = this.sinceScare[p] > 140 && c.type !== 'stash';
    if (owed && (c.type === 'car' || c.type === 'dumpster')) { /* handled below by the car alarm / dumpster grab */ }
    else if (c.type !== 'stash' && (owed || Math.random() < Math.min(0.2, 0.05 + day * 0.025))) {
      this.sinceScare[p] = 0;
      // SURPRISE: something was hiding in there
      const z = this._spawnAt('lurker', c.x, c.z);
      z.atk = 0.6;
      this.emit({ k: 'scare', p, x: c.x, z: c.z, kind: 'lurker' });
      this.emit({ k: 'loot', p, cid, items: [] , lurker: true });
      return;
    }
    // car alarm: the whole street hears it
    if (c.type === 'car' && (owed || Math.random() < 0.22)) {
      this.sinceScare[p] = 0;
      this.emit({ k: 'alarm', cid, x: c.x, z: c.z });
      this._zone('lure', c.x, c.z, 45, 9);
      const n = 3 + Math.min(5, day);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 12;
        const x = Math.max(-MAP - 4, Math.min(MAP + 4, c.x + Math.cos(a) * d)), zz = Math.max(-MAP - 4, Math.min(MAP + 4, c.z + Math.sin(a) * d));
        const q = this._spawnAt(day >= 2 && Math.random() < 0.4 ? 'runner' : 'walker', x, zz); collide(q, 0.5);
      }
    }
    // something in the dumpster grabs you
    if (c.type === 'dumpster' && (owed || Math.random() < 0.2)) { this.sinceScare[p] = 0; this.emit({ k: 'grab', p, cid, x: c.x, z: c.z }); }
    this.emit({ k: 'loot', p, cid, items: rollLoot(c.type, day) });
  }

  drop(item, x, z) {
    this.state.ground.push({ id: this.nextId++, item, x, z });
  }

  /** put an item into the shared base storage (slot = preferred index) */
  store(p, item, slot) {
    const st = this.state.storage;
    let i = slot != null && slot >= 0 && slot < st.length && !st[slot] ? slot : st.indexOf(null);
    if (i < 0) { this.drop(item, STORAGE.x, STORAGE.z + 1.5); this.emit({ k: 'deny', p, why: 'Storage is full, dropped it next to the locker' }); return; }
    st[i] = item;
    this.emit({ k: 'stored', p });
  }

  withdraw(p, idx, slot) {
    const st = this.state.storage;
    const item = st[idx];
    if (!item) return;
    st[idx] = null;
    this.emit({ k: 'take', p, item, slot });
  }

  moveStorage(a, b) {
    const st = this.state.storage;
    if (a < 0 || b < 0 || a >= st.length || b >= st.length) return;
    [st[a], st[b]] = [st[b], st[a]];
  }

  /** scatter some loot on the ground around town... and some of it isn't loot */
  scatterGround(day) {
    this.fakes ||= new Set();
    const pool = ['nails', 'tape', 'bottle', 'scrap', 'bandage', 'battery', 'rope', 'pills', 'pipe', 'knife', 'lighter', 'spring'];
    const spot = () => {
      for (let tries = 0; tries < 20; tries++) {
        const x = (Math.random() - 0.5) * 2 * (MAP - 6), z = (Math.random() - 0.5) * 2 * (MAP - 6);
        if (Math.hypot(x, z) < 14) continue;
        const q = { x, z };
        if (!collide(q, 1.2)) return q;
      }
      return null;
    };
    const real = 3, fake = Math.min(5, 1 + day);
    for (let i = 0; i < real + fake; i++) {
      const sp = spot(); if (!sp) continue;
      const id = this.nextId++;
      this.state.ground.push({ id, item: { uid: Math.floor(Math.random() * 1e9), parts: [pool[Math.floor(Math.random() * pool.length)]], uses: null }, x: sp.x, z: sp.z });
      if (i >= real) this.fakes.add(id);
    }
  }

  take(p, gid) {
    const g = this.state.ground;
    const i = g.findIndex((k) => k.id === gid);
    if (i < 0) return;
    if (this.fakes?.has(gid)) {
      // it was never loot: a zombie lying still, playing dead
      this.fakes.delete(gid);
      this.sinceScare[p] = 0;
      const [k] = g.splice(i, 1);
      const z = this._spawnAt('lurker', k.x, k.z);
      z.atk = 0.5;
      this.emit({ k: 'scare', p, x: k.x, z: k.z, kind: 'fake' });
      return;
    }
    const [k] = g.splice(i, 1);
    this.emit({ k: 'take', p, item: k.item });
  }

  place(p, item, x, z, rot) {
    const s = analyze(item.parts);
    if (!['wall', 'trap', 'magnet', 'mine'].includes(s.form)) return;
    const st = { id: this.nextId++, parts: item.parts, form: s.form, x, z, rot: ((rot % 4) + 4) % 4, hp: s.hp || 1, maxHp: s.hp || 1, w: s.width || 1 };
    this.state.st.push(st);
    this.emit({ k: 'place', p, form: s.form, x, z });
  }

  voteSkip(p) {
    if (this.state.ph !== 'day') return;
    this.state.skip[p] = !this.state.skip[p];
    if (this.state.skip.slice(0, this.nPlayers).every(Boolean)) this.state.t = Math.min(this.state.t, 3);
  }

  voteRestart(p) {
    if (this.state.ph !== 'over') return;
    this.state.restart[p] = true;
    if (this.state.restart.slice(0, this.nPlayers).every(Boolean)) this.restart();
  }

  /** melee / flamethrower / bullet hit on one zombie. h: {id, parts, k:'melee'|'flame'|'gun', dx, dz, mult} */
  hitZ(h, players) {
    const z = this.zombies.find((q) => q.id === h.id);
    if (!z) return;
    const s = analyze(h.parts);
    let dmg = h.k === 'flame' ? s.dps * 0.1 : (s.dmg || 8);
    dmg *= h.mult || 1;
    if (z.T.armor && !(s.P.blunt >= 3 || s.P.explosive)) dmg *= z.T.armor;
    this._applyFx(z, s.fx, h.k === 'flame');
    if (h.k !== 'flame') {
      const kb = s.fx.kb * (h.k === 'gun' ? 0.5 : 1) / (z.T.scale * z.T.scale);
      z.kx += (h.dx || 0) * kb * 2.2; z.kz += (h.dz || 0) * kb * 2.2;
      // getting hit makes them stumble: they stop walking and can't attack for a moment
      const st = (h.k === 'melee' ? 0.3 + Math.min(0.4, kb * 0.03) : 0.18) * (z.T.boss ? 0.25 : z.type === 'brute' ? 0.5 : 1);
      z.stagger = Math.max(z.stagger || 0, st);
      z.atk = Math.max(z.atk, z.stagger);
      z.hdx = h.dx || 0; z.hdz = h.dz || 0; z.hbig = dmg >= 25;
    }
    this._damage(z, dmg, players);
    if (s.fx.chain && h.k !== 'flame') this._chain(z, s.fx, dmg, players);
  }

  /** thrown item / launcher shot landed. l: {parts, x, z, hitId, k:'throw'|'gun'} */
  land(l, players) {
    const s = analyze(l.parts);
    if (l.k === 'gun') {
      if (l.hitId) this.hitZ({ id: l.hitId, parts: l.parts, k: 'gun', dx: l.dx, dz: l.dz }, players);
      if (s.radius) this.boom(l.x, l.z, s, 0.8, players);
      else if (s.fx.fire && !l.hitId) this._zone('fire', l.x, l.z, 1.5, 3);
      return;
    }
    if (s.fuse) {
      this.pending.push({ x: l.x, z: l.z, t: s.fuse, parts: l.parts, stick: s.fx.slow && l.hitId ? l.hitId : null, lure: s.fx.lure });
      if (s.fx.lure) this._zone('lure', l.x, l.z, 18, s.fuse);
      this.emit({ k: 'fuse', x: l.x, z: l.z, t: s.fuse });
      return;
    }
    this.boom(l.x, l.z, s, 1, players);
  }

  boom(x, z, s, mult, players) {
    const r = s.radius || 3;
    const big = s.P.explosive > 0;
    this.emit({ k: 'boom', x, z, r, big, fire: !!s.fx.fire, toxic: !!s.fx.poison });
    for (const q of [...this.zombies]) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d > r) continue;
      const fall = 1 - (d / r) * 0.5;
      if (s.dmg) this._damage(q, s.dmg * fall * mult, players);
      this._applyFx(q, s.fx, false);
      if (big) { const k = 10 * fall / q.T.scale; q.kx += (q.x - x) / (d || 1) * k; q.kz += (q.z - z) / (d || 1) * k; }
    }
    if (big) players.forEach((p, i) => {
      if (!p || p.down) return;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r * 0.8) this.emit({ k: 'hurt', p: i, dmg: Math.round((s.dmg || 20) * 0.18 * (1 - d / r)), x, z });
    });
    if (s.fx.fire) this._zone('fire', x, z, r * 0.6, Math.min(10, s.fx.fire * 1.2));
    if (s.fx.poison) this._zone('gas', x, z, r, 7);
    if (s.fx.shock && !big) for (const q of this.zombies) if (Math.hypot(q.x - x, q.z - z) < r) q.stun = Math.max(q.stun, s.fx.shock);
  }

  _zone(kind, x, z, r, t) { this.state.zones.push({ id: this.nextId++, kind, x, z, r, t }); }

  _applyFx(z, fx, flame) {
    if (fx.fire) z.burn = Math.max(z.burn, flame ? 3 : fx.fire);
    if (fx.shock) z.stun = Math.max(z.stun, fx.shock);
    if (fx.poison) z.poison = Math.max(z.poison, fx.poison);
    if (fx.bleed) z.bleed = Math.max(z.bleed, fx.bleed);
    if (fx.slow) z.slow = Math.max(z.slow, fx.slow);
  }

  _chain(src, fx, dmg, players) {
    const near = this.zombies.filter((q) => q !== src && Math.hypot(q.x - src.x, q.z - src.z) < 6)
      .sort((a, b) => Math.hypot(a.x - src.x, a.z - src.z) - Math.hypot(b.x - src.x, b.z - src.z)).slice(0, fx.chain);
    let prev = src;
    for (const q of near) {
      this.emit({ k: 'zap', a: [prev.x, prev.z], b: [q.x, q.z] });
      q.stun = Math.max(q.stun, fx.shock);
      this._damage(q, dmg * 0.5, players);
      prev = q;
    }
  }

  _damage(z, dmg, players) {
    if (z.hp <= 0) return;
    z.hp -= dmg;
    z.flash = true;
    if (z.hp <= 0) this._kill(z, players);
  }

  _kill(z, players) {
    this.zombies.splice(this.zombies.indexOf(z), 1);
    this.state.kills++;
    this.emit({ k: 'zdie', id: z.id, x: z.x, z: z.z, type: z.type, dx: z.hdx || 0, dz: z.hdz || 0, big: !!z.hbig });
    if (z.T.boom) this.boom(z.x, z.z, { radius: z.T.boom.radius, dmg: z.T.boom.dmg, P: { explosive: 2 }, fx: { fire: 3 } }, 1, players);
    if (Math.random() < 0.08) {
      const pool = ['nails', 'tape', 'battery', 'scrap', 'bottle', 'bandage', 'lighter', 'spring', 'wire', 'brick'];
      this.drop({ uid: Math.floor(Math.random() * 1e9), parts: [pool[Math.floor(Math.random() * pool.length)]], uses: null }, z.x, z.z);
    }
  }

  _spawnOne(type) {
    const day = this.state.day;
    if (!type) {
      const r = Math.random();
      type = 'walker';
      if (day >= 4 && r < 0.12) type = 'exploder';
      else if (day >= 3 && r < 0.24) type = 'brute';
      else if (day >= 2 && r < 0.5) type = 'runner';
    }
    const a = Math.random() * Math.PI * 2;
    return this._spawnAt(type, Math.cos(a) * SPAWN_R, Math.sin(a) * SPAWN_R);
  }

  _spawnAt(type, x, z) {
    const T = ZTYPES[type];
    const hpMult = 1 + (this.state.day - 1) * 0.1;
    const q = { id: this.nextId++, type, ti: ZT.indexOf(type), T, x, z, yaw: 0,
      hp: T.hp * hpMult, max: T.hp * hpMult, kx: 0, kz: 0, burn: 0, stun: 0, poison: 0, bleed: 0, slow: 0, atk: 0, attacking: false, flash: false,
      shrieked: false, frozen: false, ab: 4 + Math.random() * 3, ab2: 6, mode: 'chase', modeT: 0, cx: 0, cz: 0 };
    if (T.boss) q.ab = 5;
    this.zombies.push(q);
    return q;
  }

  // ------------------------------------------------------------ tick
  update(dt, players) {
    const s = this.state;
    if (s.ph === 'over') { this._snapshot(); return; }
    for (let i = 0; i < 2; i++) this.sinceScare[i] += dt;
    // game over? (short grace after a restart so everyone can respawn)
    this.grace -= dt;
    const alive = players.slice(0, this.nPlayers).filter((p) => p && !p.down);
    if (this.grace <= 0 && players.slice(0, this.nPlayers).every((p) => p) && alive.length === 0) {
      s.ph = 'over';
      this.emit({ k: 'over', day: s.day });
      this._snapshot();
      return;
    }
    if (s.ph === 'day') {
      s.t -= dt;
      if (s.t <= 0) {
        s.ph = 'night';
        s.skip = [false, false];
        this.toSpawn = 8 + (s.day - 1) * 5;
        this.stalkers = s.day >= 2 ? 1 + Math.floor((s.day - 2) / 2) : 0;
        this.bossPending = s.day % 3 === 0 ? BOSSES[(s.day / 3 - 1) % BOSSES.length] : null;
        this.bossAt = Math.floor(this.toSpawn / 2);
        s.left = this.toSpawn + this.stalkers + (this.bossPending ? 1 : 0);
        this.spawnT = 2;
        this.nightT = 0;
        this.blackoutAt = s.day >= 2 && Math.random() < 0.75 ? 15 + Math.random() * 35 : -1;
        this.emit({ k: 'night', day: s.day });
      }
    } else if (s.ph === 'night') {
      this.spawnT -= dt;
      this.nightT += dt;
      if (this.toSpawn > 0 && this.spawnT <= 0 && this.zombies.length < MAX_ALIVE) {
        const batch = Math.min(this.toSpawn, 2 + Math.floor(s.day / 2));
        for (let i = 0; i < batch; i++) this._spawnOne();
        this.toSpawn -= batch;
        this.spawnT = 2.2;
        if (this.stalkers > 0 && Math.random() < 0.35) { this._spawnOne('stalker'); this.stalkers--; }
      }
      if (this.toSpawn === 0 && this.stalkers > 0) { this._spawnOne('stalker'); this.stalkers--; }
      if (this.bossPending && this.toSpawn <= this.bossAt) {
        const b = this._spawnOne(this.bossPending);
        this.emit({ k: 'boss', type: this.bossPending, name: b.T.boss });
        this.bossPending = null;
      }
      // blackouts
      if (this.blackoutAt > 0 && this.nightT >= this.blackoutAt) { this.blackoutAt = -1; this.blackoutT = 16 + Math.random() * 8; this.emit({ k: 'blackout', on: true }); }
      const hollow = this.zombies.some((q) => q.type === 'hollow');
      if (this.blackoutT > 0) { this.blackoutT -= dt; if (this.blackoutT <= 0 && !hollow) this.emit({ k: 'blackout', on: false }); }
      const bo = this.blackoutT > 0 || hollow;
      if (bo !== s.blackout) s.blackout = bo;
      s.left = this.toSpawn + this.zombies.length + this.stalkers + (this.bossPending ? 1 : 0);
      if (s.left === 0) {
        s.blackout = false; this.blackoutT = 0;
        s.ph = 'day'; s.day++; s.t = DAY_LEN;
        for (const id of [...this.looted]) if (Math.random() < 0.35) this.looted.delete(id);
        s.zones = s.zones.filter((zn) => zn.kind !== 'lure');
        this.scatterGround(s.day);
        this.emit({ k: 'dawn', day: s.day });
      }
    }

    // fused bombs
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      b.t -= dt;
      if (b.stick) { const z = this.zombies.find((q) => q.id === b.stick); if (z) { b.x = z.x; b.z = z.z; } }
      if (b.t <= 0) { this.pending.splice(i, 1); this.boom(b.x, b.z, analyze(b.parts), 1, players); }
    }
    // zones
    for (const zn of s.zones) zn.t -= dt;
    s.zones = s.zones.filter((zn) => zn.t > 0);
    this.acidT -= dt;
    if (this.acidT <= 0) {
      this.acidT = 0.5;
      players.forEach((p, i) => { if (p && !p.down) for (const zn of s.zones) if (zn.kind === 'acid' && Math.hypot(zn.x - p.x, zn.z - p.z) < zn.r) { this.emit({ k: 'hurt', p: i, dmg: 4, x: zn.x, z: zn.z, acid: true }); break; } });
    }
    for (const a of this.spits || []) a.t -= dt;
    if (this.spits) {
      for (const a of this.spits.filter((q) => q.t <= 0)) this._zone('acid', a.x, a.z, 3.2, 7);
      this.spits = this.spits.filter((q) => q.t > 0);
    }

    this._zombies(dt, players);
    this._structures(dt, players);
    this._snapshot();
  }

  _zombies(dt, players) {
    const s = this.state;
    const walls = s.st.filter((q) => q.form === 'wall');
    const lures = [...s.zones.filter((q) => q.kind === 'lure'), ...s.st.filter((q) => q.form === 'magnet').map((m) => ({ x: m.x, z: m.z, r: analyze(m.parts).radius, magnet: true }))];
    for (const z of [...this.zombies]) {
      // status damage
      let dot = 0;
      if (z.burn > 0) { z.burn -= dt; dot += 9; if (Math.random() < dt * 0.6) { const n = this.zombies.find((q) => q !== z && q.burn <= 0 && Math.hypot(q.x - z.x, q.z - z.z) < 1.4); if (n) n.burn = 3; } }
      if (z.poison > 0) { z.poison -= dt; dot += 6; }
      if (z.bleed > 0) { z.bleed -= dt; dot += 4; }
      for (const zn of s.zones) if (Math.hypot(zn.x - z.x, zn.z - z.z) < zn.r) { if (zn.kind === 'fire') z.burn = Math.max(z.burn, 1.5); if (zn.kind === 'gas') z.poison = Math.max(z.poison, 1.5); }
      if (dot) { this._damage(z, dot * dt, players); if (z.hp <= 0) continue; }
      z.stun -= dt; z.slow -= dt; z.atk -= dt; z.stagger = (z.stagger || 0) - dt;

      // pick a target: lure > nearest standing player > wander towards town
      let tx, tz, tp = -1;
      let lure = null;
      for (const L of lures) if (Math.hypot(L.x - z.x, L.z - z.z) < L.r) { lure = L; break; }
      if (lure) { tx = lure.x; tz = lure.z; }
      else {
        let best = 1e9;
        players.forEach((p, i) => { if (!p || p.down) return; const d = Math.hypot(p.x - z.x, p.z - z.z); if (d < best) { best = d; tp = i; } });
        if (tp >= 0) { tx = players[tp].x; tz = players[tp].z; } else { tx = 0; tz = 0; }
      }
      let dx = tx - z.x, dz = tz - z.z, d = Math.hypot(dx, dz) || 1;
      z.attacking = false; z.charging = false;
      let speed = z.T.speed * (z.slow > 0 ? 0.45 : 1) * (lure?.magnet ? 1.6 : 1);
      // runners shriek when they first spot you
      if (z.type === 'runner' && !z.shrieked && tp >= 0 && d < 24) { z.shrieked = true; this.emit({ k: 'shriek', x: z.x, z: z.z }); }
      // stalkers freeze while watched
      if (z.T.stalker) { z.frozen = seenBy(z, players); if (z.frozen) speed = 0; }
      if (z.T.boss) { const r = this._boss(z, dt, players, tp, d); if (r === 'dead') continue; if (r) { dx = r.dx; dz = r.dz; d = 1; speed = r.speed; } }
      if (speed > 0 || z.mode !== 'charge') z.yaw = Math.atan2(dx, dz);
      if (z.stun > 0 || z.stagger > 0) speed = 0;
      if (tp >= 0 && z.stagger <= 0 && d < z.T.reach + 0.4 && z.mode !== 'charge' && !(z.T.stalker && z.frozen)) {
        speed = 0;
        z.attacking = true;
        if (z.atk <= 0 && z.stun <= 0) {
          z.atk = z.T.boss ? 1.4 : 1.1;
          if (z.T.boom) { z.hp = 0; this._kill(z, players); players.forEach((p, i) => { if (p && !p.down && Math.hypot(p.x - z.x, p.z - z.z) < z.T.boom.radius) this.emit({ k: 'hurt', p: i, dmg: z.T.boom.dmg, x: z.x, z: z.z }); }); continue; }
          const kb = z.T.boss ? [dx / d * 9, dz / d * 9] : null;
          this.emit({ k: 'hurt', p: tp, dmg: z.T.dmg, x: z.x, z: z.z, kb });
          if (z.T.stalker) this.emit({ k: 'scare', p: tp, x: z.x, z: z.z, kind: 'stalker' });
        }
      }
      z.x += (dx / d * speed + z.kx) * dt;
      z.z += (dz / d * speed + z.kz) * dt;
      const decay = Math.exp(-6 * dt); z.kx *= decay; z.kz *= decay;
      // separation
      for (const o of this.zombies) {
        if (o === z) continue;
        const ox = z.x - o.x, oz = z.z - o.z, od = ox * ox + oz * oz, rr = 0.75 * (z.T.scale + o.T.scale) / 2;
        if (od < rr * rr && od > 1e-5) { const k = (rr - Math.sqrt(od)) * 0.5 / Math.sqrt(od); z.x += ox * k; z.z += oz * k; }
      }
      // buildings + barricades
      if (Math.abs(z.x) < MAP + 2 && Math.abs(z.z) < MAP + 2) collide(z, 0.45 * z.T.scale);
      for (const w of walls) {
        const b = wallBox(w);
        if (collide(z, 0.45 * z.T.scale, [b])) {
          if (z.mode === 'charge') { w.hp = 0; this.emit({ k: 'whit', id: w.id, x: z.x, z: z.z }); continue; }
          z.attacking = true;
          if (z.atk <= 0 && z.stun <= 0) {
            z.atk = 1.1;
            w.hp -= z.T.dmg + (z.T.boom ? 60 : 0);
            this.emit({ k: 'whit', id: w.id, x: z.x, z: z.z });
            if (z.T.boom) { this.boom(z.x, z.z, { radius: z.T.boom.radius, dmg: z.T.boom.dmg, P: { explosive: 2 }, fx: { fire: 3 } }, 1, players); z.hp = 0; this._kill(z, players); break; }
          }
          const th = analyze(w.parts).thorns;
          if (th) this._damage(z, th * dt, players);
        }
      }
    }
    s.st = s.st.filter((w) => { if (w.hp <= 0) { this.emit({ k: 'break', x: w.x, z: w.z, form: w.form }); return false; } return true; });
  }

  _structures(dt, players) {
    const s = this.state;
    for (const st of s.st) {
      if (st.form === 'wall') continue;
      const a = analyze(st.parts);
      if (st.form === 'mine') {
        const z = this.zombies.find((q) => Math.hypot(q.x - st.x, q.z - st.z) < 1.8);
        if (z) { st.hp = 0; this.boom(st.x, st.z, a, 1, players); }
        continue;
      }
      const r = st.form === 'trap' ? a.radius : 1.6;
      let touching = 0;
      for (const z of [...this.zombies]) {
        if (Math.hypot(z.x - st.x, z.z - st.z) > r) continue;
        touching++;
        if (a.dps) this._damage(z, a.dps * dt, players);
        if (Math.random() < dt * 2) this._applyFx(z, a.fx, false);
      }
      if (touching) st.hp -= dt * Math.min(3, touching);
      st.spin = touching > 0;
    }
    s.st = s.st.filter((w) => { if (w.hp <= 0) { if (w.form !== 'mine') this.emit({ k: 'break', x: w.x, z: w.z, form: w.form }); return false; } return true; });
  }

  /** boss special moves. returns a movement override {dx,dz,speed}, 'dead', or null */
  _boss(z, dt, players, tp, d) {
    z.ab -= dt; z.ab2 -= dt; z.modeT -= dt;
    const target = tp >= 0 ? players[tp] : null;
    if (z.type === 'butcher') {
      if (z.mode === 'windup') {
        if (z.modeT <= 0) { z.mode = 'charge'; z.modeT = 1.5; this.emit({ k: 'charge', x: z.x, z: z.z }); }
        return { dx: z.cx, dz: z.cz, speed: 0 };
      }
      if (z.mode === 'charge') {
        if (z.modeT <= 0) { z.mode = 'chase'; z.ab = 6 + Math.random() * 3; return null; }
        players.forEach((p, i) => {
          if (!p || p.down || z.hitP?.[i]) return;
          if (Math.hypot(p.x - z.x, p.z - z.z) < 2.8) { (z.hitP ||= {})[i] = true; this.emit({ k: 'hurt', p: i, dmg: 30, x: z.x, z: z.z, kb: [z.cx * 22, z.cz * 22] }); }
        });
        return { dx: z.cx, dz: z.cz, speed: 16 };
      }
      if (z.ab <= 0 && target && d > 4 && d < 30) {
        z.mode = 'windup'; z.modeT = 1.2; z.hitP = {};
        z.cx = (target.x - z.x) / d; z.cz = (target.z - z.z) / d;
        z.yaw = Math.atan2(z.cx, z.cz);
        this.emit({ k: 'roar', x: z.x, z: z.z, type: 'butcher' });
        return { dx: z.cx, dz: z.cz, speed: 0 };
      }
    } else if (z.type === 'mother') {
      if (z.ab <= 0) {
        z.ab = 9;
        this.emit({ k: 'roar', x: z.x, z: z.z, type: 'mother' });
        for (let i = 0; i < 3; i++) { const a = Math.random() * Math.PI * 2; this._spawnAt('runner', z.x + Math.cos(a) * 2.5, z.z + Math.sin(a) * 2.5); }
      }
      if (z.ab2 <= 0 && target && d < 28) {
        z.ab2 = 4.5;
        (this.spits ||= []).push({ x: target.x, z: target.z, t: 0.9 });
        this.emit({ k: 'spit', a: [z.x, z.z], b: [target.x, target.z] });
      }
    } else if (z.type === 'hollow') {
      // blinks right behind you when nobody's watching
      if (z.ab <= 0 && target && !seenBy(z, players)) {
        z.ab = 6 + Math.random() * 3;
        const bx = target.x + Math.sin(target.yaw) * 5, bz = target.z + Math.cos(target.yaw) * 5;
        z.x = bx; z.z = bz; collide(z, 0.9);
        this.emit({ k: 'blink', x: z.x, z: z.z, p: tp });
      }
      if (z.ab2 <= 0 && target && d < 22) {
        z.ab2 = 11;
        this.emit({ k: 'scream', x: z.x, z: z.z });
        players.forEach((p, i) => { if (p && !p.down && Math.hypot(p.x - z.x, p.z - z.z) < 24) this.emit({ k: 'stun', p: i, t: 2.5 }); });
      }
    }
    return null;
  }

  _snapshot() {
    const s = this.state;
    const boss = this.zombies.find((q) => q.T.boss);
    s.boss = boss ? { name: boss.T.boss, hp: Math.max(0, Math.round(boss.hp / boss.max * 1000) / 10) } : null;
    s.looted = [...this.looted];
    s.z = this.zombies.map((z) => {
      const f = (z.burn > 0 ? 1 : 0) | (z.stun > 0 ? 2 : 0) | (z.poison > 0 || z.slow > 0 ? 4 : 0) | (z.attacking || z.mode === 'windup' ? 8 : 0) | (z.flash ? 16 : 0)
        | (z.frozen ? 32 : 0) | (z.mode === 'charge' ? 64 : 0) | (z.stagger > 0 ? 128 : 0);
      z.flash = false;
      return [z.id, z.ti, Math.round(z.x * 100) / 100, Math.round(z.z * 100) / 100, Math.round(z.yaw * 100) / 100, Math.round(z.hp / z.max * 100), f];
    });
  }
}
