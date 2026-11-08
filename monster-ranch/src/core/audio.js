// Tiny synthesized sound effects with the Web Audio API (no audio files).
// Music and richer sounds come in the polish stage.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.5;
    this.muted = false;
    this._noise = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noiseBurst(dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0, sweep = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this._noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  play(name, k = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'pick': this._tone(660, 0.09, { type: 'triangle', vol: 0.25 }); this._tone(990, 0.12, { type: 'triangle', vol: 0.22, delay: 0.07 }); break;
      case 'coin': this._tone(988, 0.08, { type: 'square', vol: 0.12 }); this._tone(1319, 0.2, { type: 'square', vol: 0.12, delay: 0.08 }); break;
      case 'throw': this._noiseBurst(0.22, { vol: 0.25, freq: 600, sweep: 3, q: 0.8 }); break;
      case 'bounce': this._tone(180, 0.1, { type: 'sine', vol: 0.3 * k, slide: 0.5 }); break;
      case 'swing': this._noiseBurst(0.18, { vol: 0.2, freq: 900, sweep: 0.4, q: 1.5 }); break;
      case 'knock': this._tone(220, 0.08, { type: 'square', vol: 0.15, slide: 0.6 }); this._noiseBurst(0.08, { vol: 0.3, freq: 2000, q: 2 }); break;
      case 'water': this._noiseBurst(0.5, { vol: 0.12, freq: 3000, q: 0.5, type: 'highpass' }); break;
      case 'splash': this._noiseBurst(0.35, { vol: 0.3, freq: 1500, sweep: 0.3, q: 0.7 }); break;
      case 'brush': for (let i = 0; i < 3; i++) this._noiseBurst(0.08, { vol: 0.12, freq: 4000, q: 1, delay: i * 0.1 }); break;
      case 'step': this._noiseBurst(0.07, { vol: 0.06 * k, freq: 500 + Math.random() * 300, q: 1.2, type: 'lowpass' }); break;
      case 'stepWater': this._noiseBurst(0.15, { vol: 0.1, freq: 1200, q: 0.8 }); break;
      case 'jump': this._tone(300, 0.12, { type: 'sine', vol: 0.08, slide: 1.6 }); break;
      case 'land': this._noiseBurst(0.12, { vol: 0.15, freq: 300, q: 1, type: 'lowpass' }); break;
      case 'locked': this._tone(160, 0.18, { type: 'sawtooth', vol: 0.12 }); this._tone(120, 0.25, { type: 'sawtooth', vol: 0.12, delay: 0.12 }); break;
      case 'ui': this._tone(520, 0.06, { type: 'triangle', vol: 0.15 }); break;
      case 'open': this._tone(440, 0.07, { type: 'triangle', vol: 0.15 }); this._tone(660, 0.09, { type: 'triangle', vol: 0.15, delay: 0.05 }); break;
      case 'zone': [523, 659, 784].forEach((f, i) => this._tone(f, 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.12 })); break;
      case 'plink': this._tone(1400, 0.4, { type: 'sine', vol: 0.18, slide: 0.7, delay: 0.5 }); break;
      case 'chime': [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, 0.6, { type: 'sine', vol: 0.12, delay: i * 0.1 })); break;
    }
  }
}
