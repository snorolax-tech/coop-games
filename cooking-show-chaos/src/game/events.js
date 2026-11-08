// Chaos director: random escalating kitchen disasters. Host only.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BURNERS, DOOR_POS, PUDDLE_CENTER, ROOM, SINK_POS } from './kitchen.js';

export const EVENTS = {
  fire:    { title: '🔥 GREASE FIRE! 🔥', sub: 'Grab the extinguisher and hold E!', w: 1 },
  flood:   { title: '💦 THE SINK IS POSSESSED 💦', sub: 'Slippery floor! Press E on the sink to stop it', w: 1 },
  quake:   { title: '🌋 KITCHEN EARTHQUAKE 🌋', sub: 'Hold onto your plates!', w: 1 },
  mixer:   { title: '🌀 THE MIXER HAS ESCAPED 🌀', sub: 'Press E on it to unplug it', w: 1 },
  lights:  { title: '💡 WHO TURNED OFF THE LIGHTS? 💡', sub: 'Cook by stove-light!', w: 0.8 },
  chicken: { title: '🐔 A ROGUE CHICKEN APPEARS 🐔', sub: "It's stealing ingredients! Click it to catch it", w: 1 },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const MIXER_SPOTS = [[-4.8, -4.6], [0.5, -4.6], [4.0, -4.6], [0, 0.6], [6.6, -1.2]];

export class ChaosDirector {
  constructor(game) {
    this.game = game;
    this.nextT = 28;
    this.last = null;
    this.chicken = null;
    this.mixers = new Set();
    this.quakeTick = 0;
    this.gustT = 10;
    this.count = 0;
  }
  get progress() { const st = this.game.state; return 1 - st.time / st.duration; }

  tick(dt) {
    const g = this.game, st = g.state;
    this.nextT -= dt;
    if (this.nextT <= 0 && st.time > 8) {
      this.trigger();
      if (this.progress > 0.6 && Math.random() < 0.35) setTimeout(() => g.running && this.trigger(), 2500);
      this.nextT = rnd(30, 60) * (1 - 0.4 * this.progress);
    }

    // --- Flood ---
    const fl = st.flood;
    if (fl.on) {
      fl.r = Math.min(3.3, fl.r + dt * 0.35); fl.t += dt;
      if (fl.t > 28) this.stopFlood(null);
    } else if (fl.r > 0) fl.r = Math.max(0, fl.r - dt * 0.12);

    // --- Quake ---
    if (st.quake > 0) {
      st.quake -= dt; this.quakeTick -= dt;
      if (this.quakeTick <= 0) {
        this.quakeTick = 0.18;
        for (const it of g.items.values()) {
          if (!it.body || it.holder !== -1) continue;
          const m = it.body.mass;
          it.body.wakeUp();
          it.body.applyImpulse(new CANNON.Vec3(rnd(-1, 1) * m * 1.2, rnd(0.5, 1.8) * m, rnd(-1, 1) * m * 1.2));
        }
      }
    }
    if (st.dark > 0) st.dark = Math.max(0, st.dark - dt);

    // --- Mixers ---
    for (const it of [...this.mixers]) {
      if (!g.items.has(it.id)) { this.mixers.delete(it); continue; }
      if (!it.s.on) continue;
      it.mixT = (it.mixT || 0) + dt; it.hopT = (it.hopT || 0.4) - dt;
      if (it.hopT <= 0 && it.body && it.holder === -1) {
        it.hopT = rnd(0.35, 0.8);
        const m = it.body.mass;
        it.body.wakeUp();
        it.body.applyImpulse(new CANNON.Vec3(rnd(-1, 1) * m * 2.2, m * rnd(3, 4.5), rnd(-1, 1) * m * 2.2));
        it.body.angularVelocity.set(rnd(-6, 6), rnd(-10, 10), rnd(-6, 6));
        const p = it.body.position;
        g.fx('sfx', { n: 'mixer', p: [p.x, p.y, p.z] });
        g.fx('burst', { k: 'dust', p: [p.x, p.y, p.z], n: 4, s: 1 });
        // body-slam any chef standing too close
        for (const pl of g.players) {
          if (!pl) continue;
          const dx = pl.pos[0] - p.x, dz = pl.pos[2] - p.z;
          if (Math.hypot(dx, dz) < 0.9 && Math.abs(pl.pos[1] + 0.6 - p.y) < 1.4) { g.knockCause = 'mixer'; g.knockDown(pl.id, { x: dx, z: dz }, 6.5, `The mixer body-slammed ${pl.name}`, 55, 18); g.knockCause = null; }
        }
        // knock nearby items
        for (const o of g.items.values()) {
          if (o === it || !o.body || o.holder !== -1) continue;
          const d = o.body.position.distanceTo(p);
          if (d < 0.7) { o.body.wakeUp(); o.body.applyImpulse(new CANNON.Vec3(rnd(-1, 1), 1.5, rnd(-1, 1)).scale(o.body.mass * 2)); }
        }
      }
      if (it.mixT > 22) { it.s.on = 0; it.touch(); }
    }

    // --- Chicken ---
    if (this.chicken) this.tickChicken(dt);

    // --- Set-specific weather ---
    if (st.set === 'bbq') {
      this.gustT -= dt;
      const gust = this.gustT < 0 && this.gustT > -2.5;
      if (this.gustT < -2.5) {
        this.gustT = rnd(10, 18);
        st.windDir = Math.random() * Math.PI * 2;
      }
      if (this.gustT < 0 && this.gustT + dt >= 0) { g.fx('toast', { text: '💨 WIND GUST!', kind: 'bad' }); g.fx('sfx', { n: 'whoosh' }); }
      st.gust = gust ? 1 : 0;
      const f = gust ? 7 : 0.6;
      for (const it of g.items.values()) {
        if (!it.body || it.holder !== -1 || it.body.mass > 2) continue;
        if (gust) it.body.wakeUp();
        it.body.applyForce(new CANNON.Vec3(Math.cos(st.windDir) * f * it.body.mass, 0, Math.sin(st.windDir) * f * it.body.mass));
      }
    }
  }

  trigger(kind) {
    const g = this.game, st = g.state;
    if (!kind) {
      const options = Object.entries(EVENTS).filter(([k]) => {
        if (k === this.last) return false;
        if (k === 'chicken' && this.chicken) return false;
        if (k === 'flood' && (st.flood.on || st.flood.r > 0.5)) return false;
        if (k === 'lights' && st.dark > 0) return false;
        if (k === 'fire' && st.fires.length >= 2) return false;
        return true;
      });
      let total = options.reduce((a, [k, e]) => a + e.w * (k === 'fire' && st.set === 'bbq' ? 2 : 1), 0);
      let r = Math.random() * total;
      for (const [k, e] of options) { r -= e.w * (k === 'fire' && st.set === 'bbq' ? 2 : 1); if (r <= 0) { kind = k; break; } }
      kind = kind || options[0][0];
    }
    this.last = kind; this.count++;
    const ev = EVENTS[kind];
    g.fx('banner', { title: ev.title, sub: ev.sub });
    g.fx('sfx', { n: 'alarm' });
    st.eventsSeen = (st.eventsSeen || 0) + 1;

    switch (kind) {
      case 'fire': {
        const free = BURNERS.map((_, i) => i).filter((i) => !g.cooking.fireAt(i));
        if (free.length) g.cooking.startFire(free[(Math.random() * free.length) | 0], 0.45, 'event');
        break;
      }
      case 'flood':
        st.flood.on = 1; st.flood.t = 0; st.flood.r = Math.max(st.flood.r, 0.4);
        g.moment('flood', PUDDLE_CENTER, 40, 'The sink exploded');
        break;
      case 'quake':
        st.quake = 4.5;
        g.fx('sfx', { n: 'rumble' });
        g.moment('quake', null, 60, 'KITCHEN EARTHQUAKE');
        for (const p of g.players) {
          if (p && Math.random() < 0.6) setTimeout(() => g.running && g.knockDown(p.id, { x: rnd(-1, 1), z: rnd(-1, 1) }, rnd(3, 5), `The earthquake flattened ${p.name}`, 35), rnd(300, 1800));
        }
        break;
      case 'mixer': {
        const [x, z] = MIXER_SPOTS[(Math.random() * MIXER_SPOTS.length) | 0];
        const it = g.spawnItem('mixer', new THREE.Vector3(x, 1.3, z), { on: 1 });
        this.mixers.add(it);
        g.moment('mixer', it.body.position, 45, 'The mixer came alive');
        break;
      }
      case 'lights':
        st.dark = 10;
        g.moment('lights', null, 25, 'Lights out!');
        break;
      case 'chicken':
        this.chicken = { x: DOOR_POS.x, y: 0, z: DOOR_POS.z, yaw: 0, state: 'hunt', carry: [], t: 0, fleeT: 0, target: null, stealCd: 0 };
        g.fx('sfx', { n: 'squawk' });
        g.moment('chicken', new THREE.Vector3(DOOR_POS.x, 0.4, DOOR_POS.z), 45, 'A chicken broke in');
        break;
    }
  }

  stopFlood(pl) {
    const st = this.game.state;
    if (!st.flood.on) return false;
    st.flood.on = 0;
    this.game.fx('sfx', { n: 'knob', p: [SINK_POS.x, SINK_POS.y, SINK_POS.z] });
    if (pl) this.game.moment('fixed', SINK_POS, 20, `${pl.name} fixed the sink`);
    return true;
  }

  // ---------- Chicken AI ----------
  tickChicken(dt) {
    const g = this.game, c = this.chicken;
    c.t += dt; c.stealCd -= dt; c.caughtCd = (c.caughtCd || 0) - dt;
    let speed = 2.6, tx, tz;
    if (c.state === 'flee') {
      c.fleeT -= dt; speed = 5;
      // pick a flee spot away from the nearest chef; if that's into a wall/corner, pick a random open spot instead
      if (!c.fleeTarget || Math.hypot(c.fleeTarget[0] - c.x, c.fleeTarget[1] - c.z) < 0.5) {
        const pl = this.nearestPlayer(c);
        let fx = c.x, fz = c.z;
        if (pl) { const dx = c.x - pl.pos[0], dz = c.z - pl.pos[2], d = Math.hypot(dx, dz) || 1; fx += dx / d * 3.5; fz += dz / d * 3.5; }
        fx = Math.max(ROOM.minX + 0.5, Math.min(ROOM.maxX - 0.5, fx)); fz = Math.max(ROOM.minZ + 0.5, Math.min(ROOM.maxZ - 0.5, fz));
        if (Math.hypot(fx - c.x, fz - c.z) < 1.5) { fx = rnd(ROOM.minX + 1, ROOM.maxX - 1); fz = rnd(ROOM.minZ + 1, ROOM.maxZ - 1); }
        c.fleeTarget = [fx, fz];
      }
      tx = c.fleeTarget[0]; tz = c.fleeTarget[1];
      if (c.fleeT <= 0) { c.state = c.carry.length >= 3 || c.t > 26 ? 'leave' : 'hunt'; c.fleeTarget = null; }
    } else if (c.state === 'leave') {
      speed = 3.4; tx = DOOR_POS.x; tz = DOOR_POS.z;
      if (Math.hypot(c.x - tx, c.z - tz) < 0.4) {
        if (c.carry.length) g.fx('toast', { text: `🐔 The chicken escaped with ${c.carry.length} ingredient${c.carry.length > 1 ? 's' : ''}!`, kind: 'bad' });
        else g.fx('toast', { text: '🐔 The chicken left empty-handed', kind: 'good' });
        g.fx('sfx', { n: 'squawk' });
        this.chicken = null; return;
      }
    } else {
      // hunt the nearest loose food
      let best = null, bd = 1e9;
      for (const it of g.items.values()) {
        if (!it.def.food || it.holder !== -1 || !it.body) continue;
        const p = it.body.position; const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) {
        tx = best.body.position.x; tz = best.body.position.z;
        if (bd < 0.45 && c.stealCd <= 0) {
          c.carry.push(best.type); c.stealCd = 1.2;
          g.destroyItem(best);
          g.fx('sfx', { n: 'squawk', p: [c.x, c.y, c.z] });
          g.fx('burst', { k: 'feather', p: [c.x, c.y + 0.4, c.z], n: 8, s: 1.5 });
          g.moment('chicken', new THREE.Vector3(c.x, c.y + 0.3, c.z), 35, 'The chicken stole food');
        }
      } else { tx = c.x + Math.sin(c.t * 0.7) * 3; tz = c.z + Math.cos(c.t * 0.5) * 3; }
      if (c.carry.length >= 3 || c.t > 26) c.state = 'leave';
    }
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const wob = Math.sin(c.t * 9) * 0.6;
      const ang = Math.atan2(dx, dz) + wob * 0.4;
      c.x += Math.sin(ang) * speed * dt; c.z += Math.cos(ang) * speed * dt;
      c.yaw = Math.atan2(-Math.sin(ang), -Math.cos(ang));
    }
    if (c.state !== 'leave') {
      c.x = Math.max(ROOM.minX, Math.min(ROOM.maxX, c.x));
      c.z = Math.max(ROOM.minZ, Math.min(ROOM.maxZ, c.z));
    }
    const gh = g.kitchen.groundHeightAt(c.x, c.z);
    c.y += (gh - c.y) * Math.min(1, dt * 10);
    // thrown items hitting the chicken
    for (const it of g.items.values()) {
      if (!it.body || it.thrownBy < 0 || g.time - it.thrownAt > 2) continue;
      const p = it.body.position;
      if (Math.hypot(p.x - c.x, p.z - c.z) < 0.45 && Math.abs(p.y - (c.y + 0.3)) < 0.5) {
        const by = it.thrownBy; it.thrownBy = -1; this.catchChicken(g.players[by] || null, true); break;
      }
    }
  }
  nearestPlayer(c) {
    let best = null, bd = 1e9;
    for (const p of this.game.players) { if (!p) continue; const d = Math.hypot(p.pos[0] - c.x, p.pos[2] - c.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  scareChicken() {
    const c = this.chicken; if (!c || c.state === 'flee' || c.state === 'leave') return;
    c.state = 'flee'; c.fleeT = 2; c.fleeTarget = null;
    this.game.fx('sfx', { n: 'squawk', p: [c.x, c.y, c.z] });
  }
  catchChicken(pl, thrown = false) {
    const g = this.game, c = this.chicken; if (!c) return;
    if (c.caughtCd > 0) return; // it's still wriggling free — no spam-clicking for infinite views
    c.caughtCd = 3; c.catches = (c.catches || 0) + 1;
    const n = c.carry.length;
    for (const t of c.carry) {
      const it = g.spawnItem(t, new THREE.Vector3(c.x, c.y + 0.6, c.z));
      it.body.velocity.set(rnd(-2, 2), 3.5, rnd(-2, 2));
    }
    c.carry = []; c.state = c.catches >= 2 ? 'leave' : 'flee'; c.fleeT = 2.5; c.fleeTarget = null;
    g.fx('sfx', { n: 'squawk', p: [c.x, c.y, c.z] });
    g.fx('burst', { k: 'feather', p: [c.x, c.y + 0.4, c.z], n: 20, s: 2.5 });
    const who = pl ? pl.name : 'Someone';
    g.moment('chicken_caught', new THREE.Vector3(c.x, c.y + 0.3, c.z), thrown ? 70 : 50, thrown ? `${who} sniped the chicken` : `${who} tackled the chicken${n ? ` (+${n} back)` : ''}`);
  }
  chickenState() {
    const c = this.chicken; if (!c) return null;
    return { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), yaw: +c.yaw.toFixed(2), carry: c.carry, f: c.state === 'flee' ? 1 : 0 };
  }
}
