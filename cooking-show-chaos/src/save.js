// Progress saved in localStorage (per browser).
const KEY = 'cookingShowChaos.save.v1';

export const UPGRADES = [
  { id: 'knife', icon: '🔪', name: 'Sharp Knives', desc: 'Chop faster. Much faster.', prices: [60, 150] },
  { id: 'pan', icon: '🍳', name: 'Fire-Proof Cookware', desc: 'Pots & pans never burst into flames (food still burns!)', prices: [180] },
  { id: 'ext', icon: '🧯', name: 'Mega Extinguisher', desc: 'More range, more foam, less fire', prices: [100, 220] },
  { id: 'cam', icon: '🎥', name: 'Better Camera', desc: 'Wider lens, +30s of tape, more hype per shot', prices: [90, 240] },
];

export const SETS = [
  { id: 'classic', icon: '📺', name: 'Studio Kitchen', price: 0, desc: 'The classic. Mostly stable.' },
  { id: 'boat', icon: '⛵', name: 'Rocking Boat Galley', price: 300, desc: 'Everything slides around. Bring sea legs.' },
  { id: 'bbq', icon: '🌭', name: 'Windy Backyard BBQ', price: 450, desc: 'Outdoors. Wind gusts. Way more fires.' },
];

function defaults() {
  return {
    money: 0, episodes: 0, fans: 0, bestViewers: 0, totalEarned: 0,
    upgrades: { knife: 0, pan: 0, ext: 0, cam: 0 },
    sets: { classic: true, boat: false, bbq: false },
    lastSet: 'classic',
    settings: { sens: 1, volume: 0.6 },
    name: '',
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = defaults(); const s = JSON.parse(raw);
    return { ...d, ...s, upgrades: { ...d.upgrades, ...s.upgrades }, sets: { ...d.sets, ...s.sets }, settings: { ...d.settings, ...s.settings } };
  } catch { return defaults(); }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full / private mode */ }
}

export function upgradePrice(save, upg) {
  const lvl = save.upgrades[upg.id] || 0;
  return lvl < upg.prices.length ? upg.prices[lvl] : null;
}
