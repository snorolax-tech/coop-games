// Procedural background music (Web Audio, no files). Each mood is a small "song":
// key, scale, tempo, chord progression and instruments; the melody is generated from a
// seeded random generator so each track always sounds the same. Tracks crossfade.
import { rng } from './noise.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// root = MIDI note of the key centre; prog = scale degrees (0-based) of each bar's chord
export const TRACKS = {
  title:    { root: 60, scale: MAJOR, bpm: 92,  prog: [0, 4, 5, 3], lead: 'bell',  pad: 0.05, bass: 0.10, perc: 'soft', density: 0.45 },
  ranch:    { root: 65, scale: MAJOR, bpm: 96,  prog: [0, 3, 4, 0, 5, 3, 4, 4], lead: 'pluck', pad: 0.045, bass: 0.10, perc: 'soft', density: 0.5 },
  meadow:   { root: 67, scale: MAJOR, bpm: 112, prog: [0, 5, 3, 4], lead: 'pluck', pad: 0.04, bass: 0.10, perc: 'light', density: 0.6 },
  forest:   { root: 62, scale: MINOR, bpm: 84,  prog: [0, 6, 5, 6], lead: 'flute', pad: 0.055, bass: 0.09, perc: 'soft', density: 0.4 },
  lakeside: { root: 69, scale: MAJOR, bpm: 76,  prog: [0, 2, 3, 0], lead: 'bell',  pad: 0.05, bass: 0.08, perc: 'none', density: 0.35, arp: true },
  volcano:  { root: 52, scale: MINOR, bpm: 104, prog: [0, 5, 2, 6], lead: 'square', pad: 0.04, bass: 0.13, perc: 'drums', density: 0.45 },
  night:    { root: 64, scale: MAJOR, bpm: 66,  prog: [0, 3, 5, 4], lead: 'bell',  pad: 0.05, bass: 0.06, perc: 'none', density: 0.22 },
  battle:   { root: 57, scale: MINOR, bpm: 144, prog: [0, 5, 6, 0], lead: 'square', pad: 0.03, bass: 0.13, perc: 'drive', density: 0.7, bass8: true },
  boss:     { root: 50, scale: MINOR, bpm: 154, prog: [0, 5, 3, 4], lead: 'saw',   pad: 0.035, bass: 0.15, perc: 'drive', density: 0.75, bass8: true },
  pvp:      { root: 62, scale: MAJOR, bpm: 138, prog: [0, 4, 5, 3], lead: 'square', pad: 0.03, bass: 0.12, perc: 'drive', density: 0.65, bass8: true },
};

