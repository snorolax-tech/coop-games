// Friendly rancher-vs-rancher battles (host-authoritative). Each rancher fights with their
// party in order; first to run out of healthy creatures loses. It's friendly: every
// creature's HP and status are restored when the match ends, and both get a little XP.
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../data/creatures.js';
import { MOVES } from '../data/moves.js';
import { useMove, stat, grantXp, xpToNext } from './rules.js';

const ACT_DELAY = 1.25;
const nameOf = (inst) => inst.nickname || SPECIES_BY_ID[inst.species].name;

export class PvpBattle {
  constructor(mgr, actorA, actorB, id) {
    this.mgr = mgr;
    this.id = id;
    this.pvp = true;
    this.phase = 'choose';
    this.turn = 1;
    this.queue = [];
    this.timer = 0;
    this.log = [];
    this.foes = []; // (wild-battle API compatibility)
    this.center = new THREE.Vector3();
    this.actors = [actorA, actorB];
    // remember HP so the match can be undone afterwards (friendly battle)
    this.saved = new Map();
    for (const a of this.actors) for (const c of a.party) this.saved.set(c, c.hp);
    this.allies = this.actors.map((a, i) => this._battler(a, a.party.find((c) => c.hp > 0), i));
    this.place();
  }

  get game() { return this.mgr.game; }

  _battler(actor, inst, side) {
    return { key: `p${side}_${inst.uid}`, side, owner: actor.id, actor, inst, stages: {}, status: null, choice: null, pos: new THREE.Vector3(), yaw: 0 };
  }

  say(t) { this.log.push(t); if (this.log.length > 6) this.log.shift(); }
  owners() { return this.actors.map((a) => a.id); }

