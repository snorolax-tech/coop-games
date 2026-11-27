// The crafting engine. There are no recipes: every junk item has PROPERTIES, and combining
// items adds their properties together. analyze() then decides what you built (a spear,
// a flamethrower, a spinning blade trap...), its stats, effects and a generated name.
// Anything can be combined with anything, including things you already crafted.
import * as THREE from 'three';

export const PROPS = ['sharp', 'blunt', 'long', 'hollow', 'sturdy', 'flammable', 'spark', 'liquid', 'explosive',
  'electric', 'sticky', 'spin', 'bouncy', 'launch', 'magnetic', 'fragment', 'toxic', 'noise', 'light', 'heal'];

export const PROP_INFO = {
  sharp: ['🔪', '#ff6b6b'], blunt: ['🔨', '#c9a27a'], long: ['📏', '#a0c4ff'], hollow: ['⭕', '#bdb2ff'],
  sturdy: ['🧱', '#b0b0b0'], flammable: ['🔥', '#ff9f1c'], spark: ['✨', '#ffd166'], liquid: ['💧', '#4cc9f0'],
  explosive: ['💥', '#ef476f'], electric: ['⚡', '#ffe066'], sticky: ['🩹', '#e9c46a'], spin: ['🌀', '#90e0ef'],
  bouncy: ['🟢', '#80ed99'], launch: ['🚀', '#f4a261'], magnetic: ['🧲', '#e63946'], fragment: ['📌', '#adb5bd'],
  toxic: ['☣', '#a7c957'], noise: ['📢', '#f28482'], light: ['💡', '#fff3b0'], heal: ['➕', '#7bf1a8'],
};

