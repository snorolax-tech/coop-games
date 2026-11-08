// Things you can build on the ranch (building mode, key B).
// cost: coins + items. r = footprint radius for placement checks. kind decides behaviour.
export const BUILDINGS = {
  pen:     { name: 'Creature Pen',   icon: '🏡', kind: 'pen',    r: 5.4, cost: { coins: 30, wood: 10 }, desc: 'A fenced home for up to 4 ranch creatures. Cozy pens keep them happy.' },
  trough:  { name: 'Feeding Trough', icon: '🥣', kind: 'trough', r: 1.6, cost: { coins: 15, wood: 5 },  desc: 'Fill it with berries (E). Hungry creatures eat from it on their own.' },
  pond:    { name: 'Pond',           icon: '💧', kind: 'pond',   r: 4.6, cost: { coins: 40, stone: 8 }, desc: 'Splash creatures love it. Everyone enjoys the view.' },
  flowers: { name: 'Flower Bed',     icon: '🌷', kind: 'decor',  r: 1.3, cost: { coins: 5, flower: 3 }, desc: 'Decoration. Makes the ranch prettier (+happiness).' },
  lamp:    { name: 'Lamp Post',      icon: '🏮', kind: 'decor',  r: 0.8, cost: { coins: 10, stone: 2, wood: 2 }, desc: 'Decoration that glows at night.' },
  bench:   { name: 'Bench',          icon: '🪑', kind: 'decor',  r: 1.3, cost: { wood: 8 }, desc: 'Decoration. A nice spot to watch your creatures.' },
  sapling: { name: 'Blossom Tree',   icon: '🌸', kind: 'decor',  r: 1.4, cost: { coins: 8, wood: 2, flower: 2 }, desc: 'Decoration. Pretty pink blossoms.' },
  statue:  { name: 'Creature Statue',icon: '🗿', kind: 'decor',  r: 1.3, cost: { coins: 25, stone: 10 }, desc: 'Decoration. A proud statue of a creature.' },
  breeder: { name: 'Breeding Pen',   icon: '💞', kind: 'special', r: 3.8, cost: { coins: 60, wood: 15, stone: 5 }, desc: 'Put two compatible, happy ranch creatures here (Barn) and they\'ll lay an egg.' },
  incubator:{ name: 'Incubator',     icon: '🥚', kind: 'special', r: 1.4, cost: { coins: 40, stone: 5, battery: 1 }, desc: 'Bring an egg here (E) to keep it warm until it hatches.' },
  trainyard:{ name: 'Training Yard', icon: '🏋️', kind: 'special', r: 4.6, cost: { coins: 35, wood: 12 }, desc: 'Ranch creatures assigned here (Barn) gain XP over time.' },
};

export const BUILD_ORDER = ['pen', 'trough', 'pond', 'flowers', 'lamp', 'bench', 'sapling', 'statue', 'breeder', 'incubator', 'trainyard'];

export const BREED_TIME = 150;   // seconds for a compatible pair to lay an egg
export const HATCH_TIME = 120;   // seconds in the incubator
export const TRAIN_TICK = 20;    // seconds between training XP gains
export const MAX_TRAINEES = 4;

// What happy ranch creatures produce, by type.
export const PRODUCE = {
  leaf:   { item: 'berry',   n: 2, msg: 'grew some berries' },
  spark:  { item: 'battery', n: 1, msg: 'charged a battery' },
  splash: { item: 'water',   n: 1, msg: 'filled a water bucket' },
  flame:  { item: 'ember',   n: 1, msg: 'warmed an emberstone' },
  stone:  { item: 'stone',   n: 2, msg: 'dug up some stone' },
  breeze: { item: 'feather', n: 1, msg: 'dropped a fluffy feather' },
};

export const PEN_CAPACITY = 4;
export const RANCH_BASE_CAPACITY = 6;
