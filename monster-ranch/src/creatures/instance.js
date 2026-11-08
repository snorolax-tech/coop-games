// A single creature "individual": species + level + personality + stats + moves.
import { SPECIES_BY_ID } from '../data/creatures.js';
import { PERSONALITIES } from '../data/types.js';

export const PERSONALITY_IDS = Object.keys(PERSONALITIES);
let uidCounter = 0;
export const SHINY_CHANCE = 1 / 128;

export function calcStats(sp, level) {
  const b = sp.base;
  return {
    hp: Math.floor((b.hp * 2 * level) / 50) + level + 10,
    atk: Math.floor((b.atk * 2 * level) / 50) + 5,
    def: Math.floor((b.def * 2 * level) / 50) + 5,
    spd: Math.floor((b.spd * 2 * level) / 50) + 5,
  };
}

export function createCreature(speciesId, level, opts = {}) {
  const sp = SPECIES_BY_ID[speciesId];
  const personality = opts.personality
    || (Math.random() < 0.6 ? sp.personality : PERSONALITY_IDS[Math.floor(Math.random() * PERSONALITY_IDS.length)]);
  const stats = calcStats(sp, level);
  return {
    uid: opts.uid || `${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    species: speciesId,
    level,
    xp: 0,
    personality,
    happiness: 70,
    shiny: opts.shiny ?? Math.random() < SHINY_CHANCE,
    nickname: null,
    moves: [...sp.moves],
    stats,
    hp: stats.hp,
  };
}

export function displayName(c) {
  return c.nickname || SPECIES_BY_ID[c.species].name;
}
