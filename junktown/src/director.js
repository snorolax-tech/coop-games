// Host-only simulation: day/night cycle, zombie waves + AI, loot containers, ground items,
// placed structures (barricades, traps, magnets, mines), fire/gas zones, explosions.
import { analyze } from './items.js';
import { ZTYPES } from './zombies.js';
import { LAYOUT, rollLoot, collide, SPAWN_R, MAP } from './town.js';

export const DAY_LEN = 120;
export const FIRST_DAY_LEN = 150;
const MAX_ALIVE = 45;
const ZT = Object.keys(ZTYPES);

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
    };
    this.emit({ k: 'dawn', day: 1 });
  }

  emit(e) { this.events.push(e); }

  // ------------------------------------------------------------ requests from players
  loot(p, cid) {
    const c = LAYOUT.C[cid];
    if (!c || this.looted.has(cid)) return;
    this.looted.add(cid);
    this.emit({ k: 'loot', p, cid, items: rollLoot(c.type) });
  }

  drop(item, x, z) {
    this.state.ground.push({ id: this.nextId++, item, x, z });
  }

  take(p, gid) {
    const g = this.state.ground;
    const i = g.findIndex((k) => k.id === gid);
    if (i < 0) return;
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
    this.emit({ k: 'zdie', id: z.id, x: z.x, z: z.z, type: z.type });
    if (z.T.boom) this.boom(z.x, z.z, { radius: z.T.boom.radius, dmg: z.T.boom.dmg, P: { explosive: 2 }, fx: { fire: 3 } }, 1, players);
    if (Math.random() < 0.12) {
      const pool = ['nails', 'tape', 'battery', 'scrap', 'bottle', 'bandage', 'lighter', 'spring', 'wire', 'brick'];
      this.drop({ uid: Math.floor(Math.random() * 1e9), parts: [pool[Math.floor(Math.random() * pool.length)]], uses: null }, z.x, z.z);
    }
  }

  _spawnOne() {
    const day = this.state.day;
    const r = Math.random();
    let type = 'walker';
    if (day >= 4 && r < 0.12) type = 'exploder';
    else if (day >= 3 && r < 0.24) type = 'brute';
    else if (day >= 2 && r < 0.5) type = 'runner';
    const T = ZTYPES[type];
    const a = Math.random() * Math.PI * 2;
    const hpMult = 1 + (day - 1) * 0.12;
    this.zombies.push({ id: this.nextId++, type, ti: ZT.indexOf(type), T, x: Math.cos(a) * SPAWN_R, z: Math.sin(a) * SPAWN_R, yaw: 0,
      hp: T.hp * hpMult, max: T.hp * hpMult, kx: 0, kz: 0, burn: 0, stun: 0, poison: 0, bleed: 0, slow: 0, atk: 0, attacking: false, flash: false,
      wander: a + Math.PI });
  }

  // ------------------------------------------------------------ tick
  update(dt, players) {
    const s = this.state;
    if (s.ph === 'over') { this._snapshot(); return; }
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
        this.toSpawn = 8 + (s.day - 1) * 6;
        s.left = this.toSpawn;
        this.spawnT = 2;
        this.emit({ k: 'night', day: s.day });
      }
    } else if (s.ph === 'night') {
      this.spawnT -= dt;
      if (this.toSpawn > 0 && this.spawnT <= 0 && this.zombies.length < MAX_ALIVE) {
        const batch = Math.min(this.toSpawn, 2 + Math.floor(s.day / 2));
        for (let i = 0; i < batch; i++) this._spawnOne();
        this.toSpawn -= batch;
        this.spawnT = 2.2;
      }
      s.left = this.toSpawn + this.zombies.length;
      if (s.left === 0) {
        s.ph = 'day'; s.day++; s.t = DAY_LEN;
        for (const id of [...this.looted]) if (Math.random() < 0.6) this.looted.delete(id);
        s.zones = s.zones.filter((zn) => zn.kind !== 'lure');
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
      z.stun -= dt; z.slow -= dt; z.atk -= dt;

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
      const dx = tx - z.x, dz = tz - z.z, d = Math.hypot(dx, dz) || 1;
      z.yaw = Math.atan2(dx, dz);
      z.attacking = false;
      let speed = z.T.speed * (z.slow > 0 ? 0.45 : 1) * (lure?.magnet ? 1.6 : 1);
      if (z.stun > 0) speed = 0;
      if (tp >= 0 && d < z.T.reach + 0.4) {
        speed = 0;
        z.attacking = true;
        if (z.atk <= 0 && z.stun <= 0) {
          z.atk = 1.1;
          if (z.T.boom) { z.hp = 0; this._kill(z, players); players.forEach((p, i) => { if (p && !p.down && Math.hypot(p.x - z.x, p.z - z.z) < z.T.boom.radius) this.emit({ k: 'hurt', p: i, dmg: z.T.boom.dmg, x: z.x, z: z.z }); }); continue; }
          this.emit({ k: 'hurt', p: tp, dmg: z.T.dmg, x: z.x, z: z.z });
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

  _snapshot() {
    const s = this.state;
    s.looted = [...this.looted];
    s.z = this.zombies.map((z) => {
      const f = (z.burn > 0 ? 1 : 0) | (z.stun > 0 ? 2 : 0) | (z.poison > 0 || z.slow > 0 ? 4 : 0) | (z.attacking ? 8 : 0) | (z.flash ? 16 : 0);
      z.flash = false;
      return [z.id, z.ti, Math.round(z.x * 100) / 100, Math.round(z.z * 100) / 100, Math.round(z.yaw * 100) / 100, Math.round(z.hp / z.max * 100), f];
    });
  }
}
