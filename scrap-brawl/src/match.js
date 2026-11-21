// The authoritative match. Runs only on the host (or locally in practice mode).
// Owns: phases/rounds/score, conveyor belt, everyone's parts + HP, pickups, hazards.
import { PARTS, SLOTS, randomPartId, slotKind, computeStats } from './parts.js';
import { ARENA_R, LAVA, CRUSHER_HALF, BELT_START, BELT_END, SPAWNS } from './world.js';

export const BUILD_TIME = 45;
export const FIGHT_TIME = 120;
export const WINS_NEEDED = 3;
export const BELT_SPEED = 3;
export const FIRST_PICK_TIME = 4;

const emptyParts = () => ({ head: null, leftArm: null, rightArm: null, back: null, legs: null });

export class Match {
  constructor() {
    this.events = [];       // drained by the game each frame (sounds/fx + forwarded to guest)
    this.knockbacks = [];   // [{victim, v:[x,y,z]}]
    this.nextId = 1;
    this.rematch = [false, false];
    this.state = {
      phase: 'lobby', timer: 0, round: 0, score: [0, 0], firstPick: -1, firstPickT: 0,
      roundWinner: -1, matchWinner: -1, msg: '',
      players: [this._player(), this._player()],
      belt: [], pickups: [],
      cr: { y: 11, warn: false }, mg: { on: false, warn: false },
    };
    this.spawnT = 0;
    this.crT = 0; this.mgT = 0; this.lavaT = 0;
  }
  _player() { return { parts: emptyParts(), hp: 100, maxHp: 100 }; }
  emit(e) { this.events.push(e); }

  startMatch() {
    const s = this.state;
    s.score = [0, 0]; s.round = 0; s.matchWinner = -1; s.firstPick = -1;
    this.rematch = [false, false];
    this._startBuild();
  }

  _startBuild() {
    const s = this.state;
    s.round++;
    s.phase = 'build'; s.timer = BUILD_TIME;
    s.players.forEach((p) => { p.parts = emptyParts(); });
    s.pickups = [];
    s.belt = [];
    // prefill the belt so there's something to grab immediately
    for (let x = BELT_START + 1; x < BELT_END - 1; x += 2.6) s.belt.push({ id: this.nextId++, part: randomPartId(), x });
    this.spawnT = 0;
    s.firstPickT = s.firstPick >= 0 ? FIRST_PICK_TIME : 0;
    s.cr = { y: 11, warn: false }; s.mg = { on: false, warn: false };
    this.emit({ k: 'build' });
  }

  _startCountdown() {
    const s = this.state;
    s.phase = 'countdown'; s.timer = 3;
    s.belt = [];
    for (const p of s.players) { const st = computeStats(p.parts); p.maxHp = st.maxHp; p.hp = st.maxHp; }
    this.crT = 0; this.mgT = 0;
    this.emit({ k: 'countdown' });
  }

  /** p = player index, slot = which arm for arm parts */
  grab(p, itemId, armSlot) {
    const s = this.state;
    if (s.phase !== 'build') return;
    if (s.firstPickT > 0 && p !== s.firstPick) { this.emit({ k: 'deny', p, why: 'firstpick' }); return; }
    const i = s.belt.findIndex((b) => b.id === itemId);
    if (i < 0) { this.emit({ k: 'deny', p, why: 'gone' }); return; }
    const it = s.belt[i];
    const def = PARTS[it.part];
    let slot = def.kind === 'arm' ? (armSlot === 'rightArm' ? 'rightArm' : 'leftArm') : def.kind;
    s.belt.splice(i, 1);
    s.players[p].parts[slot] = { id: it.part, hp: def.hp, max: def.hp };
    this.emit({ k: 'grab', p, part: it.part, slot });
  }

  /** a fight hit. h: {dmg, partMult, kb:[x,y,z], slot?} */
  hit(a, v, h, poses) {
    const s = this.state;
    if (s.phase !== 'fight') return;
    const P = s.players[v];
    const pose = poses[v];
    let dmg = Math.max(0, h.dmg || 0);
    const shielded = !!pose?.a?.sh;
    if (shielded) dmg *= 0.2;
    P.hp = Math.max(0, P.hp - dmg);
    // part damage: a random attached (non-default) part soaks some of it
    const attached = SLOTS.filter((sl) => P.parts[sl]);
    if (attached.length && dmg > 0) {
      const sl = h.slot && P.parts[h.slot] ? h.slot : attached[Math.floor(Math.random() * attached.length)];
      const part = P.parts[sl];
      part.hp -= dmg * (h.partMult || 1) * 0.7;
      if (part.hp <= 0) this._detach(v, sl, pose);
    }
    if (h.kb) {
      const m = shielded ? 0.3 : 1;
      this.knockbacks.push({ victim: v, v: [h.kb[0] * m, h.kb[1] * m, h.kb[2] * m] });
    }
    if (pose) this.emit({ k: 'hit', v, a, dmg: Math.round(dmg * 10) / 10, pos: [pose.x, pose.y + 2.2, pose.z], sh: shielded, src: h.src });
    if (P.hp <= 0) this._endRound(a);
  }

