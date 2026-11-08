// Item catalogue. `icon` is a short emoji used only in the 2D UI.
export const ITEMS = {
  orb:       { name: 'Bond Orb',    icon: '🔵', desc: 'Throw it at a weakened creature to befriend it.', sell: 0 },
  treat:     { name: 'Tasty Treat', icon: '🍬', desc: 'Throw it to lure or calm a creature.', sell: 0 },
  berry:     { name: 'Sweetberry',  icon: '🍒', desc: 'A juicy red berry. Most creatures love these.', sell: 2 },
  glowberry: { name: 'Glowberry',   icon: '✨', desc: 'A berry that shines softly at night.', sell: 6 },
  flower:    { name: 'Wildflower',  icon: '🌼', desc: 'Pretty! Good for decorations and gifts.', sell: 3 },
  wood:      { name: 'Wood',        icon: '🪵', desc: 'Sturdy logs for building.', sell: 2 },
  stone:     { name: 'Stone',       icon: '🪨', desc: 'Solid stone for building.', sell: 2 },
  ember:     { name: 'Emberstone',  icon: '🔥', desc: 'A warm rock from the Cinder Hills.', sell: 8 },
  shell:     { name: 'Shimmer Shell', icon: '🐚', desc: 'Found by the lake. Very shiny.', sell: 5 },
  mushroom:  { name: 'Puffcap',     icon: '🍄', desc: 'A bouncy forest mushroom.', sell: 4 },
};

// Held tools / throwables in the hotbar (keys 1-5).
export const HOTBAR = [
  { id: 'orb',   name: 'Bond Orb',     icon: '🔵', kind: 'throw', item: 'orb' },
  { id: 'treat', name: 'Tasty Treat',  icon: '🍬', kind: 'throw', item: 'treat' },
  { id: 'brush', name: 'Brush',        icon: '🪮', kind: 'tool' },
  { id: 'can',   name: 'Watering Can', icon: '🚿', kind: 'tool' },
  { id: 'hammer',name: 'Hammer',       icon: '🔨', kind: 'tool' },
];

export function newInventory() {
  return { orb: 10, treat: 6, berry: 0, glowberry: 0, flower: 0, wood: 0, stone: 0, ember: 0, shell: 0, mushroom: 0, coins: 50 };
}
