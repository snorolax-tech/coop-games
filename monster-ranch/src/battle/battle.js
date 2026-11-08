// Host-authoritative, turn-based battles that happen right in the world.
// 1v1 alone; when the second rancher joins it becomes 2v2 (a nearby wild creature
// joins the other side if there is one). Each rancher commands their own creature.
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../data/creatures.js';
import { MOVES } from '../data/moves.js';
import { TYPES } from '../data/types.js';
import { useMove, pickWildMove, stat, xpReward, grantXp } from './rules.js';

const ACT_DELAY = 1.25;
let battleIds = 1;

function nameOf(inst) { return inst.nickname || SPECIES_BY_ID[inst.species].name; }

class Battle {
  constructor(mgr) {
    this.mgr = mgr;
    this.id = battleIds++;
    this.allies = [];
    this.foes = [];
    this.phase = 'choose';
    this.queue = [];
    this.timer = 0;
    this.turn = 1;
    this.log = [];
    this.center = new THREE.Vector3();
  }

  get game() { return this.mgr.game; }

  say(text) { this.log.push(text); if (this.log.length > 6) this.log.shift(); }

  addFoe(c) {
    c.battleId = this.id;
    c.sleeping = false;
    c.setState('battle', 999);
    const b = { key: 'f' + this.foes.length + '_' + c.nid, side: 'foe', inst: c.inst, nid: c.nid, wild: c, stages: {}, status: null, choice: null };
    this.foes.push(b);
    return b;
  }

  addAlly(actor, inst) {
    const b = { key: `a_${actor.id}_${inst.uid}`, side: 'ally', owner: actor.id, actor, inst, stages: {}, status: null, choice: null, pos: new THREE.Vector3(), yaw: 0 };
    this.allies.push(b);
    this.placeAllies();
    return b;
  }

  /** Allies stand between their rancher and the foes. */
  placeAllies() {
    const foe = this.foes.find((f) => f.inst.hp > 0) || this.foes[0];
    if (!foe) return;
    const fp = foe.wild.pos;
    this.allies.forEach((a, i) => {
      const owner = this.mgr.posOf(a.owner) || fp;
      const dir = new THREE.Vector3(fp.x - owner.x, 0, fp.z - owner.z);
      const d = dir.length() || 1;
      dir.divideScalar(d);
      const gap = Math.min(d * 0.6, 5.5 + foe.wild.radius);
      // stand off to the side so the rancher can see the foe past their partner
      const off = this.allies.length > 1 ? (i === 0 ? -2.2 : 2.2) : 2.2;
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(off);
      a.pos.set(fp.x - dir.x * gap + side.x, 0, fp.z - dir.z * gap + side.z);
      a.pos.y = this.game.world.groundY(a.pos.x, a.pos.z);
      a.yaw = Math.atan2(fp.x - a.pos.x, fp.z - a.pos.z);
    });
    this.center.copy(fp);
    for (const f of this.foes) {
      const t = this.allies[0]?.pos;
      if (t) f.wild.yaw = Math.atan2(t.x - f.wild.pos.x, t.z - f.wild.pos.z);
    }
  }

  alliesOf(ownerId) { return this.allies.filter((a) => a.owner === ownerId); }
  owners() { return [...new Set(this.allies.map((a) => a.owner))]; }

  choose(ownerId, moveIndex) {
    if (this.phase !== 'choose') return;
    const a = this.allies.find((x) => x.owner === ownerId && x.inst.hp > 0);
    if (!a) return;
    const id = a.inst.moves[moveIndex];
    if (!id) return;
    a.choice = id;
    this.mgr.changed();
    if (this.allies.every((x) => x.inst.hp <= 0 || x.choice)) this._startTurn();
  }