// shape: how the item's little mesh is built (see baseMesh)
export const BASE = {
  pipe:      { name: 'Metal Pipe', props: { long: 2, blunt: 2, hollow: 1, sturdy: 1 }, shape: ['cyl', 0.06, 1.2, 0x8d939c] },
  bat:       { name: 'Baseball Bat', props: { blunt: 3, long: 1 }, shape: ['bat', 0.07, 1.0, 0xb5835a] },
  knife:     { name: 'Kitchen Knife', props: { sharp: 2 }, shape: ['blade', 0.04, 0.35, 0xdddddd] },
  machete:   { name: 'Machete', props: { sharp: 3, long: 1 }, shape: ['blade', 0.07, 0.7, 0xcfd3d8] },
  nails:     { name: 'Box of Nails', props: { fragment: 2, sharp: 1 }, shape: ['box', 0.2, 0.12, 0x6c757d] },
  bottle:    { name: 'Glass Bottle', props: { hollow: 1, fragment: 1 }, shape: ['bottle', 0.07, 0.3, 0x3a7d44] },
  gascan:    { name: 'Gas Can', props: { flammable: 3, liquid: 2 }, shape: ['box', 0.3, 0.35, 0xd62828] },
  lighter:   { name: 'Lighter', props: { spark: 2 }, shape: ['box', 0.05, 0.1, 0xffb703] },
  battery:   { name: 'Battery', props: { electric: 2 }, shape: ['cyl', 0.05, 0.15, 0x2a9d8f] },
  carbatt:   { name: 'Car Battery', props: { electric: 4, blunt: 1 }, shape: ['box', 0.3, 0.25, 0x222222] },
  tape:      { name: 'Duct Tape', props: { sticky: 2 }, shape: ['ring', 0.12, 0.08, 0x9aa0a6] },
  glue:      { name: 'Super Glue', props: { sticky: 2, liquid: 1 }, shape: ['bottle', 0.04, 0.15, 0xffffff] },
  fan:       { name: 'Desk Fan', props: { spin: 2, electric: 1 }, shape: ['fan', 0.25, 0.3, 0x48cae4] },
  mowblade:  { name: 'Lawnmower Blade', props: { sharp: 2, spin: 2 }, shape: ['flat', 0.6, 0.1, 0x6c757d] },
  sawblade:  { name: 'Saw Blade', props: { sharp: 3, spin: 1 }, shape: ['disc', 0.25, 0.03, 0xe0e0e0] },
  drill:     { name: 'Power Drill', props: { spin: 3, electric: 1, sharp: 1 }, shape: ['drill', 0.12, 0.35, 0xffc300] },
  spring:    { name: 'Big Spring', props: { bouncy: 2, launch: 1 }, shape: ['spring', 0.1, 0.3, 0xdddd55] },
  firework:  { name: 'Firework Rocket', props: { explosive: 1, launch: 2, flammable: 1 }, shape: ['rocket', 0.06, 0.5, 0xff006e] },
  propane:   { name: 'Propane Tank', props: { explosive: 3, flammable: 2, blunt: 1 }, shape: ['cyl', 0.18, 0.45, 0xf1faee] },
  magnet:    { name: 'Big Magnet', props: { magnetic: 3 }, shape: ['magnet', 0.2, 0.2, 0xd62828] },
  plank:     { name: 'Wood Plank', props: { sturdy: 2, blunt: 1, long: 1 }, shape: ['plank', 0.25, 1.1, 0xa47148] },
  scrap:     { name: 'Scrap Metal', props: { sturdy: 2, fragment: 1, blunt: 1 }, shape: ['flat', 0.4, 0.4, 0x7d8597] },
  chain:     { name: 'Chain', props: { blunt: 2, long: 2 }, shape: ['chain', 0.05, 0.9, 0x9a9a9a] },
  brick:     { name: 'Brick', props: { blunt: 2, sturdy: 1 }, shape: ['box', 0.22, 0.1, 0xb5523b] },
  bleach:    { name: 'Bleach', props: { toxic: 3, liquid: 1 }, shape: ['bottle', 0.08, 0.3, 0xf8f9fa] },
  bandage:   { name: 'Bandages', props: { heal: 2 }, shape: ['ring', 0.08, 0.1, 0xf8f9fa] },
  pills:     { name: 'Painkillers', props: { heal: 1 }, shape: ['bottle', 0.04, 0.1, 0xf77f00] },
  medkit:    { name: 'First Aid Kit', props: { heal: 4 }, shape: ['box', 0.3, 0.2, 0xe63946] },
  flashlight:{ name: 'Flashlight', props: { light: 3 }, shape: ['cyl', 0.05, 0.3, 0x343a40] },
  alarm:     { name: 'Alarm Clock', props: { noise: 2 }, shape: ['box', 0.15, 0.12, 0xe9c46a] },
  rake:      { name: 'Garden Rake', props: { long: 2, sharp: 1 }, shape: ['rake', 0.05, 1.3, 0x7f5539] },
  pan:       { name: 'Frying Pan', props: { blunt: 2, sturdy: 1 }, shape: ['pan', 0.2, 0.3, 0x2b2d42] },
  fence:     { name: 'Fence Panel', props: { sturdy: 3, long: 1 }, shape: ['plank', 0.6, 1.0, 0xddb892] },
  wire:      { name: 'Copper Wire', props: { electric: 1, long: 1 }, shape: ['ring', 0.1, 0.05, 0xb87333] },
  bowling:   { name: 'Bowling Ball', props: { blunt: 3, bouncy: 1 }, shape: ['ball', 0.15, 0.3, 0x3a0ca3] },
  rope:      { name: 'Rope', props: { long: 1, sticky: 1 }, shape: ['ring', 0.12, 0.08, 0xc9a66b] },
  bucket:    { name: 'Bucket', props: { hollow: 2 }, shape: ['cyl', 0.15, 0.25, 0x6c757d] },
};

export const MAX_PARTS = 6;

// ------------------------------------------------------------------ repairing & reloading
// Melee weapons get patched up, launchers get reloaded with junk, flamethrowers get refuelled.
const PATCH = { tape: 0.5, glue: 0.6, scrap: 0.4, wire: 0.3, rope: 0.3, nails: 0.25 };
/** can `mat` (a single base item) fix up `target`? returns {amount, label} or null */
export function repairInfo(target, mat) {
  if (!target || !mat || mat.parts.length !== 1) return null;
  const a = analyze(target.parts);
  const id = mat.parts[0];
  if (target.uses >= a.maxUses) return null;
  const missing = a.maxUses - target.uses;
  if (a.form === 'melee' && PATCH[id]) {
    const amount = Math.min(missing, Math.ceil(a.maxUses * PATCH[id]));
    return { amount, label: `Repair: +${amount} durability` };
  }
  if (a.form === 'gun') {
    const P = BASE[id].props;
    const shots = (P.fragment || 0) * 2 + (P.blunt || 0) + (P.explosive || 0) * 3 + (P.launch || 0) * 2 + (P.sharp || 0);
    if (!shots) return null;
    const amount = Math.min(missing, shots + 1);
    return { amount, label: `Reload: +${amount} shots` };
  }
  if (a.form === 'flamer' && (BASE[id].props.flammable || 0) >= 2) {
    const amount = Math.min(missing, BASE[id].props.flammable * 40);
    return { amount, label: `Refuel: +${(amount / 10).toFixed(1)}s of fuel` };
  }
  return null;
}
/** which of two items is the thing being fixed, and which is the material */
export function repairPair(a, b) {
  const r1 = repairInfo(a, b);
  if (r1) return { target: a, mat: b, ...r1 };
  const r2 = repairInfo(b, a);
  if (r2) return { target: b, mat: a, ...r2 };
  return null;
}
let uidCounter = Math.floor(Math.random() * 1e6) * 100;
export const newUid = () => ++uidCounter;

