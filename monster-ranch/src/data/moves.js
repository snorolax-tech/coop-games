// Battle moves. power 0 = status move. effect fields are interpreted by the battle system (Stage 3).
//   stat: { stat, stages, target: 'self'|'foe' }   heal: fraction of max HP
//   status: { kind: 'burn'|'sleep'|'paralyze', chance }   priority: moves first
export const MOVES = {
  // neutral
  tackle:     { name: 'Tackle',       type: 'neutral', power: 40, acc: 100, desc: 'A full-body bump.' },
  headbutt:   { name: 'Headbutt',     type: 'neutral', power: 60, acc: 95,  desc: 'A hard bonk with the head.' },
  growl:      { name: 'Growl',        type: 'neutral', power: 0,  acc: 100, stat: { stat: 'atk', stages: -1, target: 'foe' }, desc: 'Lowers the foe\'s Attack.' },
  quickdash:  { name: 'Quick Dash',   type: 'neutral', power: 40, acc: 100, priority: 1, desc: 'Always strikes first.' },
  snooze:     { name: 'Snooze',       type: 'neutral', power: 0,  acc: 100, heal: 0.5, desc: 'Naps to recover half its HP.' },
  // flame
  ember:      { name: 'Ember Spit',   type: 'flame', power: 35, acc: 100, status: { kind: 'burn', chance: 0.1 }, desc: 'Spits a little fireball.' },
  flamedash:  { name: 'Flame Dash',   type: 'flame', power: 55, acc: 95,  desc: 'Charges wrapped in fire.' },
  heatwave:   { name: 'Heat Wave',    type: 'flame', power: 70, acc: 90,  desc: 'A shimmering blast of heat.' },
  infernoroar:{ name: 'Inferno Roar', type: 'flame', power: 95, acc: 80,  desc: 'A roar so hot it scorches.' },
  smolder:    { name: 'Smolder',      type: 'flame', power: 0,  acc: 85,  status: { kind: 'burn', chance: 1 }, desc: 'Leaves the foe burning.' },
  // splash
  bubblepop:  { name: 'Bubble Pop',   type: 'splash', power: 35, acc: 100, desc: 'Bubbles that pop on impact.' },
  waterjet:   { name: 'Water Jet',    type: 'splash', power: 55, acc: 95,  desc: 'A fast jet of water.' },
  tidalslam:  { name: 'Tidal Slam',   type: 'splash', power: 80, acc: 85,  desc: 'Crashes down like a wave.' },
  hydroburst: { name: 'Hydro Burst',  type: 'splash', power: 95, acc: 80,  desc: 'A huge burst of water.' },
  raindance:  { name: 'Rain Dance',   type: 'splash', power: 0,  acc: 100, heal: 0.3, desc: 'A soothing rain restores HP.' },
  // leaf
  leafflick:  { name: 'Leaf Flick',   type: 'leaf', power: 35, acc: 100, desc: 'Flicks sharp leaves.' },
  vinewhip:   { name: 'Vine Whip',    type: 'leaf', power: 55, acc: 95,  desc: 'Lashes with springy vines.' },
  petalstorm: { name: 'Petal Storm',  type: 'leaf', power: 75, acc: 90,  desc: 'A whirl of razor petals.' },
  sporepuff:  { name: 'Spore Puff',   type: 'leaf', power: 0,  acc: 75,  status: { kind: 'sleep', chance: 1 }, desc: 'Sleepy spores make the foe doze off.' },
  rootheal:   { name: 'Root Heal',    type: 'leaf', power: 0,  acc: 100, heal: 0.5, desc: 'Draws energy from the earth.' },
  // spark
  zap:        { name: 'Zap',          type: 'spark', power: 35, acc: 100, status: { kind: 'paralyze', chance: 0.1 }, desc: 'A tiny shock.' },
  staticpounce:{ name: 'Static Pounce', type: 'spark', power: 55, acc: 95, desc: 'Leaps in crackling with static.' },
  thunderfang:{ name: 'Thunder Fang', type: 'spark', power: 70, acc: 90,  status: { kind: 'paralyze', chance: 0.2 }, desc: 'An electric bite.' },
  voltstorm:  { name: 'Volt Storm',   type: 'spark', power: 95, acc: 80,  desc: 'Calls down a storm of bolts.' },
  chargeup:   { name: 'Charge Up',    type: 'spark', power: 0,  acc: 100, stat: { stat: 'atk', stages: 2, target: 'self' }, desc: 'Sharply raises Attack.' },
  // stone
  pebbletoss: { name: 'Pebble Toss',  type: 'stone', power: 35, acc: 100, desc: 'Tosses a handful of pebbles.' },
  rockroll:   { name: 'Rock Roll',    type: 'stone', power: 55, acc: 95,  desc: 'Curls up and rolls into the foe.' },
  quakestomp: { name: 'Quake Stomp',  type: 'stone', power: 80, acc: 85,  desc: 'Stomps so hard the ground shakes.' },
  bouldercrash:{ name: 'Boulder Crash', type: 'stone', power: 95, acc: 80, desc: 'Hurls a giant boulder.' },
  harden:     { name: 'Harden',       type: 'stone', power: 0,  acc: 100, stat: { stat: 'def', stages: 2, target: 'self' }, desc: 'Sharply raises Defense.' },
  // breeze
  gust:       { name: 'Gust',         type: 'breeze', power: 35, acc: 100, desc: 'A sudden puff of wind.' },
  wingslice:  { name: 'Wing Slice',   type: 'breeze', power: 55, acc: 95,  desc: 'Slices with a sharp wing or gust.' },
  cyclone:    { name: 'Cyclone',      type: 'breeze', power: 75, acc: 90,  desc: 'Spins up a mini tornado.' },
  skydive:    { name: 'Sky Dive',     type: 'breeze', power: 90, acc: 85,  desc: 'Dives from high above.' },
  tailwind:   { name: 'Tailwind',     type: 'breeze', power: 0,  acc: 100, stat: { stat: 'spd', stages: 2, target: 'self' }, desc: 'Sharply raises Speed.' },
};