  _detach(v, slot, pose) {
    const P = this.state.players[v];
    const part = P.parts[slot];
    P.parts[slot] = null;
    const ang = Math.random() * Math.PI * 2, d = 3 + Math.random() * 3;
    let x = (pose?.x || 0) + Math.cos(ang) * d, z = (pose?.z || 0) + Math.sin(ang) * d;
    const r = Math.hypot(x, z), max = ARENA_R - 3;
    if (r > max) { x *= max / r; z *= max / r; }
    this.state.pickups.push({ id: this.nextId++, part: part.id, x, z, hp: Math.max(15, part.max * 0.6), max: part.max });
    this.emit({ k: 'detach', v, part: part.id, pos: [pose?.x || 0, (pose?.y || 0) + 2.5, pose?.z || 0] });
  }

  _attach(p, id, hp, max, poses) {
    const P = this.state.players[p];
    const kind = PARTS[id].kind;
    let slot = kind;
    if (kind === 'arm') slot = !P.parts.leftArm ? 'leftArm' : !P.parts.rightArm ? 'rightArm' : 'leftArm';
    const old = P.parts[slot];
    if (old) this._detach(p, slot, poses[p]);
    P.parts[slot] = { id, hp, max };
    return slot;
  }

  pickup(p, id, poses) {
    const s = this.state;
    if (s.phase !== 'fight') return;
    const i = s.pickups.findIndex((k) => k.id === id);
    if (i < 0) return;
    const k = s.pickups[i], pose = poses[p];
    if (!pose || Math.hypot(pose.x - k.x, pose.z - k.z) > 3.4) return;
    s.pickups.splice(i, 1);
    const slot = this._attach(p, k.part, k.hp, k.max, poses);
    this.emit({ k: 'bolt', p, part: k.part, slot });
  }

  _endRound(winner) {
    const s = this.state;
    if (s.phase !== 'fight') return;
    s.score[winner]++;
    s.roundWinner = winner;
    s.firstPick = 1 - winner;
    if (s.score[winner] >= WINS_NEEDED) { s.phase = 'matchover'; s.matchWinner = winner; s.timer = 0; this.rematch = [false, false]; }
    else { s.phase = 'roundover'; s.timer = 4.5; }
    this.emit({ k: 'roundover', w: winner, match: s.phase === 'matchover' });
  }

  voteRematch(p) {
    if (this.state.phase !== 'matchover') return;
    this.rematch[p] = true;
    this.state.rematch = [...this.rematch];
    if (this.rematch[0] && this.rematch[1]) this.startMatch();
  }

  update(dt, poses) {
    const s = this.state;
    switch (s.phase) {
      case 'build': {
        s.timer -= dt;
        if (s.firstPickT > 0) s.firstPickT = Math.max(0, s.firstPickT - dt);
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawnT = 1.0; s.belt.push({ id: this.nextId++, part: randomPartId(), x: BELT_START }); }
        for (const b of s.belt) b.x += BELT_SPEED * dt;
        s.belt = s.belt.filter((b) => b.x < BELT_END);
        if (s.timer <= 0) this._startCountdown();
        break;
      }
      case 'countdown':
        s.timer -= dt;
        if (s.timer <= 0) { s.phase = 'fight'; s.timer = FIGHT_TIME; this.emit({ k: 'fight' }); }
        break;
      case 'fight':
        s.timer -= dt;
        this._hazards(dt, poses);
        if (s.phase === 'fight' && s.timer <= 0) {
          const [a, b] = s.players.map((p) => p.hp / p.maxHp);
          this._endRound(a === b ? (Math.random() < 0.5 ? 0 : 1) : a > b ? 0 : 1);
        }
        break;
      case 'roundover':
        s.timer -= dt;
        if (s.timer <= 0) this._startBuild();
        break;
    }
  }

  _hazards(dt, poses) {
    const s = this.state;
    // crusher: 10s cycle -> idle 6.5, warn 1.5 (creeps down), slam 0.25, rise 1.75
    this.crT += dt;
    const c = this.crT % 10, prev = (this.crT - dt) % 10;
    if (c < 6.5) s.cr = { y: 11, warn: false };
    else if (c < 8) s.cr = { y: 11 - (c - 6.5) * 1.2, warn: true };
    else if (c < 8.25) s.cr = { y: 1, warn: true };
    else s.cr = { y: 1 + (c - 8.25) / 1.75 * 10, warn: false };
    if (prev < 8 && c >= 8) {
      this.emit({ k: 'slam' });
      poses.forEach((p, i) => {
        if (p && Math.abs(p.x) < CRUSHER_HALF + 0.6 && Math.abs(p.z) < CRUSHER_HALF + 0.6 && p.y < 3.5) {
          const d = Math.hypot(p.x, p.z) || 1;
          this.hit(1 - i, i, { dmg: 35, partMult: 1.5, kb: [p.x / d * 18, 16, p.z / d * 18], src: 'crusher' }, poses);
        }
      });
    }
    // magnet: every 25s, warn 2.5s then pull for 4s
    this.mgT += dt;
    const m = this.mgT % 25;
    const wasOn = s.mg.on;
    s.mg = { on: m >= 20.5 && m < 24.5, warn: m >= 18 && m < 20.5 };
    if (!wasOn && s.mg.on) this.emit({ k: 'magnet' });
    // lava
    this.lavaT -= dt;
    if (this.lavaT <= 0) {
      this.lavaT = 0.25;
      poses.forEach((p, i) => {
        if (!p || p.y > 0.6) return;
        for (const L of LAVA) if (Math.hypot(p.x - L.x, p.z - L.z) < L.r) {
          this.hit(1 - i, i, { dmg: 6, partMult: 0.6, kb: [0, 9, 0], src: 'lava' }, poses);
          break;
        }
      });
    }
  }
}

export { SPAWNS, slotKind };