/** item = { uid, parts: [baseId, ...], uses } */
export function makeItem(parts, uses) {
  const it = { uid: newUid(), parts: [...parts] };
  it.uses = uses ?? analyze(it.parts).maxUses;
  return it;
}
export function combine(items) {
  const parts = items.flatMap((i) => i.parts).slice(0, MAX_PARTS);
  return makeItem(parts);
}

const cache = new Map();
/** Works out what a set of parts IS. Deterministic so both players agree. */
export function analyze(parts) {
  const key = parts.join(',');
  if (cache.has(key)) return cache.get(key);
  const P = Object.fromEntries(PROPS.map((p) => [p, 0]));
  for (const id of parts) for (const [k, v] of Object.entries(BASE[id].props)) P[k] += v;
  const n = parts.length;
  const dmgProps = P.sharp + P.blunt + P.explosive + P.fragment + P.toxic + P.electric;

  let form;
  if (P.heal > 0 && P.heal * 2 >= dmgProps) form = 'heal';
  else if (P.sturdy >= 3 && !P.launch && !P.spin) form = 'wall';
  else if (P.spin >= 2 && (P.sharp > 0 || P.blunt > 0) && n > 1 && P.long < 2) form = 'trap';
  else if (P.magnetic >= 2) form = 'magnet';
  else if (P.launch >= 1 && (P.hollow >= 1 || P.long >= 2) && n > 1) form = 'gun';
  else if (P.hollow >= 1 && P.flammable >= 2 && P.spark >= 1) form = 'flamer';
  else if (P.explosive > 0 && P.bouncy > 0 && n > 1) form = 'mine';
  else if (P.explosive > 0 || P.flammable >= 2 || P.toxic >= 2 || P.noise >= 1) form = 'throw';
  else form = 'melee';

  const fx = {
    fire: P.flammable > 0 && (P.spark > 0 || P.explosive > 0 || form === 'flamer') ? 2 + P.flammable : form === 'throw' && P.flammable >= 2 ? 2 + P.flammable : 0,
    shock: P.electric > 0 ? 0.6 + P.electric * 0.35 : 0,
    chain: P.electric >= 3 ? Math.min(4, P.electric - 1) : 0,
    poison: P.toxic > 0 ? P.toxic * 2.5 : 0,
    bleed: P.fragment > 0 || P.sharp >= 3 ? 2 + P.fragment * 2 : 0,
    slow: P.sticky > 0 ? 1 + P.sticky : 0,
    kb: 2 + P.blunt * 1.4 + P.bouncy * 5,
    pull: P.magnetic,
    lure: P.noise,
  };
  const s = { form, P, n, fx, light: P.light };

  switch (form) {
    case 'melee':
      s.dmg = 6 + P.sharp * 6 + P.blunt * 4.5 + P.fragment * 2 + P.spin * 3;
      s.reach = Math.min(4.2, 2 + P.long * 0.55);
      s.cd = 0.4 + (P.blunt + P.sturdy) * 0.045;
      s.arc = 70 + P.long * 8 + P.spin * 10;
      s.maxUses = Math.round(20 + P.sturdy * 10 + P.blunt * 3 + n * 3);
      break;
    case 'gun':
      s.dmg = 10 + P.fragment * 6 + P.sharp * 4 + P.blunt * 4;
      s.radius = P.explosive ? 2.5 + P.explosive * 1.3 : 0;
      s.speed = 32 + P.launch * 8;
      s.cd = 0.35 + P.explosive * 0.25 + P.blunt * 0.05;
      s.maxUses = 6 + P.launch * 3 + P.hollow * 2;
      break;
    case 'flamer':
      s.dps = 26 + P.spark * 6 + P.flammable * 2;
      s.reach = 7 + P.long * 0.6;
      s.maxUses = Math.round((P.flammable * 3 + P.liquid * 2) * 10); // tenths of a second of fuel
      break;
    case 'throw':
      s.radius = 2.5 + P.explosive * 1.5 + (P.toxic ? 1.5 : 0) + (P.flammable >= 2 ? 1 : 0);
      s.dmg = P.explosive * 22 + P.fragment * 8 + P.blunt * 5 + P.sharp * 4;
      s.fuse = P.noise ? 4 : P.sticky ? 1.5 : 0;
      s.maxUses = 1;
      break;
    case 'mine':
      s.radius = 3 + P.explosive * 1.5;
      s.dmg = 30 + P.explosive * 22 + P.fragment * 8;
      s.maxUses = 1;
      break;
    case 'trap':
      s.dps = 9 + P.sharp * 6 + P.blunt * 3 + P.spin * 2;
      s.radius = 1.8 + P.long * 0.35;
      s.hp = 22 + P.sturdy * 10 + n * 4; // seconds of grinding
      s.maxUses = 1;
      break;
    case 'magnet':
      s.radius = 10 + P.magnetic * 1.5;
      s.dps = P.sharp * 8 + P.fragment * 5 + P.blunt * 3;
      s.hp = 20 + P.sturdy * 8 + P.magnetic * 3;
      s.maxUses = 1;
      break;
    case 'wall':
      s.hp = P.sturdy * 38 + P.blunt * 10 + n * 8;
      s.width = Math.min(6, 2.4 + P.long * 0.5);
      s.thorns = (P.sharp + P.fragment) * 6;
      s.maxUses = 1;
      break;
    case 'heal':
      s.amount = P.heal * 18;
      s.maxUses = 1;
      break;
  }
  s.name = nameFor(parts, s);
  s.desc = describe(s);
  cache.set(key, s);
  return s;
}