  _startTurn() {
    const acts = [];
    const aliveAllies = this.allies.filter((a) => a.inst.hp > 0);
    const aliveFoes = this.foes.filter((f) => f.inst.hp > 0);
    aliveAllies.forEach((a, i) => acts.push({ b: a, move: a.choice, target: aliveFoes[i % aliveFoes.length] }));
    for (const f of aliveFoes) {
      const target = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
      acts.push({ b: f, move: pickWildMove(f, target), target });
    }
    acts.sort((x, y) => ((MOVES[y.move].priority || 0) - (MOVES[x.move].priority || 0)) || (stat(y.b, 'spd') - stat(x.b, 'spd')) || (Math.random() - 0.5));
    this.queue = acts;
    this.phase = 'act';
    this.timer = 0.4;
    this.mgr.changed();
  }

  update(dt) {
    if (this.phase !== 'act' || this.paused) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const act = this.queue.shift();
    if (!act) { this._endTurn(); return; }
    this._doAction(act);
    this.timer = ACT_DELAY;
  }

  _retarget(act) {
    const pool = act.b.side === 'ally' ? this.foes : this.allies;
    if (act.target && act.target.inst.hp > 0 && pool.includes(act.target)) return act.target;
    return pool.find((x) => x.inst.hp > 0);
  }

  _doAction(act) {
    const b = act.b;
    if (b.inst.hp <= 0 || (!this.allies.includes(b) && !this.foes.includes(b))) { this.timer = 0; return; }
    const tgt = this._retarget(act);
    if (!tgt) { this.timer = 0; return; }
    const who = nameOf(b.inst) + (b.side === 'foe' ? ' (wild)' : '');
    // status checks
    if (b.status === 'sleep') {
      b.sleepTurns--;
      if (b.sleepTurns > 0) { this._emit({ a: b.key, skip: 'sleep', text: `${who} is fast asleep… 💤` }); return; }
      b.status = null;
      this.say(`${who} woke up!`);
    }
    if (b.status === 'paralyze' && Math.random() < 0.25) { this._emit({ a: b.key, skip: 'paralyze', text: `${who} is too zapped to move! ⚡` }); return; }

    const r = useMove(b, tgt, act.move);
    const m = MOVES[act.move];
    let text = `${who} used ${m.name}!`;
    if (r.miss) text += ' It missed!';
    else {
      if (r.dmg) {
        if (r.eff > 1) text += ' It\'s super effective!';
        else if (r.eff < 1) text += ' It\'s not very effective…';
        if (r.crit) text += ' Critical hit!';
      }
      if (r.heal) text += ` Recovered ${r.heal} HP.`;
      if (r.statMsg?.changed) text += ` ${r.statMsg.who === 'self' ? nameOf(b.inst) : nameOf(tgt.inst)}'s ${r.statMsg.stat.toUpperCase()} ${r.statMsg.up ? 'rose' : 'fell'}!`;
      if (r.status) text += ` ${nameOf(tgt.inst)} is ${{ burn: 'burned 🔥', sleep: 'asleep 💤', paralyze: 'paralyzed ⚡' }[r.status]}!`;
    }
    this._emit({ a: b.key, t: tgt.key, r, text });
    if (tgt.inst.hp <= 0) this._faint(tgt);
  }

  _emit(ev) {
    this.say(ev.text);
    this.mgr.emit({ b: this.id, ...ev });
    this.mgr.changed();
  }

