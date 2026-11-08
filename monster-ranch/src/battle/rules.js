// Battle maths: damage, stat stages, status effects, XP and catch odds.
import { MOVES } from '../data/moves.js';
import { SPECIES_BY_ID } from '../data/creatures.js';
import { effectiveness } from '../data/types.js';
import { calcStats } from '../creatures/instance.js';

export const RARITY_CATCH = { common: 0.85, uncommon: 0.6, rare: 0.4, legendary: 0.25, guardian: 0 };
const RARITY_XP = { common: 50, uncommon: 80, rare: 130, legendary: 220, guardian: 400 };

export function stageMul(s) { return s >= 0 ? (2 + s) / 2 : 2 / (2 - s); }

/** Effective stat of a battler (inst + stages + status). */
export function stat(b, key) {
  let v = b.inst.stats[key] * stageMul(b.stages[key] || 0);
  if (key === 'atk' && b.status === 'burn') v *= 0.5;
  if (key === 'spd' && b.status === 'paralyze') v *= 0.5;
  return v;
}

/**
 * Resolve one move. Returns a result object describing what happened (for animation + log).
 * Mutates attacker/target battlers (hp, stages, status).
 */
export function useMove(att, tgt, moveId) {
  const m = MOVES[moveId];
  const sp = SPECIES_BY_ID[att.inst.species];
  const r = { move: moveId, type: m.type, dmg: 0, eff: 1, crit: false, miss: false, heal: 0, statMsg: null, status: null };
  if (Math.random() * 100 >= m.acc) { r.miss = true; return r; }

  if (m.power > 0) {
    const eff = effectiveness(m.type, SPECIES_BY_ID[tgt.inst.species].type);
    const stab = m.type === sp.type ? 1.25 : 1;
    const crit = Math.random() < 0.0625;
    const L = att.inst.level;
    let dmg = (((2 * L) / 5 + 2) * m.power * (stat(att, 'atk') / Math.max(1, stat(tgt, 'def')))) / 50 + 2;
    dmg *= stab * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15);
    dmg = Math.max(1, Math.floor(dmg));
    tgt.inst.hp = Math.max(0, tgt.inst.hp - dmg);
    Object.assign(r, { dmg, eff, crit });
  }
  if (m.heal) {
    const h = Math.floor(att.inst.stats.hp * m.heal);
    const before = att.inst.hp;
    att.inst.hp = Math.min(att.inst.stats.hp, att.inst.hp + h);
    r.heal = att.inst.hp - before;
  }
  if (m.stat) {
    const who = m.stat.target === 'self' ? att : tgt;
    const cur = who.stages[m.stat.stat] || 0;
    const next = Math.max(-4, Math.min(4, cur + m.stat.stages));
    who.stages[m.stat.stat] = next;
    r.statMsg = { who: m.stat.target, stat: m.stat.stat, up: m.stat.stages > 0, changed: next !== cur };
  }
  if (m.status && tgt.inst.hp > 0 && !tgt.status && Math.random() < m.status.chance) {
    tgt.status = m.status.kind;
    if (m.status.kind === 'sleep') tgt.sleepTurns = 1 + Math.floor(Math.random() * 3);
    r.status = m.status.kind;
  }
  return r;
}

/** Wild AI: mostly strongest move, sometimes a random one. */
export function pickWildMove(b, target) {
  const moves = b.inst.moves;
  if (Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
  let best = moves[0], bestScore = -1;
  for (const id of moves) {
    const m = MOVES[id];
    let s = m.power ? m.power * effectiveness(m.type, SPECIES_BY_ID[target.inst.species].type) : 25;
    if (m.heal && b.inst.hp > b.inst.stats.hp * 0.6) s = 0;
    if (s > bestScore) { bestScore = s; best = id; }
  }
  return best;
}

export function xpToNext(level) { return 20 + level * level * 2; }

export function xpReward(foeInst) {
  const sp = SPECIES_BY_ID[foeInst.species];
  return Math.max(5, Math.floor((foeInst.level * RARITY_XP[sp.rarity]) / 7));
}

/** Give XP; returns the number of levels gained. Recalculates stats, keeping damage taken. */
export function grantXp(inst, amount) {
  inst.xp += amount;
  let gained = 0;
  while (inst.xp >= xpToNext(inst.level) && inst.level < 60) {
    inst.xp -= xpToNext(inst.level);
    inst.level++;
    gained++;
  }
  if (gained) {
    const before = inst.stats.hp;
    inst.stats = calcStats(SPECIES_BY_ID[inst.species], inst.level);
    inst.hp = Math.min(inst.stats.hp, inst.hp + (inst.stats.hp - before));
  }
  return gained;
}

/**
 * Catch probability.
 * ctx: { inBattle, behind, sleeping, calm, coop, angry }
 */
export function catchChance(inst, ctx) {
  const sp = SPECIES_BY_ID[inst.species];
  const hpRatio = inst.hp / inst.stats.hp;
  let p = RARITY_CATCH[sp.rarity] * (1 - 0.72 * hpRatio);
  if (!ctx.inBattle) p *= 0.6;     // sneak throws are harder...
  if (ctx.behind) p *= 1.5;        // ...unless you get them from behind
  if (ctx.sleeping) p *= 1.4;
  if (ctx.calm) p *= 1.3;
  if (ctx.coop) p *= 1.8;          // one rancher distracted it with a treat, the other threw
  if (ctx.angry) p *= 0.75;
  return Math.max(0.03, Math.min(0.95, p));
}

/** Rare and legendary creatures only bond when both ranchers work together. */
export function needsTeamwork(inst) {
  const r = SPECIES_BY_ID[inst.species].rarity;
  return r === 'rare' || r === 'legendary';
}