const ADJ = [
  ['fire', 'Flaming'], ['shock', 'Shocking'], ['poison', 'Toxic'], ['slow', 'Sticky'],
];
function nameFor(parts, s) {
  const { P, form, n, fx } = s;
  if (n === 1) return BASE[parts[0]].name;
  let noun;
  switch (form) {
    case 'melee':
      noun = P.spin >= 2 ? 'Drill Lance' : P.long >= 2 && P.sharp ? 'Spear' : P.long >= 3 && P.blunt ? 'Flail' : P.sharp >= 3 ? 'Cleaver'
        : P.sharp ? 'Shank' : P.blunt >= 4 ? 'Sledge' : P.blunt >= 2 ? (P.long ? 'Club' : 'Mace') : 'Thing';
      if (P.fragment && P.blunt) noun = 'Spiked ' + noun;
      break;
    case 'gun': noun = P.explosive ? 'Rocket Launcher' : P.electric ? 'Tesla Cannon' : P.fragment ? 'Nail Gun' : P.flammable ? 'Fireball Launcher' : P.toxic ? 'Gas Launcher' : 'Junk Cannon'; break;
    case 'flamer': noun = 'Flamethrower'; break;
    case 'throw': noun = P.noise ? 'Screaming Decoy' : P.explosive >= 3 ? 'Mega Bomb' : P.explosive ? (P.fragment ? 'Shrapnel Grenade' : 'Bomb') : P.toxic ? 'Gas Bomb' : P.flammable ? 'Molotov' : 'Junk Bomb'; break;
    case 'mine': noun = 'Bouncing Mine'; break;
    case 'trap': noun = P.spin >= 4 ? 'Shredder' : 'Blender Trap'; break;
    case 'magnet': noun = P.sharp || P.fragment ? 'Spike Magnet' : 'Zombie Magnet'; break;
    case 'wall': noun = P.sharp || P.fragment ? 'Spiked Barricade' : P.sturdy >= 6 ? 'Fortress Wall' : 'Barricade'; break;
    case 'heal': noun = P.heal >= 5 ? 'Mega Medkit' : 'Patch-Up Kit'; break;
  }
  const adjs = [];
  for (const [k, a] of ADJ) if (fx[k] && !noun.includes(a)) adjs.push(a);
  if (P.light && form !== 'heal') adjs.push('Glowing');
  if (P.bouncy && form === 'melee') adjs.push('Bouncy');
  if (P.explosive && form === 'melee') adjs.push('Explosive');
  if (form === 'flamer' || noun === 'Molotov' || noun === 'Fireball Launcher') { const i = adjs.indexOf('Flaming'); if (i >= 0) adjs.splice(i, 1); }
  let name = [...adjs.slice(0, 2), noun].join(' ');
  if (n >= 5) name += ' of Doom';
  else if (n === 4) name += ' Mk II';
  return name;
}

