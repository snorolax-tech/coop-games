// Bond Orb catching (host-side). A thrown orb that physically hits a creature rolls for
// a catch. Odds depend on HP, rarity and mood, with bonuses for hitting from behind and for
// co-op (one rancher calmed it with a treat, the other threw). Rare and legendary
// creatures only bond through teamwork.
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../data/creatures.js';
import { catchChance, needsTeamwork, xpReward } from '../battle/rules.js';

export class Catching {
  constructor(game) {
    this.game = game;
    this.pending = [];
  }

  /** Called by a wild creature when a Bond Orb hits it. Returns 'consume' or 'bounce'. */
  attempt(c, p) {
    const g = this.game;
    if (c.captured || c.fainted) return 'bounce';
    const actor = g.actorById(p.owner);
    if (!actor) return 'bounce';
    if (c.guardian) { actor.toast(`${c.sp.name} is a Zone Guardian — it can't be caught. Calm it in battle instead!`, 'muted'); return 'bounce'; }
    const sp = c.sp;
    const battle = c.battleId ? g.battles.battles.get(c.battleId) : null;

    // hit from behind? (orb travelling the same way the creature faces)
    const v = p.vel.clone().setY(0).normalize();
    const behind = Math.sin(c.yaw) * v.x + Math.cos(c.yaw) * v.z > 0.3;
    const calm = c.calmT > 0;
    const coopTreat = calm && c.calmBy && c.calmBy !== p.owner;
    const teamBattle = !!battle && battle.owners().length >= 2;
    const ctx = { inBattle: !!battle, behind, sleeping: c.sleeping, calm, coop: coopTreat || teamBattle, angry: c.state === 'charge' };

    let ok, shakes, chance = 0;
    if (needsTeamwork(c.inst) && !((coopTreat && (behind || battle)) || teamBattle)) {
      ok = false;
      shakes = 1;
      actor.toast(`${sp.name} is too strong-willed! Rare creatures need teamwork: one rancher lures it with a treat while the other throws from behind — or battle it together.`, 'bad');
    } else {
      chance = catchChance(c.inst, ctx);
      ok = Math.random() < chance;
      shakes = ok ? 3 : Math.min(2, Math.floor(Math.random() * (1 + chance * 4)));
      const bonus = [behind && 'from behind!', coopTreat && 'co-op lure!', teamBattle && 'team battle!', c.sleeping && 'while asleep!'].filter(Boolean);
      if (bonus.length) actor.toast(`Bonus: ${bonus.join(' ')}`, 'good');
    }

    c.captured = true;
    c.sleeping = false;
    if (battle) battle.paused = true;
    const ev = { nid: c.nid, p: [c.center.x, c.center.y, c.center.z].map((n) => Math.round(n * 100) / 100), shakes, ok };
    g.catchEvent(ev);
    this.pending.push({ c, actor, ok, t: 0.7 + shakes * 0.75 + 0.35, battle, chance });
    return 'consume';
  }

  update(dt) {
    this.pending = this.pending.filter((k) => {
      k.t -= dt;
      if (k.t > 0) return true;
      this._resolve(k);
      return false;
    });
  }

  _resolve({ c, actor, ok, battle }) {
    const g = this.game;
    if (battle) battle.paused = false;
    if (!g.creatures.list.has(c.nid)) return;
    if (ok) {
      const inst = c.inst;
      inst.hp = Math.max(inst.hp, Math.ceil(inst.stats.hp * 0.3));
      // befriending is worth XP for the whole team (before the new friend joins)
      const fighter = battle ? battle.allies.find((a) => a.owner === actor.id)?.inst : null;
      g.awardPartyXp(actor, xpReward(inst), fighter, `${c.sp.name} befriended!`);
      const where = g.addCreatureTo(actor, inst);
      g.markCaught(inst.species);
      g.sharedBanner(`${actor.name} befriended ${SPECIES_BY_ID[inst.species].name}!`,
        where === 'party' ? 'It joined the party 🐾' : 'Party full — it went to the ranch 🏡', '#ff8fb8', null);
      g.battles.removeFoe(c.nid, 'caught');
      g.creatures.remove(c);
    } else {
      c.captured = false;
      c.calmT = 0;
      c.say('💢', 1.2);
      c.cry('angry');
      actor.toast(`Oh no! ${c.sp.name} broke free!`, 'bad');
      if (!battle) {
        c.focus = g.creatures.observerFor(actor);
        if (c.inst.personality === 'grumpy') c.setState('charge', 5);
        else if (c.inst.personality === 'lazy') c.setState('watch', 3);
        else c.setState('flee', 6);
      }
    }
  }
}

export { THREE };
