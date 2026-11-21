// Practice-mode opponent: grabs random parts and brawls with simple steering.
import { PARTS, slotId } from './parts.js';
import { LAVA } from './world.js';

export class Bot {
  constructor() { this.grabT = 2; this.strafe = 1; this.strafeT = 0; this.jumpT = 2; this.dashT = 3; this.yaw = 0; }

  /** build phase: occasionally grab something useful off the belt */
  build(dt, state, match) {
    this.grabT -= dt;
    if (this.grabT > 0 || !state.belt.length) return;
    this.grabT = 1.6 + Math.random() * 1.8;
    const mine = state.players[1].parts;
    const wanted = state.belt.filter((b) => b.x > -10 && b.x < 10).filter((b) => {
      const k = PARTS[b.part].kind;
      return k === 'arm' ? (!mine.leftArm || !mine.rightArm) : !mine[k];
    });
    const pick = wanted[Math.floor(Math.random() * wanted.length)];
    if (pick) match.grab(1, pick.id, mine.leftArm ? 'rightArm' : 'leftArm');
  }

  /** fight: returns a Pilot input object */
  fight(dt, me, foe, pilot, state) {
    const dx = foe.x - me.x, dz = foe.z - me.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += Math.max(-dt * 4, Math.min(dt * 4, diff));
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 2; this.strafe = Math.random() < 0.5 ? -1 : 1; }
    this.jumpT -= dt; this.dashT -= dt;
    const ranges = ['leftArm', 'rightArm'].map((s) => PARTS[slotId(state.players[1].parts, s)].atk.range);
    const reach = Math.max(...ranges);
    const inp = { mx: this.strafe * 0.5, mz: d > reach * 0.8 ? 1 : d < 2.6 ? -0.4 : 0, yaw: this.yaw, jump: false, lmb: false, rmb: false, shift: false, shiftPressed: false, dash: false };
    // steer away from lava
    for (const L of LAVA) if (Math.hypot(me.x - L.x, me.z - L.z) < L.r + 2.5) { inp.mz = -0.6; inp.mx = me.x > L.x ? -1 : 1; }
    if (state.mg?.on || state.cr?.warn) if (Math.abs(me.x) < 6 && Math.abs(me.z) < 6) inp.mz = -1;
    const facing = Math.abs(diff) < 0.6;
    if (facing) { inp.lmb = d < ranges[0] + 1.2; inp.rmb = d < ranges[1] + 1.2; }
    if (this.jumpT <= 0) { this.jumpT = 2 + Math.random() * 3; inp.jump = Math.random() < 0.5; }
    if (this.dashT <= 0 && d < 9 && facing) { this.dashT = 4 + Math.random() * 3; inp.dash = true; }
    if (d < 12 && Math.random() < dt * 0.8) { inp.shiftPressed = true; }
    if (PARTS[slotId(state.players[1].parts, 'back') || 'fist']?.back?.type === 'jet') inp.shift = foe.y > me.y + 1;
    return inp;
  }
}