const FORM_LABEL = { melee: 'Melee weapon', gun: 'Launcher', flamer: 'Flamethrower', throw: 'Throwable', mine: 'Placeable mine',
  trap: 'Placeable trap', magnet: 'Placeable lure trap', wall: 'Placeable barricade', heal: 'Healing' };
export const formLabel = (f) => FORM_LABEL[f];

function describe(s) {
  const lines = [];
  const r = (v) => Math.round(v);
  switch (s.form) {
    case 'melee': lines.push(`${r(s.dmg)} damage · reach ${s.reach.toFixed(1)}m · ${r(s.maxUses)} hits`); break;
    case 'gun': lines.push(`${r(s.dmg)} damage${s.radius ? ` · ${s.radius.toFixed(1)}m blast` : ''} · ${s.maxUses} shots`); break;
    case 'flamer': lines.push(`${r(s.dps)} dmg/s · ${(s.maxUses / 10).toFixed(1)}s of fuel`); break;
    case 'throw': lines.push(`${s.dmg ? r(s.dmg) + ' damage · ' : ''}${s.radius.toFixed(1)}m area${s.fuse ? ` · ${s.fuse}s fuse` : ''}`); break;
    case 'mine': lines.push(`${r(s.dmg)} damage · ${s.radius.toFixed(1)}m blast when a zombie steps near`); break;
    case 'trap': lines.push(`${r(s.dps)} dmg/s to zombies touching it · lasts ${r(s.hp)}s of grinding`); break;
    case 'magnet': lines.push(`Pulls zombies within ${r(s.radius)}m${s.dps ? ` · ${r(s.dps)} dmg/s` : ''}`); break;
    case 'wall': lines.push(`${r(s.hp)} HP · ${s.width.toFixed(1)}m wide${s.thorns ? ` · hurts attackers` : ''}`); break;
    case 'heal': lines.push(`Heals ${r(s.amount)} HP`); break;
  }
  const f = s.fx, ex = [];
  if (f.fire) ex.push('sets zombies on fire');
  if (f.shock) ex.push(f.chain ? `shock chains to ${f.chain} more` : 'stuns');
  if (f.poison) ex.push('poisons');
  if (f.bleed && s.form !== 'heal') ex.push('causes bleeding');
  if (f.slow) ex.push('slows');
  if (f.lure) ex.push('lures zombies');
  if (s.P.bouncy && s.form === 'melee') ex.push('huge knockback');
  if (s.light) ex.push('lights the dark');
  if (ex.length) lines.push(ex.join(' · '));
  return lines.join('\n');
}

// ------------------------------------------------------------------ meshes
const mats = new Map();
const m = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.7, metalness: 0.2, ...o })); return mats.get(k); };

