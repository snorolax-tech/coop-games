// Things you can build on the ranch (building mode, key B).
// cost: coins + items. r = footprint radius for placement checks. kind decides behaviour.
export const BUILDINGS = {
  pen:     { name: 'Creature Pen',   icon: '🏡', kind: 'pen',    r: 5.4, paint: true, cost: { coins: 30, wood: 10 }, desc: 'A fenced home for up to 4 ranch creatures. Cozy pens keep them happy.' },
  trough:  { name: 'Feeding Trough', icon: '🥣', kind: 'trough', r: 1.6, paint: true, cost: { coins: 15, wood: 5 },  desc: 'Fill it with berries (E). Hungry creatures eat from it on their own.' },
  pond:    { name: 'Pond',           icon: '💧', kind: 'pond',   r: 4.6, cost: { coins: 40, stone: 8 }, desc: 'Splash creatures love it. Everyone enjoys the view.' },
  flowers: { name: 'Flower Bed',     icon: '🌷', kind: 'decor',  r: 1.3, cost: { coins: 5, flower: 3 }, desc: 'Decoration. Makes the ranch prettier (+happiness).' },
  lamp:    { name: 'Lamp Post',      icon: '🏮', kind: 'decor',  r: 0.8, paint: true, cost: { coins: 10, stone: 2, wood: 2 }, desc: 'Decoration that glows at night.' },
  bench:   { name: 'Bench',          icon: '🪑', kind: 'decor',  r: 1.3, paint: true, cost: { wood: 8 }, desc: 'Decoration. A nice spot to watch your creatures.' },
  sapling: { name: 'Blossom Tree',   icon: '🌸', kind: 'decor',  r: 1.4, cost: { coins: 8, wood: 2, flower: 2 }, desc: 'Decoration. Pretty pink blossoms.' },
  statue:  { name: 'Creature Statue',icon: '🗿', kind: 'decor',  r: 1.3, paint: true, cost: { coins: 25, stone: 10 }, desc: 'Decoration. A proud statue of a creature.' },
  breeder: { name: 'Breeding Pen',   icon: '💞', kind: 'special', r: 3.8, cost: { coins: 60, wood: 15, stone: 5 }, desc: 'Put two compatible, happy ranch creatures here (Barn) and they\'ll lay an egg.' },
  incubator:{ name: 'Incubator',     icon: '🥚', kind: 'special', r: 1.4, cost: { coins: 40, stone: 5, battery: 1 }, desc: 'Bring an egg here (E) to keep it warm until it hatches.' },
  trainyard:{ name: 'Training Yard', icon: '🏋️', kind: 'special', r: 4.6, cost: { coins: 35, wood: 12 }, desc: 'Ranch creatures assigned here (Barn) gain XP over time.' },

  // ---- paths, fences & walls (snap to a 2 m grid so they line up) ----
  fence:    { name: 'Fence',          icon: '🚧', kind: 'wall',  r: 0.45, grid: 1, paint: true, cost: { wood: 1 }, desc: 'A 2 m fence piece. Line them up to fence off areas.' },
  wall:     { name: 'Stone Wall',     icon: '🧱', kind: 'wall',  r: 0.45, grid: 1, paint: true, cost: { stone: 2 }, desc: 'A sturdy 2 m stone wall piece.' },
  hedge:    { name: 'Hedge',          icon: '🌳', kind: 'wall',  r: 0.45, grid: 1, paint: true, cost: { coins: 2, flower: 1 }, desc: 'A leafy 2 m hedge piece.' },
  pathDirt: { name: 'Dirt Path',      icon: '🟫', kind: 'floor', r: 0.9, grid: 2, cost: { coins: 1 }, desc: 'A 2×2 m path tile. Walk-through.' },
  pathStone:{ name: 'Stone Path',     icon: '⬜', kind: 'floor', r: 0.9, grid: 2, paint: true, cost: { stone: 1 }, desc: 'A 2×2 m cobblestone tile.' },
  deck:     { name: 'Wooden Deck',    icon: '🟧', kind: 'floor', r: 0.9, grid: 2, paint: true, cost: { wood: 1 }, desc: 'A 2×2 m wooden floor tile.' },

  // ---- more decorations ----
  fountain: { name: 'Fountain',       icon: '⛲', kind: 'decor', r: 1.8, paint: true, cost: { coins: 30, stone: 8 }, desc: 'A splashing stone fountain.' },
  windmill: { name: 'Windmill',       icon: '🌬️', kind: 'decor', r: 1.8, paint: true, cost: { coins: 40, wood: 12, stone: 4 }, desc: 'A little windmill with spinning sails.' },
  haybale:  { name: 'Hay Bale',       icon: '🌾', kind: 'decor', r: 0.8, cost: { coins: 2 }, desc: 'Stack them around the farm.' },
  scarecrow:{ name: 'Scarecrow',      icon: '🎃', kind: 'decor', r: 0.6, paint: true, cost: { coins: 4, wood: 2 }, desc: 'A friendly scarecrow (the creatures aren\'t scared).' },
  campfire: { name: 'Campfire',       icon: '🔥', kind: 'decor', r: 1.1, cost: { wood: 3, stone: 2 }, desc: 'A cozy crackling fire.' },
  picnic:   { name: 'Picnic Table',   icon: '🧺', kind: 'decor', r: 1.4, paint: true, cost: { wood: 6 }, desc: 'Lunch with your creatures.' },
  crates:   { name: 'Crates',         icon: '📦', kind: 'decor', r: 0.9, paint: true, cost: { wood: 2 }, desc: 'A stack of wooden crates.' },
  barrel:   { name: 'Barrel',         icon: '🛢️', kind: 'decor', r: 0.6, paint: true, cost: { wood: 2 }, desc: 'A barrel. Rain water? Berry juice?' },
  mailbox:  { name: 'Mailbox',        icon: '📮', kind: 'decor', r: 0.5, paint: true, cost: { coins: 5, wood: 1 }, desc: 'Your very own ranch mailbox.' },
  signpost: { name: 'Signpost',       icon: '🪧', kind: 'decor', r: 0.7, paint: true, cost: { wood: 2 }, desc: 'Write anything on it (E on the sign to edit).' },
  rocks:    { name: 'Rock Garden',    icon: '🪨', kind: 'decor', r: 1.4, cost: { stone: 4 }, desc: 'Raked sand and pretty stones.' },
  shrooms:  { name: 'Mushroom Ring',  icon: '🍄', kind: 'decor', r: 1.4, paint: true, cost: { coins: 6, mushroom: 2 }, desc: 'A fairy ring that glows at night.' },
  arch:     { name: 'Flower Arch',    icon: '💐', kind: 'decor', r: 0.6, paint: true, cost: { coins: 8, wood: 2, flower: 3 }, desc: 'A pretty arch to walk through.' },
  pine:     { name: 'Pine Tree',      icon: '🌲', kind: 'decor', r: 1.2, cost: { coins: 6, wood: 2 }, desc: 'An evergreen tree.' },

  // ---- lights ----
  torch:    { name: 'Torch',          icon: '🕯️', kind: 'decor', r: 0.4, cost: { wood: 1 }, desc: 'A flickering torch.' },
  lanterns: { name: 'Lantern String', icon: '🏮', kind: 'decor', r: 0.6, grid: 2, paint: true, cost: { coins: 6, wood: 2 }, desc: 'Glowing lanterns strung between two posts.' },
};