  _faint(b) {
    const name = nameOf(b.inst);
    if (b.side === 'foe') {
      this.say(`The wild ${name} fainted and wanders off dazed.`);
      this.mgr.emit({ b: this.id, faint: b.key, text: `The wild ${name} fainted!` });
      const xp = xpReward(b.inst);
      for (const a of this.allies) {
        if (a.inst.hp <= 0) continue;
        const lv = grantXp(a.inst, xp);
        a.actor.toast(`${nameOf(a.inst)} gained ${xp} XP!`, 'good');
        if (lv) {
          this.say(`${nameOf(a.inst)} grew to Lv ${a.inst.level}!`);
          a.actor.toast(`⬆ ${nameOf(a.inst)} grew to Lv ${a.inst.level}!`, 'good');
          this.game.worldFx('sparkle', a.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffe066);
        }
        this.mgr.partyChanged(a.actor);
      }
      this.foes = this.foes.filter((f) => f !== b);
      this.mgr.releaseFoe(b.wild, 'fainted');
    } else {
      this.say(`${name} fainted!`);
      this.mgr.emit({ b: this.id, faint: b.key, text: `${name} fainted!` });
      // send out the next healthy party member
      const next = b.actor.party.find((c) => c.hp > 0 && !this.allies.some((a) => a.inst === c));
      const i = this.allies.indexOf(b);
      if (next) {
        const nb = { ...b, key: `a_${b.owner}_${next.uid}`, inst: next, stages: {}, status: null, choice: null, pos: b.pos.clone() };
        this.allies[i] = nb;
        this.say(`${b.actor.name} sends out ${nameOf(next)}!`);
        b.actor.toast(`Go, ${nameOf(next)}!`, 'good');
      } else {
        this.allies.splice(i, 1);
        b.actor.toast('All your creatures are worn out! Rest at the Farmhouse to heal them.', 'bad');
      }
      this.mgr.partyChanged(b.actor);
      this.placeAllies();
    }
  }

  _endTurn() {
    // burn damage
    for (const b of [...this.allies, ...this.foes]) {
      if (b.status === 'burn' && b.inst.hp > 0) {
        const d = Math.max(1, Math.floor(b.inst.stats.hp / 16));
        b.inst.hp = Math.max(0, b.inst.hp - d);
        this._emit({ a: b.key, burn: d, text: `${nameOf(b.inst)} is hurt by its burn! 🔥` });
        if (b.inst.hp <= 0) this._faint(b);
      }
    }
    for (const a of this.allies) a.choice = null;
    this.turn++;
    if (!this.foes.length) return this.mgr.end(this, 'win');
    if (!this.allies.length) return this.mgr.end(this, 'lose');
    this.phase = 'choose';
    this.mgr.changed();
  }

  /** Render/UI description sent to both clients. */
  describe() {
    const ally = (a) => ({
      key: a.key, owner: a.owner, ownerName: a.actor.name, sp: a.inst.species, lvl: a.inst.level, shiny: a.inst.shiny,
      name: nameOf(a.inst), hp: a.inst.hp, max: a.inst.stats.hp, status: a.status, moves: a.inst.moves, chose: !!a.choice,
      x: +a.pos.x.toFixed(2), y: +a.pos.y.toFixed(2), z: +a.pos.z.toFixed(2), yaw: +a.yaw.toFixed(2),
    });
    const foe = (f) => ({ key: f.key, nid: f.nid, sp: f.inst.species, lvl: f.inst.level, name: nameOf(f.inst), hp: f.inst.hp, max: f.inst.stats.hp, status: f.status });
    return { id: this.id, phase: this.phase, turn: this.turn, allies: this.allies.map(ally), foes: this.foes.map(foe), log: this.log.slice(-3) };
  }
}

export class BattleManager {
  constructor(game) {
    this.game = game;
    this.battles = new Map();
    this._dirty = false;
  }

  posOf(ownerId) {
    if (ownerId === 'guest') return this.game.remote?.target;
    return this.game.player.pos;
  }

  battleOf(ownerId) {
    for (const b of this.battles.values()) if (b.allies.some((a) => a.owner === ownerId)) return b;
    return null;
  }

  battleOfFoe(nid) {
    for (const b of this.battles.values()) if (b.foes.some((f) => f.nid === nid)) return b;
    return null;
  }

