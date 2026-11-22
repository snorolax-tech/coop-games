// Tiny Web Audio synth: every sound is generated, no audio files.
let ctx = null, master = null, noiseBuf = null, out = null;

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
  o.connect(g); g.connect(out || master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0) {
  const c = ac(), t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(out || master); s.start(t); s.stop(t + dur + 0.02);
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
      case 'scare':
        noise(0.9, 0.9, 900, 0.4); noise(0.6, 0.7, 3500, 1);
        [233, 247, 349, 370, 740].forEach((f) => tone(f, 1.1, 'sawtooth', 0.22, -40));
        tone(55, 1.2, 'square', 0.5, -20); break;
      case 'shriek': tone(900, 0.7, 'sawtooth', 0.22, 700); tone(1300, 0.6, 'sawtooth', 0.12, -500, 0.05); noise(0.6, 0.25, 3000, 3); break;
      case 'heartbeat': tone(55, 0.12, 'sine', 0.7, -15); tone(50, 0.14, 'sine', 0.55, -15, 0.2); break;
      case 'siren': for (let i = 0; i < 3; i++) { tone(440, 0.6, 'sawtooth', 0.12, 330, i * 1.2); tone(770, 0.6, 'sawtooth', 0.12, -330, i * 1.2 + 0.6); } break;
      case 'tick10': tone(1000, 0.08, 'square', 0.18); break;
      case 'whisper': noise(1.6, 0.12, 2400, 6); noise(1.2, 0.08, 1700, 8, 0.4); break;
      case 'distant': tone(700, 1.4, 'sawtooth', 0.05, -350); noise(1.2, 0.05, 1500, 2); break;
      case 'roar': tone(70, 1.6, 'sawtooth', 0.45, -25); tone(95, 1.4, 'square', 0.25, -40); noise(1.4, 0.5, 400, 0.5); break;
      case 'blackout': tone(300, 1.2, 'sawtooth', 0.25, -270); noise(0.3, 0.4, 5000, 4); tone(60, 0.5, 'square', 0.25, 0, 0.1); break;
      case 'power': tone(60, 0.4, 'square', 0.25, 200); tone(120, 0.6, 'sine', 0.2, 600, 0.2); break;
      case 'scream': for (let i = 0; i < 5; i++) tone(500 + i * 170, 1.5, 'sawtooth', 0.12, 300 - i * 150); noise(1.5, 0.45, 2500, 0.7); break;
      case 'blink': noise(0.4, 0.4, 200, 0.5); tone(1500, 0.3, 'sine', 0.2, -1400); break;
      case 'spit': noise(0.3, 0.35, 600, 1); tone(200, 0.3, 'sawtooth', 0.15, -120); break;
      case 'charge': for (let i = 0; i < 6; i++) { tone(50, 0.15, 'square', 0.4, -10, i * 0.22); noise(0.12, 0.35, 300, 1, i * 0.22); } break;
      case 'bossintro': tone(41, 3, 'sawtooth', 0.4, 0); tone(49, 3, 'sawtooth', 0.3, 0); [196, 185, 174, 165].forEach((f, i) => tone(f, 0.9, 'square', 0.15, -10, i * 0.6)); noise(2.5, 0.25, 200, 0.4); break;
      case 'slice': noise(0.12, 0.45, 4200, 1.2); tone(300, 0.08, 'sawtooth', 0.15, -200); noise(0.15, 0.3, 700, 1, 0.03); break;
      case 'thud': tone(90, 0.18, 'sine', 0.6, -50); noise(0.14, 0.55, 500, 0.8); noise(0.06, 0.3, 2500, 1); break;
      case 'crit': tone(70, 0.3, 'sine', 0.7, -40); noise(0.25, 0.6, 350, 0.6); noise(0.12, 0.4, 3000, 1, 0.02); break;
      case 'snap': noise(0.08, 0.6, 2200, 3); tone(500, 0.06, 'square', 0.25, -300); noise(0.3, 0.3, 600, 1, 0.05); break;
      case 'marker': tone(1400, 0.04, 'square', 0.08); break;
      case 'kill': tone(900, 0.06, 'square', 0.12); tone(1300, 0.08, 'square', 0.1, 0, 0.05); break;
      case 'click': tone(800, 0.04, 'square', 0.1); break;
    }
  } catch { /* audio not available */ }
}
/** play a sound placed in the world: quieter with distance, panned left/right */
export function sfx3d(name, x, z, lx, lz, lyaw, throttle = 0, range = 60) {
  try {
    const c = ac();
    const dx = x - lx, dz = z - lz, d = Math.hypot(dx, dz);
    if (d > range) return;
    const g = c.createGain(); g.gain.value = Math.max(0.05, 1 - d / range) ** 1.5 * 1.4;
    const p = c.createStereoPanner();
    // right vector of a listener looking towards (-sin yaw, -cos yaw)
    p.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(lyaw) - dz * Math.sin(lyaw)) / (d || 1)));
    g.connect(p); p.connect(master);
    out = g;
    sfx(name, throttle);
  } catch { /* */ } finally { out = null; }
}
export function unlockAudio() { try { ac(); } catch { /* */ } }