/** a base item mesh, extending along +z from z=0. returns {mesh, len} */
export function baseMesh(id) {
  const [shape, w, len, color] = BASE[id].shape;
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); g.add(me); return me; };
  const HP = Math.PI / 2;
  switch (shape) {
    case 'cyl': add(new THREE.CylinderGeometry(w, w, len, 8), m(color), 0, 0, len / 2, HP); break;
    case 'bat': add(new THREE.CylinderGeometry(w * 1.3, w * 0.5, len, 8), m(color), 0, 0, len / 2, HP); break;
    case 'blade': add(new THREE.BoxGeometry(0.03, w * 1.6, len * 0.75), m(color, { metalness: 0.8 }), 0, 0, len * 0.6); add(new THREE.BoxGeometry(0.05, 0.06, len * 0.3), m(0x222222), 0, 0, len * 0.15); break;
    case 'box': add(new THREE.BoxGeometry(w, w * 0.8, len), m(color), 0, 0, len / 2); break;
    case 'bottle': add(new THREE.CylinderGeometry(w, w, len * 0.7, 8), m(color, { transparent: true, opacity: 0.85 }), 0, 0, len * 0.35, HP); add(new THREE.CylinderGeometry(w * 0.4, w * 0.4, len * 0.3, 6), m(color), 0, 0, len * 0.85, HP); break;
    case 'ring': add(new THREE.TorusGeometry(w * 0.7, w * 0.35, 6, 12), m(color), 0, 0, w); return { mesh: g, len: w * 2 };
    case 'fan': add(new THREE.CylinderGeometry(0.04, 0.06, len, 6), m(0x555555), 0, 0, len / 2, HP); for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.03, w, 0.1), m(color), 0, Math.cos(i * 2.1) * w / 2, len + 0.02, i * 2.1); break;
    case 'flat': add(new THREE.BoxGeometry(w, 0.03, Math.max(len, 0.15)), m(color, { metalness: 0.6 }), 0, 0, Math.max(len, 0.15) / 2); break;
    case 'disc': add(new THREE.CylinderGeometry(w, w, len, 14), m(color, { metalness: 0.9 }), 0, 0, w, 0, 0, HP); return { mesh: g, len: w * 2 };
    case 'drill': add(new THREE.BoxGeometry(0.1, 0.2, 0.22), m(color), 0, 0, 0.11); add(new THREE.ConeGeometry(0.03, len * 0.5, 6), m(0xdddddd, { metalness: 0.9 }), 0, 0.05, 0.22 + len * 0.25, HP); break;
    case 'spring': for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(w, 0.02, 4, 10), m(color), 0, 0, 0.03 + i * len / 5); break;
    case 'rocket': add(new THREE.CylinderGeometry(w, w, len * 0.8, 8), m(color), 0, 0, len * 0.4, HP); add(new THREE.ConeGeometry(w * 1.2, len * 0.25, 8), m(0xffffff), 0, 0, len * 0.9, HP); break;
    case 'magnet': add(new THREE.TorusGeometry(w * 0.6, w * 0.25, 6, 10, Math.PI), m(color), 0, 0, w * 0.6, -HP, 0, 0); break;
    case 'plank': add(new THREE.BoxGeometry(w, 0.05, len), m(color, { metalness: 0 }), 0, 0, len / 2); break;
    case 'chain': for (let i = 0; i < 7; i++) add(new THREE.TorusGeometry(0.05, 0.015, 4, 8), m(color, { metalness: 0.8 }), 0, 0, i * len / 7 + 0.05, 0, i % 2 ? HP : 0, 0); break;
    case 'ball': add(new THREE.SphereGeometry(w, 10, 8), m(color, { roughness: 0.2 }), 0, 0, w); return { mesh: g, len: w * 2 };
    case 'rake': add(new THREE.CylinderGeometry(w * 0.6, w * 0.6, len, 6), m(color), 0, 0, len / 2, HP); add(new THREE.BoxGeometry(0.35, 0.03, 0.05), m(0x777777), 0, 0, len); for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.02, 0.1, 0.02), m(0x777777), -0.15 + i * 0.075, -0.05, len); break;
    case 'pan': add(new THREE.CylinderGeometry(w, w * 0.9, 0.05, 10), m(color), 0, 0, len * 0.6); add(new THREE.BoxGeometry(0.04, 0.03, len * 0.45), m(0x111111), 0, 0, len * 0.2); break;
  }
  return { mesh: g, len };
}

/**
 * Crafted item mesh: parts get taped together end to end, which looks gloriously janky.
 * Returns a Group extending along +z. Normalised so the whole thing is ~maxLen long.
 */
export function itemMesh(parts, maxLen = 1.4) {
  const g = new THREE.Group();
  let z = 0;
  parts.forEach((id, i) => {
    const { mesh, len } = baseMesh(id);
    // later parts get attached around the end of the previous ones at fixed "random" angles
    const spread = i === 0 ? 0 : ((i * 37) % 5 - 2) * 0.05;
    mesh.position.set(spread, i === 0 ? 0 : ((i * 53) % 3 - 1) * 0.04, i === 0 ? 0 : Math.max(0, z - len * 0.35));
    mesh.rotation.z = i * 1.3;
    g.add(mesh);
    if (i > 0) {
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), m(0x9aa0a6));
      tape.rotation.x = Math.PI / 2; tape.position.set(spread, 0, Math.max(0, z - len * 0.2)); g.add(tape);
    }
    z = Math.max(z, mesh.position.z + len);
  });
  const k = z > maxLen ? maxLen / z : 1;
  g.scale.setScalar(k);
  g.userData.len = z * k;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
