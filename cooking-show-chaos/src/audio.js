// All sound is synthesized with the Web Audio API — no audio files.
let ctx = null, master = null, noiseBuf = null;
const loops = {};
let volume = 0.6;

function noise(dur, { type = 'bandpass', f = 1000, f2 = null, q = 1, vol = 0.5, delay = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.setValueAtTime(f, t); filt.Q.value = q;
  if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
function tone(f, dur, { type = 'sine', vol = 0.3, f2 = null, delay = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

const SOUNDS = {
  pickup: () => { tone(500, 0.08, { f2: 900, vol: 0.25 }); },
  drop: () => { tone(220, 0.12, { f2: 110, vol: 0.3, type: 'triangle' }); },
  throw: () => { noise(0.25, { f: 600, f2: 2400, q: 2, vol: 0.35 }); },
  clatter: () => { noise(0.08, { f: 3000, q: 3, vol: 0.25 }); tone(800 + Math.random() * 600, 0.06, { type: 'square', vol: 0.05 }); },
  chop: () => { noise(0.05, { type: 'highpass', f: 2500, vol: 0.35 }); tone(180, 0.05, { type: 'square', vol: 0.08 }); },
  chopped: () => { tone(660, 0.08, { vol: 0.2 }); tone(990, 0.12, { vol: 0.2, delay: 0.07 }); },
  ding: () => { tone(1320, 0.6, { vol: 0.3 }); tone(1760, 0.8, { vol: 0.2, delay: 0.1 }); },
  buzzer: () => { tone(110, 0.5, { type: 'sawtooth', vol: 0.2 }); tone(116, 0.5, { type: 'sawtooth', vol: 0.2 }); },
  alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.14, { type: 'square', vol: 0.12, delay: i * 0.15 }); },
  squawk: () => { tone(900, 0.25, { type: 'sawtooth', f2: 500, vol: 0.18 }); tone(1300, 0.18, { type: 'square', f2: 700, vol: 0.08, delay: 0.12 }); },
  rumble: () => { noise(2.5, { type: 'lowpass', f: 120, vol: 0.9, attack: 0.3 }); },
  cash: () => { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.15, { type: 'triangle', vol: 0.18, delay: i * 0.06 })); },
  recOn: () => { tone(1000, 0.08, { type: 'square', vol: 0.12 }); tone(1500, 0.12, { type: 'square', vol: 0.12, delay: 0.1 }); },
  recOff: () => { tone(1500, 0.08, { type: 'square', vol: 0.12 }); tone(900, 0.12, { type: 'square', vol: 0.12, delay: 0.1 }); },
  hurt: () => { tone(220, 0.12, { type: 'square', f2: 140, vol: 0.15 }); noise(0.08, { type: 'lowpass', f: 500, vol: 0.4 }); },
  scream: () => { // cartoon "AAAAAA" with wobbly vibrato
    const t = ctx.currentTime, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.9);
    lfo.frequency.value = 9; lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(f).connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + 1); lfo.stop(t + 1);
  },
  wipeout: () => { [392, 370, 349, 294].forEach((fq, i) => tone(fq, i === 3 ? 0.9 : 0.28, { type: 'sawtooth', vol: 0.12, delay: i * 0.3, f2: i === 3 ? 260 : null })); }, // sad trombone
  respawn: () => { [523, 784, 1046, 1568].forEach((fq, i) => tone(fq, 0.15, { type: 'triangle', vol: 0.15, delay: i * 0.07 })); },
  flop: () => {
    tone(900, 0.45, { f2: 160, vol: 0.18, type: 'sine' });               // cartoon falling whistle
    noise(0.25, { type: 'lowpass', f: 300, vol: 0.9, delay: 0.4 });       // THUD
    tone(90, 0.3, { f2: 50, vol: 0.4, type: 'triangle', delay: 0.4 });
    [1568, 2093, 1760].forEach((f, i) => tone(f, 0.12, { vol: 0.06, type: 'triangle', delay: 0.55 + i * 0.09 })); // dizzy birdies
  },
  bonk: () => { tone(400, 0.25, { f2: 90, vol: 0.4, type: 'triangle' }); },
  splash: () => { noise(0.5, { f: 900, f2: 300, q: 0.8, vol: 0.4 }); },
  slip: () => { tone(300, 0.4, { f2: 1400, vol: 0.18, type: 'sine' }); },
  cheer: () => { noise(1.4, { f: 1200, q: 0.5, vol: 0.35, attack: 0.15 }); noise(1.2, { f: 2500, q: 0.7, vol: 0.2, attack: 0.2 }); },
  laugh: () => { for (let i = 0; i < 5; i++) noise(0.12, { f: 700 + Math.random() * 400, q: 4, vol: 0.25, delay: i * 0.16 }); },
  whoosh: () => { noise(0.5, { f: 300, f2: 3000, q: 1.5, vol: 0.3 }); },
  fire: () => { noise(0.8, { type: 'lowpass', f: 600, vol: 0.6, attack: 0.05 }); },
  extinguish: () => { noise(0.7, { type: 'highpass', f: 1500, vol: 0.4 }); tone(300, 0.4, { f2: 120, vol: 0.15 }); },
  click: () => { tone(800, 0.04, { type: 'square', vol: 0.08 }); },
  tick: () => { tone(1200, 0.05, { type: 'square', vol: 0.1 }); },
  knob: () => { tone(300, 0.05, { type: 'square', vol: 0.1 }); noise(0.05, { f: 4000, vol: 0.1 }); },
  pour: () => { noise(0.6, { f: 1500, f2: 600, q: 2, vol: 0.3 }); },
  jingle: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.12 })); },
  sad: () => { [392, 370, 349, 330].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.2, delay: i * 0.3 })); },
  mixer: () => { tone(90, 0.3, { type: 'sawtooth', f2: 140, vol: 0.12 }); },
  fanfare: () => { [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.1, delay: i * 0.1 })); },
};

const LOOP_DEFS = {
  sizzle: { type: 'highpass', f: 3000, q: 0.7, max: 0.12 },
  fire: { type: 'lowpass', f: 500, q: 0.8, max: 0.5 },
  spray: { type: 'bandpass', f: 2500, q: 0.6, max: 0.35 },
  water: { type: 'bandpass', f: 900, q: 1.2, max: 0.25 },
  boil: { type: 'bandpass', f: 400, q: 3, max: 0.15 },
};

export const audio = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [name, def] of Object.entries(LOOP_DEFS)) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const filt = ctx.createBiquadFilter(); filt.type = def.type; filt.frequency.value = def.f; filt.Q.value = def.q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(filt).connect(g).connect(master); src.start();
      loops[name] = { g, max: def.max, level: 0 };
    }
  },
  setVolume(v) { volume = v; if (master) master.gain.value = v; },
  getVolume() { return volume; },
  play(name, vol = 1) {
    if (!ctx || vol <= 0.02) return;
    const fn = SOUNDS[name]; if (!fn) return;
    if (vol < 1) {
      // temporarily route through a quieter master
      const saved = master; const g = ctx.createGain(); g.gain.value = vol; g.connect(saved);
      master = g; try { fn(); } finally { master = saved; }
    } else fn();
  },
  setLoop(name, level) {
    const l = loops[name]; if (!l) return;
    level = Math.max(0, Math.min(1, level));
    if (Math.abs(level - l.level) < 0.02) return;
    l.level = level;
    l.g.gain.setTargetAtTime(level * l.max, ctx.currentTime, 0.08);
  },
  stopLoops() { for (const k in loops) this.setLoop(k, 0); },
};