/** Pre-compose 8 bars of melody for a track: [{ step, deg, len }] per bar. */
function compose(name, t) {
  const r = rng([...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const bars = [];
  let deg = 4;
  for (let b = 0; b < 8; b++) {
    const chord = t.prog[b % t.prog.length];
    const notes = [];
    for (let s = 0; s < 16; s += 2) {
      const strong = s % 8 === 0;
      if (r() > (strong ? 0.85 : t.density)) continue;
      // strong beats land on chord tones, others walk through the scale
      if (strong) deg = chord + [0, 2, 4, 7][Math.floor(r() * 4)];
      else deg += [-2, -1, -1, 1, 1, 2][Math.floor(r() * 6)];
      deg = Math.max(-2, Math.min(11, deg));
      const len = r() < 0.3 ? 4 : 2;
      notes.push({ step: s, deg, len });
    }
    bars.push(notes);
  }
  return bars;
}

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.current = null;   // { name, track, gain, bars }
    this.wanted = null;
    this.step = 0;
    this.nextTime = 0;
    this._timer = null;
  }

  get ctx() { return this.audio.ctx; }

  /** Ask for a track; switches with a crossfade if different. */
  play(name) {
    this.wanted = name;
    if (!this.ctx) return;
    if (this.current?.name === name) return;
    const t = TRACKS[name];
    if (!t) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.current) {
      const old = this.current.gain;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0.0001, now + 1.6);
      setTimeout(() => old.disconnect(), 2000);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + 1.6);
    gain.connect(this.audio.musicBus);
    this.current = { name, track: t, gain, bars: compose(name, t) };
    this.step = 0;
    this.nextTime = now + 0.1;
    if (!this._timer) this._timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    if (this.current && this.ctx) {
      const g = this.current.gain, now = this.ctx.currentTime;
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 1);
    }
    this.current = null;
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.current) return;
    const cur = this.current;
    const t = cur.track;
    const stepDur = 60 / t.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this._playStep(cur, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (16 * 8);
    }
  }

  _note(t, deg, octave = 0) {
    const s = t.scale;
    const o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7;
    return t.root + s[d] + 12 * (o + octave);
  }

  _playStep(cur, step, time, sd) {
    const t = cur.track, out = cur.gain;
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = t.prog[bar % t.prog.length];
    // pad: whole-bar chord
    if (s === 0 && t.pad) {
      for (const k of [0, 2, 4]) this._pad(mtof(this._note(t, chord + k, -1)), time, sd * 16, t.pad, out);
    }
    // bass
    const bassEvery = t.bass8 ? 2 : 8;
    if (s % bassEvery === 0 && t.bass) {
      const oct = s % 8 === 4 && t.bass8 ? -1 : -2;
      this._bass(mtof(this._note(t, chord, oct)), time, sd * (t.bass8 ? 1.8 : 6), t.bass, out);
    }
    // gentle arpeggio
    if (t.arp && s % 2 === 0) {
      const k = [0, 2, 4, 7][(s / 2) % 4];
      this._bell(mtof(this._note(t, chord + k, 0)), time, 0.035, out);
    }
    // melody
    for (const n of cur.bars[bar]) {
      if (n.step === s) this._lead(t.lead, mtof(this._note(t, n.deg, 0)), time, sd * n.len, out);
    }
    // percussion
    this._perc(t.perc, s, time, out);
  }

  // ---------------- instruments ----------------
  _env(g, time, vol, a, d) {
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + a);
    g.gain.exponentialRampToValueAtTime(0.0001, time + a + d);
  }

  _osc(type, f, time, dur, out, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(out);
    o.start(time); o.stop(time + dur + 0.1);
    return o;
  }

  _pad(f, time, dur, vol, out) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(vol, time + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    lp.connect(g); g.connect(out);
    this._osc('triangle', f, time, dur, lp, -6);
    this._osc('triangle', f, time, dur, lp, 7);
  }

  _bass(f, time, dur, vol, out) {
    const g = this.ctx.createGain();
    this._env(g, time, vol, 0.01, dur);
    g.connect(out);
    this._osc('sine', f, time, dur, g);
    this._osc('triangle', f, time, dur, g);
  }

  _bell(f, time, vol, out) {
    const g = this.ctx.createGain();
    this._env(g, time, vol, 0.005, 1.1);
    g.connect(out);
    this._osc('sine', f, time, 1.2, g);
    const g2 = this.ctx.createGain(); this._env(g2, time, vol * 0.3, 0.005, 0.5); g2.connect(out);
    this._osc('sine', f * 2.01, time, 0.6, g2);
  }

  _lead(kind, f, time, dur, out) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    switch (kind) {
      case 'bell': this._bell(f, time, 0.07, out); return;
      case 'pluck': this._env(g, time, 0.07, 0.005, 0.35); g.connect(out); this._osc('triangle', f, time, 0.45, g); return;
      case 'flute': {
        g.gain.setValueAtTime(0.0001, time); g.gain.linearRampToValueAtTime(0.05, time + 0.08); g.gain.linearRampToValueAtTime(0.0001, time + dur + 0.1);
        g.connect(out);
        const o = this._osc('sine', f, time, dur + 0.1, g);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5; lg.gain.value = 6;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(time); lfo.stop(time + dur + 0.2);
        return;
      }
      case 'square': case 'saw': {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'saw' ? 1800 : 2400;
        this._env(g, time, kind === 'saw' ? 0.035 : 0.03, 0.005, Math.max(0.12, dur));
        lp.connect(g); g.connect(out);
        this._osc(kind === 'saw' ? 'sawtooth' : 'square', f, time, dur + 0.1, lp);
        return;
      }
    }
  }

  _perc(style, s, time, out) {
    if (style === 'none') return;
    const kick = (vol) => { const g = this.ctx.createGain(); this._env(g, time, vol, 0.002, 0.22); g.connect(out); const o = this._osc('sine', 120, time, 0.25, g); o.frequency.exponentialRampToValueAtTime(42, time + 0.18); };
    const noise = (vol, freq, dur, type = 'highpass') => {
      const src = this.ctx.createBufferSource(); src.buffer = this.audio._noise;
      const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = this.ctx.createGain(); this._env(g, time, vol, 0.001, dur);
      src.connect(f); f.connect(g); g.connect(out); src.start(time, Math.random() * 0.5); src.stop(time + dur + 0.05);
    };
    if (style === 'soft') { if (s === 0) kick(0.09); if (s % 4 === 2) noise(0.012, 7000, 0.04); }
    else if (style === 'light') { if (s % 8 === 0) kick(0.1); if (s % 2 === 0) noise(0.015, 8000, 0.03); if (s % 8 === 4) noise(0.03, 1500, 0.12, 'bandpass'); }
    else if (style === 'drums') { if (s % 8 === 0 || s === 11) kick(0.16); if (s % 8 === 4) noise(0.05, 1200, 0.18, 'bandpass'); if (s % 2 === 0) noise(0.012, 6000, 0.03); }
    else if (style === 'drive') { if (s % 4 === 0) kick(0.15); if (s % 8 === 4) noise(0.07, 1800, 0.15, 'bandpass'); noise(s % 2 ? 0.01 : 0.02, 8000, 0.025); }
  }
}