  /** An actor sends out their lead creature at a wild creature (start or join a battle). */
  request(actor, nid) {
    const g = this.game;
    if (this.battleOf(actor.id)) { actor.toast('You\'re already in a battle!', 'muted'); return; }
    const lead = actor.party.find((c) => c.hp > 0);
    if (!lead) { actor.toast(actor.party.length ? 'Your creatures are worn out — rest at the Farmhouse.' : 'You need a partner creature first!', 'muted'); return; }
    const c = g.creatures.list.get(nid);
    if (!c || c.captured || c.fainted) return;
    const pos = this.posOf(actor.id);
    if (pos && pos.distanceTo(c.pos) > 30) { actor.toast('Too far away — get closer!', 'muted'); return; }

    let battle = this.battleOfFoe(nid);
    if (battle) {
      if (battle.owners().length >= 2) return;
      // co-op join: bring in another nearby wild creature for a 2v2 if one is around
      const extra = [...g.creatures.list.values()].find((o) => o !== c && !o.battleId && !o.captured && !o.fainted && o.pos.distanceTo(c.pos) < 25);
      if (extra && battle.foes.length < 2) { battle.addFoe(extra); battle.say(`A wild ${extra.sp.name} joins the fight!`); }
      battle.addAlly(actor, lead);
      battle.say(`${actor.name} joins with ${nameOf(lead)}! It's a team battle!`);
      g.sharedBanner('Team battle!', `${actor.name} joined the fight`, '#ffd166', 'zone');
    } else {
      battle = new Battle(this);
      this.battles.set(battle.id, battle);
      battle.addFoe(c);
      battle.addAlly(actor, lead);
      battle.say(`A wild ${c.sp.name} (Lv ${c.inst.level}) appears! Go, ${nameOf(lead)}!`);
      c.say('!', 1.2);
      c.cry('angry');
    }
    battle.placeAllies();
    this.emit({ b: battle.id, sendOut: `a_${actor.id}_${lead.uid}`, text: `Go, ${nameOf(lead)}!` });
    this.changed();
  }

  choose(actor, moveIndex) { this.battleOf(actor.id)?.choose(actor.id, moveIndex); }

  run(actor) {
    const b = this.battleOf(actor.id);
    if (!b) return;
    b.allies = b.allies.filter((a) => a.owner !== actor.id);
    actor.toast('You got away safely.', 'muted');
    if (!b.allies.length) this.end(b, 'run');
    else { b.say(`${actor.name} ran away!`); if (b.phase === 'choose' && b.allies.every((x) => x.inst.hp <= 0 || x.choice)) b._startTurn(); this.changed(); }
  }

  /** Remove a foe from its battle (caught or gone) and end the battle if no foes remain. */
  removeFoe(nid, reason) {
    const b = this.battleOfFoe(nid);
    if (!b) return;
    b.foes = b.foes.filter((f) => f.nid !== nid);
    if (!b.foes.length) this.end(b, reason);
    else this.changed();
  }

  releaseFoe(c, why) {
    c.battleId = null;
    if (why === 'fainted') this.game.creatures.faint(c);
    else { c.cooldown = 8; c.setState('idle', 1); }
  }

  end(b, result) {
    for (const f of b.foes) this.releaseFoe(f.wild, 'release');
    const msg = { win: 'Victory! 🎉', lose: 'Your team was worn out…', run: 'Got away safely.', caught: 'Befriended! 💞' }[result] || 'Battle over.';
    this.emit({ b: b.id, end: result, text: msg });
    for (const owner of b.owners()) {
      const a = b.allies.find((x) => x.owner === owner);
      if (a && result === 'win') a.actor.toast('You won the battle!', 'good');
    }
    this.battles.delete(b.id);
    this.changed();
  }

  partyChanged(actor) { this.game.partyChanged(actor); }

  emit(ev) { this.game.battleEvent(ev); }
  changed() { this._dirty = true; }

  update(dt) {
    for (const b of this.battles.values()) {
      b.update(dt);
      // a rancher who wanders far away flees the battle
      for (const owner of b.owners()) {
        const p = this.posOf(owner);
        if (p && p.distanceTo(b.center) > 45) this.run(owner === 'guest' ? this.game.guestActor : this.game.local);
      }
    }
    if (this._dirty) {
      this._dirty = false;
      this.game.battleState([...this.battles.values()].map((b) => b.describe()));
    }
  }

  clear() {
    for (const b of [...this.battles.values()]) this.end(b, 'run');
  }
}

export { TYPES };
