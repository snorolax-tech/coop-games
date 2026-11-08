// Ranch Shop catalogue and notice-board request templates.
import { ITEMS } from './items.js';
import { SPECIES } from './creatures.js';
import { CREATURE_TYPES, TYPES } from './types.js';

// Supplies: bought per player (go into the buyer's inventory).
export const SUPPLIES = [
  { id: 'orb1',  item: 'orb',   n: 1,  price: 12, label: 'Bond Orb' },
  { id: 'orb5',  item: 'orb',   n: 5,  price: 50, label: 'Bond Orb ×5 (save 10!)' },
  { id: 'treat1',item: 'treat', n: 1,  price: 6,  label: 'Tasty Treat' },
  { id: 'treat5',item: 'treat', n: 5,  price: 25, label: 'Tasty Treat ×5' },
  { id: 'berry5',item: 'berry', n: 5,  price: 15, label: 'Sweetberries ×5 (for troughs)' },
  { id: 'wood10',item: 'wood',  n: 10, price: 30, label: 'Wood ×10' },
  { id: 'stone10',item: 'stone',n: 10, price: 30, label: 'Stone ×10' },
];

// Ranch upgrades: shared by both ranchers, bought once per level.
export const UPGRADES = {
  expansion: { name: 'Ranch Expansion', icon: '🏞️', max: 3, price: [150, 300, 500], desc: '+4 creatures can roam the ranch per level.' },
  trough:    { name: 'Golden Troughs',  icon: '🥇', max: 1, price: [120], desc: 'Troughs hold 20 berries instead of 10.' },
  hay:       { name: 'Comfy Hay',       icon: '🌾', max: 1, price: [100], desc: 'Creatures in pens get happier faster.' },
  satchel:   { name: 'Egg Satchel',     icon: '🎒', max: 1, price: [80],  desc: 'Carry 6 eggs instead of 3.' },
};

// Zone passes: open a zone early, before the Ranch Rating gets there.
export const ZONE_PASSES = { forest: 200, lakeside: 350, volcano: 600 };

// ---------- notice board ----------
const BRING = ['berry', 'glowberry', 'flower', 'wood', 'stone', 'shell', 'mushroom', 'ember', 'battery', 'water', 'feather'];
const NAMES = ['Farmer Pip', 'Old Mabel', 'Ranger Tomo', 'Chef Biscuit', 'Professor Oak-Leaf', 'Little Juno', 'Captain Reed', 'Granny Fern'];

/** Make one random request suited to how far the ranch has come. */
export function makeRequest(rating, rand = Math.random) {
  const who = NAMES[Math.floor(rand() * NAMES.length)];
  const roll = rand();
  if (roll < 0.5) {
    const pool = BRING.slice(0, 4 + Math.min(BRING.length - 4, rating));
    const item = pool[Math.floor(rand() * pool.length)];
    const n = 2 + Math.floor(rand() * (3 + rating / 2));
    const reward = Math.round(15 + n * (ITEMS[item].sell || 3) * 3);
    const nm = ITEMS[item].name;
    const plural = n === 1 || /s$/.test(nm) || /^(Wood|Stone)$/.test(nm) ? nm : nm.endsWith('y') ? nm.slice(0, -1) + 'ies' : nm + 's';
    return { kind: 'bring', item, n, reward, who, text: `Bring me ${n} ${ITEMS[item].icon} ${plural}` };
  }
  if (roll < 0.85) {
    const type = CREATURE_TYPES[Math.floor(rand() * CREATURE_TYPES.length)];
    const level = Math.max(3, Math.min(40, 4 + rating * 3 + Math.floor(rand() * 5)));
    return { kind: 'show', type, level, reward: 30 + level * 4, who, text: `Show me a ${TYPES[type].icon} ${TYPES[type].name}-type at level ${level}+` };
  }
  const pool = SPECIES.filter((s) => s.rarity === 'common' || (rating >= 3 && s.rarity === 'uncommon'));
  const sp = pool[Math.floor(rand() * pool.length)];
  return { kind: 'species', species: sp.id, reward: sp.rarity === 'common' ? 45 : 90, who, text: `I'd love to meet a ${sp.name}! (in your party)` };
}