  /** Creatures face off between the two ranchers. */
  place() {
    const pa = this.mgr.posOf(this.actors[0].id), pb = this.mgr.posOf(this.actors[1].id);
    if (!pa || !pb) return;
    this.center.copy(pa).add(pb).multiplyScalar(0.5);
    const dir = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z);
    const len = dir.length() || 1;
    dir.divideScalar(len);
    const gap = Math.min(len * 0.3, 3.2);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(1.2);
    this.allies.forEach((b, i) => {
      const s = i === 0 ? -1 : 1;
      b.pos.set(this.center.x + dir.x * gap * s + side.x * s, 0, this.center.z + dir.z * gap * s + side.z * s);
      b.pos.y = this.game.world.groundY(b.pos.x, b.pos.z);
      const other = i === 0 ? 1 : 0;
      b.yaw = Math.atan2(-dir.x * s, -dir.z * s);
      void other;
    });
  }

  choose(ownerId, i) {
    if (this.phase !== 'choose') return;
    const b = this.allies.find((x) => x.owner === ownerId);
    const id = b?.inst.moves[i];
    if (!id) return;
    b.choice = id;
    this.mgr.changed();
    if (this.allies.every((x) => x.choice)) this._startTurn();
  }

  _startTurn() {
    const [a, b] = this.allies;
    const acts = [{ b: a, move: a.choice, target: b }, { b, move: b.choice, target: a }];
    acts.sort((x, y) => ((MOVES[y.move].priority || 0) - (MOVES[x.move].priority || 0)) || (stat(y.b, 'spd') - stat(x.b, 'spd')) || (Math.random() - 0.5));
    this.queue = acts;
    this.phase = 'act';
    this.timer = 0.4;
    this.mgr.changed();
  }

  update(dt) {
    if (this.phase !== 'act') return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const act = this.queue.shift();
    if (!act) { this._endTurn(); return; }
    this._do(act);
    this.timer = ACT_DELAY;
  }

  _do(act) {
    const b = act.b;
    const tgt = this.allies.find((x) => x.side !== b.side);
    if (!this.allies.includes(b) || b.inst.hp <= 0 || !tgt) { this.timer = 0; return; }
    const who = `${nameOf(b.inst)} (${b.actor.name})`;
    if (b.status === 'sleep') {
      b.sleepTurns--;
      if (b.sleepTurns > 0) { this._emit({ a: b.key, skip: 'sleep', text: `${who} is fast asleep… 💤` }); return; }
      b.status = null;
    }
    if (b.status === 'paralyze' && Math.random() < 0.25) { this._emit({ a: b.key, skip: 'paralyze', text: `${who} is too zapped to move! ⚡` }); return; }
    const r = useMove(b, tgt, act.move);
    let text = `${who} used ${MOVES[act.move].name}!`;
    if (r.miss) text += ' It missed!';
    else {
      if (r.dmg && r.eff > 1) text += ' It\'s super effective!';
      if (r.dmg && r.eff < 1) text += ' It\'s not very effective…';
      if (r.crit) text += ' Critical hit!';
      if (r.heal) text += ` Recovered ${r.heal} HP.`;
      if (r.status) text += ` ${nameOf(tgt.inst)} is ${{ burn: 'burned 🔥', sleep: 'asleep 💤', paralyze: 'paralyzed ⚡' }[r.status]}!`;
    }
    this._emit({ a: b.key, t: tgt.key, r, text });
    if (tgt.inst.hp <= 0) this._faint(tgt);
  }

  _emit(ev) { this.say(ev.text); this.mgr.emit({ b: this.id, ...ev }); this.mgr.changed(); }

  _faint(b) {
    this.mgr.emit({ b: this.id, faint: b.key, text: `${nameOf(b.inst)} fainted!` });
    this.say(`${nameOf(b.inst)} fainted!`);
    const next = b.actor.party.find((c) => c.hp > 0);
    const i = this.allies.indexOf(b);
    if (next) {
      this.allies[i] = { ...this._battler(b.actor, next, b.side), pos: b.pos.clone(), yaw: b.yaw };
      this.say(`${b.actor.name} sends out ${nameOf(next)}!`);
    } else {
      this.loser = b.actor;
    }
  }

  _endTurn() {
    for (const b of this.allies) {
      if (b.status === 'burn' && b.inst.hp > 0) {
        const d = Math.max(1, Math.floor(b.inst.stats.hp / 16));
        b.inst.hp = Math.max(0, b.inst.hp - d);
        this._emit({ a: b.key, burn: d, text: `${nameOf(b.inst)} is hurt by its burn! 🔥` });
        if (b.inst.hp <= 0) this._faint(b);
      }
      b.choice = null;
    }
    this.turn++;
    if (this.loser) return this.finish(this.actors.find((a) => a !== this.loser), this.loser);
    this.phase = 'choose';
    this.mgr.changed();
  }

  forfeit(actor) {
    this.finish(this.actors.find((a) => a !== actor), actor, true);
  }

  finish(winner, loser, forfeit = false) {
    if (this.done) return;
    this.done = true;
    // friendly match: put everyone's HP back and clear statuses
    for (const [c, hp] of this.saved) c.hp = hp;
    for (const a of this.actors) {
      // a little XP for taking part (more for the winner)
      this.game.awardPartyXp(a, a === winner ? 30 : 15, a.party[0], a === winner ? '🏆 Friendly battle won!' : '⚔️ Good battle!');
    }
    const text = forfeit ? `${loser.name} forfeits — ${winner.name} wins! 🏆` : `${winner.name} wins the friendly battle! 🏆`;
    this.mgr.emit({ b: this.id, end: 'pvp', text, winner: winner.id });
    this.game.sharedBanner(`🏆 ${winner.name} wins!`, 'Friendly battle over — all creatures are back to full health', '#ffd166', 'chime');
    this.mgr.battles.delete(this.id);
    this.mgr.changed();
  }

  describe() {
    const d = (a) => ({
      key: a.key, owner: a.owner, ownerName: a.actor.name, sp: a.inst.species, lvl: a.inst.level, shiny: a.inst.shiny,
      name: nameOf(a.inst), hp: a.inst.hp, max: a.inst.stats.hp, status: a.status, moves: a.inst.moves, chose: !!a.choice, ct: null,
      xp: a.inst.xp, xpn: xpToNext(a.inst.level),
      x: +a.pos.x.toFixed(2), y: +a.pos.y.toFixed(2), z: +a.pos.z.toFixed(2), yaw: +a.yaw.toFixed(2),
    });
    return { id: this.id, pvp: true, phase: this.phase, turn: this.turn, allies: this.allies.map(d), foes: [], log: this.log.slice(-3) };
  }
}
