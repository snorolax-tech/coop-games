// Tiny Web Audio synth: every sound is generated, no audio files.
let ctx = null, master = null, noiseBuf = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
  const c = ac(), t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0) {
  const c = ac(), t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}

const last = {};
export function sfx(name, throttle = 0) {
  try {
    const now = performance.now();
    if (throttle && last[name] && now - last[name] < throttle) return;
    last[name] = now;
    switch (name) {
      case 'grab': tone(300, 0.08, 'square', 0.2, 300); tone(700, 0.12, 'square', 0.15, 200, 0.06); noise(0.1, 0.2, 3000, 2); break;
      case 'deny': tone(160, 0.2, 'sawtooth', 0.2, -60); break;
      case 'swing': noise(0.15, 0.25, 900, 0.7); break;
      case 'hit': noise(0.12, 0.45, 2500, 1.5); tone(120, 0.15, 'square', 0.25, -60); break;
      case 'tick': noise(0.05, 0.2, 3500, 2); break;
      case 'clang': tone(520, 0.4, 'triangle', 0.25); tone(780, 0.3, 'triangle', 0.15); noise(0.15, 0.3, 4000, 3); break;
      case 'detach': tone(400, 0.5, 'sawtooth', 0.2, -300); noise(0.3, 0.35, 2000, 1); break;
      case 'bolt': tone(500, 0.06, 'square', 0.2); tone(800, 0.08, 'square', 0.2, 0, 0.07); tone(1100, 0.1, 'square', 0.2, 0, 0.14); break;
      case 'slam': tone(60, 0.6, 'sine', 0.6, -30); noise(0.5, 0.6, 300, 0.6); break;
      case 'alarm': tone(880, 0.15, 'square', 0.15); tone(660, 0.15, 'square', 0.15, 0, 0.18); break;
      case 'magnet': tone(90, 1.2, 'sawtooth', 0.12, 40); break;
      case 'missile': noise(0.3, 0.25, 600, 0.8); tone(300, 0.3, 'sawtooth', 0.08, 400); break;
      case 'boom': noise(0.5, 0.5, 400, 0.5); tone(80, 0.4, 'sine', 0.4, -40); break;
      case 'jump': tone(250, 0.12, 'square', 0.12, 250); break;
      case 'dash': noise(0.25, 0.35, 700, 0.6); break;
      case 'shield': tone(400, 0.4, 'sine', 0.25, 400); break;
      case 'count': tone(600, 0.15, 'square', 0.2); break;
      case 'go': tone(900, 0.4, 'square', 0.25); tone(1200, 0.4, 'square', 0.15); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'square', 0.2, 0, i * 0.12)); break;
      case 'lose': [400, 330, 260, 200].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.15, 0, i * 0.15)); break;
      case 'hurt': noise(0.15, 0.35, 700, 1); tone(140, 0.2, 'sawtooth', 0.2, -50); break;
      case 'down': [300, 220, 160, 110].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.15, 0, i * 0.15)); break;
      case 'revive': [400, 600, 800].forEach((f, i) => tone(f, 0.15, 'square', 0.15, 0, i * 0.1)); break;
      case 'flame': noise(0.15, 0.25, 500, 0.5); break;
      case 'heal': tone(500, 0.2, 'sine', 0.2, 300); tone(800, 0.25, 'sine', 0.15, 200, 0.1); break;
      case 'build': noise(0.08, 0.3, 1500, 2); noise(0.08, 0.3, 1500, 2, 0.12); tone(200, 0.1, 'square', 0.15, 0, 0.12); break;
      case 'break': tone(300, 0.3, 'sawtooth', 0.2, -200); noise(0.2, 0.3, 2500, 1); break;
      case 'rocket': noise(0.4, 0.35, 500, 0.6); tone(200, 0.3, 'sawtooth', 0.1, 300); break;
      case 'shoot': noise(0.08, 0.4, 2000, 1); tone(180, 0.1, 'square', 0.2, -80); break;
      case 'throw': noise(0.2, 0.2, 1200, 0.8); break;
      case 'loot': tone(600, 0.06, 'square', 0.12); tone(900, 0.08, 'square', 0.12, 0, 0.07); break;
      case 'craft': noise(0.1, 0.3, 3000, 2); noise(0.1, 0.3, 2000, 2, 0.12); [500, 700, 1000].forEach((f, i) => tone(f, 0.12, 'square', 0.15, 0, 0.25 + i * 0.08)); break;
      case 'groan': tone(90 + Math.random() * 40, 0.6, 'sawtooth', 0.06, -30); break;
      case 'zdie': tone(120, 0.4, 'sawtooth', 0.12, -60); noise(0.2, 0.2, 400, 1); break;
      case 'night': [220, 208, 196, 185].forEach((f, i) => tone(f, 0.6, 'triangle', 0.2, 0, i * 0.35)); break;
      case 'dawn': [523, 659, 784].forEach((f, i) => tone(f, 0.35, 'triangle', 0.18, 0, i * 0.18)); break;
      case 'fuse': tone(1200, 0.05, 'square', 0.1); break;
      case 'zap': noise(0.15, 0.25, 5000, 2); tone(1500, 0.1, 'sawtooth', 0.08, -800); break;
      case 'click': tone(800, 0.04, 'square', 0.1); break;
    }
  } catch { /* audio not available */ }
}
export function unlockAudio() { try { ac(); } catch { /* */ } }
