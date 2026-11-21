// Moves one mech and runs its weapons. Used for the local player and for the practice bot.
// Each client simulates its own mech (feels instant) and reports hits to the host.
import * as THREE from 'three';
import { PARTS, slotId, computeStats, partsSig } from './parts.js';
import { ARENA_R, WALL_H } from './world.js';
import { sfx } from './audio.js';

const GRAV = 30;
const RADIUS = 1.25;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Pilot {
  /**
   * hooks: {
   *   hit(h)                    report a hit on the opponent {dmg, partMult, kb:[x,y,z], src}
   *   missile(pos, dir)         spawn a (damaging) missile at the opponent
   *   sound(name)               only the local player makes sounds for its own actions
   * }
   */
  constructor(idx, hooks) {
    this.idx = idx;
    this.hooks = hooks;
    this.pos = new THREE.Vector3();
    this.mv = new THREE.Vector3();   // controlled horizontal velocity
    this.kb = new THREE.Vector3();   // knockback velocity (decays)
    this.vy = 0;
    this.yaw = 0;
    this.grounded = true;
    this.sig = '';
    this.setParts({});
    this.reset({ x: 0, z: 0, yaw: 0 });
  }

  reset(sp) {
    this.pos.set(sp.x, 0, sp.z);
    this.yaw = sp.yaw;
    this.mv.set(0, 0, 0); this.kb.set(0, 0, 0); this.vy = 0;
    this.arms = { leftArm: { cd: 0, swing: 0, hitAt: 0, tick: 0 }, rightArm: { cd: 0, swing: 0, hitAt: 0, tick: 0 } };
    this.backCd = 0; this.fuel = 2.2; this.shieldT = 0; this.spinT = 0; this.spinTick = 0; this.missileQ = [];
    this.dashCd = 0; this.dashT = 0; this.rammed = false;
  }

  setParts(parts) {
    const sig = partsSig(parts);
    if (sig === this.sig) return;
    this.sig = sig;
    this.parts = parts;
    this.stats = computeStats(parts);
  }

  applyKnockback(v) {
    const r = 1 - this.stats.kbResist;
    this.kb.x += v[0] * r; this.kb.z += v[2] * r;
    this.vy = Math.max(this.vy, v[1] * (0.4 + r * 0.6));
    if (v[1] > 2) this.grounded = false;
  }

  get forward() { return _f.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  /** check whether the opponent is inside a cone in front of us */
  _inReach(target, range, arcDeg, hTol = 3.5) {
    if (!target) return null;
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - RADIUS > range) return null;
    if (Math.abs(target.y - this.pos.y) > hTol) return null;
    const diff = Math.abs(wrap(Math.atan2(dx, dz) - this.yaw));
    if (d > 1.8 && diff > (arcDeg * Math.PI / 180) / 2) return null;
    return { nx: dx / (d || 1), nz: dz / (d || 1), d };
  }

  _hit(target, range, arc, dmg, kb, kbUp, partMult, src, hTol, pullIn) {
    const r = this._inReach(target, range, arc, hTol);
    if (!r) return false;
    const dir = pullIn ? -1 : 1;
    this.hooks.hit({ dmg: dmg * this.stats.dmgMult, partMult, kb: [r.nx * kb * dir, kbUp, r.nz * kb * dir], src });
    return true;
  }

  /**
   * inp: {mx, mz (-1..1), yaw, jump, lmb, rmb, shift, shiftPressed, dash}
   * target: opponent pose; env: {canAct, magnetOn}
   */
  update(dt, inp, target, env) {
    const st = this.stats;
    const canAct = env.canAct;
    this.yaw = inp.yaw;
    const f = this.forward;
    const right = _r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const anim = { la: 0, lh: false, ra: 0, rh: false, sh: false, jt: false, sp: false, br: false };

    // ---- movement
    _w.set(0, 0, 0);
    if (canAct) _w.addScaledVector(f, inp.mz).addScaledVector(right, inp.mx);
    if (_w.lengthSq() > 1) _w.normalize();
    _w.multiplyScalar(st.speed);
    const grip = st.grip * (this.grounded ? 1 : 0.35);
    this.mv.lerp(_w, 1 - Math.exp(-grip * dt));
    this.kb.multiplyScalar(Math.exp(-st.kbDecay * dt));
    if (env.magnetOn) {
      const d = Math.hypot(this.pos.x, this.pos.z) || 1;
      const pull = 9.5 * (1 - st.kbResist * 0.6);
      this.pos.x -= this.pos.x / d * pull * dt; this.pos.z -= this.pos.z / d * pull * dt;
    }
    // dash
    this.dashCd -= dt; this.dashT -= dt;
    if (canAct && inp.dash && this.dashCd <= 0) {
      this.dashCd = 3 * st.cdMult; this.dashT = 0.35; this.rammed = false;
      const dir = _w.lengthSq() > 0.1 ? _w.clone().normalize() : f.clone();
      this.kb.addScaledVector(dir, 26);
      this.hooks.sound('dash');
    }
    if (st.ram && this.dashT > 0 && !this.rammed && canAct) {
      if (this._hit(target, 2.4, 140, 20, 20, 9, 1.3, 'ram')) { this.rammed = true; this.hooks.sound('clang'); }
    }

    this.pos.x += (this.mv.x + this.kb.x) * dt;
    this.pos.z += (this.mv.z + this.kb.z) * dt;

    // ---- vertical
    this.vy -= GRAV * dt;
    if (this.grounded) {
      if (canAct && inp.jump) { this.vy = st.jump; this.hooks.sound('jump'); }
      else if (st.pogo && canAct) this.vy = 9;
    }
    // back: jetpack
    const backId = slotId(this.parts, 'back');
    const back = backId ? PARTS[backId].back : null;
    if (back?.type === 'jet') {
      if (canAct && inp.shift && this.fuel > 0) {
        this.vy = Math.min(this.vy + 48 * dt, 10); this.fuel -= dt; anim.jt = true;
      } else if (this.grounded) this.fuel = Math.min(back.fuel, this.fuel + dt * 0.9);
      anim.br = this.fuel > 0.3;
    }
    // spider: climb walls
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (st.climb && canAct && r > ARENA_R - RADIUS - 0.1) {
      const outward = (_w.x * this.pos.x + _w.z * this.pos.z) / (r * (st.speed || 1));
      if (outward > 0.25) this.vy = Math.max(this.vy, 7);
    }
    this.pos.y += this.vy * dt;
    if (this.pos.y > WALL_H + 3) { this.pos.y = WALL_H + 3; this.vy = Math.min(this.vy, 0); }
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      if (this.vy <= 0) {
        const impact = this.vy;
        if (!this.grounded && st.pogo && impact < -15 && canAct) {
          // pogo slam on big landings
          this.hooks.sound('slam');
          this.hooks.fx?.('dust', this.pos);
          const tr = this._inReach(target, 4.5, 360, 3);
          if (tr) this.hooks.hit({ dmg: 16 * st.dmgMult, partMult: 1.2, kb: [tr.nx * 10, 14, tr.nz * 10], src: 'pogo' });
        }
        this.vy = 0; this.grounded = true;
      }
    } else this.grounded = false;

    // ---- walls + other mech
    const r2 = Math.hypot(this.pos.x, this.pos.z);
    const maxR = ARENA_R - RADIUS;
    if (r2 > maxR) {
      this.pos.x *= maxR / r2; this.pos.z *= maxR / r2;
      const nx = this.pos.x / maxR, nz = this.pos.z / maxR;
      const kd = this.kb.x * nx + this.kb.z * nz;
      if (kd > 0) { this.kb.x -= nx * kd * 1.6; this.kb.z -= nz * kd * 1.6; }
    }
    if (target) {
      const dx = this.pos.x - target.x, dz = this.pos.z - target.z, d = Math.hypot(dx, dz);
      if (d < RADIUS * 2 && d > 0.001 && Math.abs(this.pos.y - target.y) < 3) {
        const push = RADIUS * 2 - d;
        this.pos.x += dx / d * push; this.pos.z += dz / d * push;
      }
    }

    // ---- arms
    for (const side of ['leftArm', 'rightArm']) {
      const id = slotId(this.parts, side);
      const atk = PARTS[id].atk;
      const s = this.arms[side];
      const down = canAct && (side === 'leftArm' ? inp.lmb : inp.rmb);
      s.cd -= dt;
      const L = side === 'leftArm';
      if (atk.type === 'swing') {
        if (down && s.cd <= 0) { s.cd = atk.cd; s.swing = 0.28; s.hitAt = 0.1; this.hooks.sound('swing'); }
        if (s.swing > 0) {
          s.swing -= dt;
          if (s.hitAt > 0) {
            s.hitAt -= dt;
            if (s.hitAt <= 0 && this._hit(target, atk.range, atk.arc, atk.dmg, atk.kb, atk.kb * 0.35, atk.partMult || 1, id)) this.hooks.sound('hit');
          }
        }
        anim[L ? 'la' : 'ra'] = Math.max(0, s.swing / 0.28);
      } else {
        anim[L ? 'lh' : 'rh'] = down;
        if (down) {
          s.tick -= dt;
          if (s.tick <= 0) {
            s.tick = 0.1;
            const beam = atk.type === 'beam';
            this._hit(target, atk.range, atk.arc, atk.dps * 0.1, beam ? atk.pull : atk.kb, beam ? 0.6 : 0, atk.partMult || 1, id, beam ? 7 : 3.5, beam);
          }
        } else s.tick = 0;
      }
    }

    // ---- back abilities
    this.backCd -= dt; this.shieldT -= dt; this.spinT -= dt;
    if (back && back.type !== 'jet') {
      anim.br = this.backCd <= 0;
      if (canAct && inp.shiftPressed && this.backCd <= 0) {
        this.backCd = back.cd * st.cdMult;
        if (back.type === 'shield') { this.shieldT = back.dur; this.hooks.sound('shield'); }
        if (back.type === 'spin') { this.spinT = back.dur; this.spinTick = 0; this.hooks.sound('swing'); }
        if (back.type === 'missiles') for (let i = 0; i < back.n; i++) this.missileQ.push(i * 0.13);
      }
      if (this.spinT > 0) {
        anim.sp = true;
        this.spinTick -= dt;
        if (this.spinTick <= 0) {
          this.spinTick = 0.15;
          if (this._hit(target, back.range, 360, back.dmg, 6, 3, 1, 'spin')) this.hooks.sound('hit');
        }
      }
      if (this.missileQ.length) {
        for (let i = this.missileQ.length - 1; i >= 0; i--) {
          this.missileQ[i] -= dt;
          if (this.missileQ[i] <= 0) {
            this.missileQ.splice(i, 1);
            const p = this.pos.clone().add(_w.set(0, 3.3, 0)).addScaledVector(f, -0.8);
            const dir = new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.2, 0).add(f).normalize();
            this.hooks.missile(p, dir, back.dmg * st.dmgMult);
            this.hooks.sound('missile');
          }
        }
      }
    }
    anim.sh = this.shieldT > 0;

    const pose = this.pose || (this.pose = { x: 0, y: 0, z: 0, yaw: 0, a: {} });
    pose.x = this.pos.x; pose.y = this.pos.y; pose.z = this.pos.z; pose.yaw = this.yaw;
    anim.mv = Math.hypot(this.mv.x + this.kb.x, this.mv.z + this.kb.z);
    anim.gr = this.grounded; anim.vy = this.vy;
    pose.a = anim;
    return pose;
  }
}
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();
