// The six creature types, their matchups, and co-op combo attacks.
export const TYPES = {
  flame:  { name: 'Flame',  color: '#ff7b2e', icon: '🔥' },
  splash: { name: 'Splash', color: '#3a9cff', icon: '💧' },
  leaf:   { name: 'Leaf',   color: '#52c95a', icon: '🍃' },
  spark:  { name: 'Spark',  color: '#f5c400', icon: '⚡' },
  stone:  { name: 'Stone',  color: '#a68a64', icon: '🪨' },
  breeze: { name: 'Breeze', color: '#6fd6f5', icon: '🌀' },
  neutral:{ name: 'Neutral',color: '#b8b8c8', icon: '⭐' }, // basic moves only
};

export const CREATURE_TYPES = ['flame', 'splash', 'leaf', 'spark', 'stone', 'breeze'];

// attacker -> { strong: [defenders taking 2x], weak: [defenders taking 0.5x] }
export const CHART = {
  flame:  { strong: ['leaf', 'breeze'],  weak: ['splash', 'stone'] },
  splash: { strong: ['flame', 'stone'],  weak: ['leaf', 'splash'] },
  leaf:   { strong: ['splash', 'stone'], weak: ['flame', 'breeze'] },
  spark:  { strong: ['splash', 'breeze'],weak: ['stone', 'leaf'] },
  stone:  { strong: ['flame', 'spark'],  weak: ['leaf', 'splash'] },
  breeze: { strong: ['leaf', 'spark'],   weak: ['stone', 'flame'] },
};

export function effectiveness(attackType, defendType) {
  const c = CHART[attackType];
  if (!c) return 1;
  if (c.strong.includes(defendType)) return 2;
  if (c.weak.includes(defendType)) return 0.5;
  return 1;
}

// Two different types used in the same turn trigger a combo (Stage 6).
export const COMBOS = [
  { types: ['flame', 'breeze'], name: 'Firestorm', power: 140 },
  { types: ['splash', 'spark'], name: 'Thunder Rain', power: 140 },
  { types: ['leaf', 'stone'], name: 'Landslide', power: 140 },
  { types: ['flame', 'stone'], name: 'Magma Burst', power: 130 },
  { types: ['splash', 'leaf'], name: 'Blossom Downpour', power: 130 },
  { types: ['spark', 'breeze'], name: 'Storm Surge', power: 130 },
  { types: ['flame', 'spark'], name: 'Plasma Flare', power: 130 },
  { types: ['splash', 'breeze'], name: 'Typhoon', power: 130 },
  { types: ['leaf', 'breeze'], name: 'Petal Cyclone', power: 120 },
  { types: ['stone', 'spark'], name: 'Crystal Shock', power: 120 },
];

export function findCombo(a, b) {
  if (a === b) return null;
  return COMBOS.find((c) => c.types.includes(a) && c.types.includes(b)) || null;
}

export const PERSONALITIES = {
  lazy:    { name: 'Lazy',    icon: '😴', desc: 'Naps a lot and barely notices you.' },
  playful: { name: 'Playful', icon: '😄', desc: 'Curious. Follows you around.' },
  grumpy:  { name: 'Grumpy',  icon: '😠', desc: 'Charges at anyone who gets too close!' },
  shy:     { name: 'Shy',     icon: '😳', desc: 'Runs away when it spots you.' },
};

export const RARITY = {
  common:    { name: 'Common',    stars: 1, color: '#9aa5b1', weight: 10 },
  uncommon:  { name: 'Uncommon',  stars: 2, color: '#06d6a0', weight: 4 },
  rare:      { name: 'Rare',      stars: 3, color: '#9b5de5', weight: 1 },
  legendary: { name: 'Legendary', stars: 4, color: '#ffb703', weight: 0 },
};