// Build menu categories (Z / C to switch in build mode).
export const CATEGORIES = [
  { id: 'farm',   name: 'Farm',     icon: '🏡', items: ['pen', 'trough', 'pond', 'breeder', 'incubator', 'trainyard'] },
  { id: 'paths',  name: 'Paths & Fences', icon: '🚧', items: ['fence', 'wall', 'hedge', 'pathDirt', 'pathStone', 'deck'] },
  { id: 'decor',  name: 'Decor',    icon: '🌷', items: ['flowers', 'bench', 'sapling', 'pine', 'statue', 'fountain', 'windmill', 'haybale', 'scarecrow'] },
  { id: 'decor2', name: 'More Decor', icon: '🧺', items: ['campfire', 'picnic', 'crates', 'barrel', 'mailbox', 'signpost', 'rocks', 'shrooms', 'arch'] },
  { id: 'lights', name: 'Lights',   icon: '🏮', items: ['lamp', 'torch', 'lanterns'] },
];

export const BUILD_ORDER = CATEGORIES.flatMap((c) => c.items);

// Paint palette (P cycles). null = the piece's natural colours.
export const PAINTS = [null, '#ffffff', '#2b2d42', '#ef476f', '#f3722c', '#ffd166', '#06d6a0', '#118ab2', '#4361ee', '#9b5de5', '#ff8fb8', '#8b5a2b'];

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
