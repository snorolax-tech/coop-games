// Voice chat: microphone capture, the partner's voice (proximity volume), talking indicators,
// and recording YOUR voice onto the tape (MediaRecorder runs only while the camera is recording).
// After the episode the two players swap recordings so the replay has both voices.

// Blob <-> base64 chunks so a recording can travel over the PeerJS data channel.
export async function blobToChunks(blob, size = 48000) {
  const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
  const out = []; for (let i = 0; i < b64.length; i += size) out.push(b64.slice(i, i + size));
  return { type: blob.type, chunks: out };
}
export function chunksToUrl(type, chunks) {
  const bin = atob(chunks.join(''));
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: type || 'audio/webm' }));
}
export class Voice {
  constructor(micEnabled = true, headphones = false) {
    this.micEnabled = micEnabled;
    this.headphones = headphones;
    this.ctx = null; this.local = null; this.remote = null; this.remoteEl = null;
    this.muted = false; this.micDenied = false; this.pc = null;
    this.recorder = null; this.chunks = []; this.recState = 'idle';
    this.localLevel = 0; this.remoteLevel = 0;
    this._ready = null;
  }
  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.mix = this.ctx.createMediaStreamDestination(); // what gets recorded (both voices)
      this.silent = this.ctx.createMediaStreamDestination(); // placeholder track we send when there's no mic
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  // Ask for the mic once. Resolves to a stream (real mic, or silence if denied) so calls still connect.
  ready() {
    if (!this._ready) {
      this._ready = (async () => {
        this.ensureCtx();
        if (this.micEnabled && await this.getMic()) return this.local;
        return this.silent.stream; // NOT the mix — that would echo your partner back to them
      })();
    }
    return this._ready;
  }
  // Headphones = no echo risk, so skip echo cancellation / noise suppression, which chop and
  // "underwater" the voice (especially when both people talk at once).
  constraints() {
    const hp = this.headphones;
    return { audio: { echoCancellation: !hp, noiseSuppression: !hp, autoGainControl: true, channelCount: 1, sampleRate: 48000, sampleSize: 16 } };
  }
  async getMic() {
    if (this.local) return true;
    try {
      this.local = await navigator.mediaDevices.getUserMedia(this.constraints());
      this.micDenied = false;
      this.localSrc = this.ctx.createMediaStreamSource(this.local);
      this.localAnalyser = this.ctx.createAnalyser(); this.localAnalyser.fftSize = 256;
      this.localSrc.connect(this.localAnalyser);
      this.localSrc.connect(this.mix);
      this.setMuted(this.muted);
      return true;
    } catch { this.micDenied = true; return false; }
  }
  // Switch headphones mode live: grab the mic again with new processing and swap it into the call.
  async setHeadphones(on) {
    this.headphones = on;
    if (!this.local) return;
    this.local.getTracks().forEach((t) => t.stop());
    try { this.localSrc?.disconnect(); } catch { /* */ }
    this.local = null;
    if (await this.getMic()) {
      const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'audio' || !s.track);
      if (sender) { try { await sender.replaceTrack(this.local.getAudioTracks()[0]); } catch { /* */ } }
    }
  }
  // Turn the mic on later (e.g. toggled in the lobby): swap it into the existing call.
  async enableMic() {
    this.micEnabled = true; this.ensureCtx();
    if (!(await this.getMic())) return false;
    const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'audio' || !s.track);
    if (sender) { try { await sender.replaceTrack(this.local.getAudioTracks()[0]); } catch { /* */ } }
    this.setMuted(false);
    return true;
  }
  attachRemote(stream, call) {
    this.ensureCtx();
    this.remote = stream;
    if (call?.peerConnection) this.pc = call.peerConnection;
    // Chrome only feeds remote WebRTC audio into Web Audio if it's also attached to a media element
    if (!this.remoteEl) { this.remoteEl = new Audio(); this.remoteEl.autoplay = true; }
    this.remoteEl.srcObject = stream;
    this.remoteEl.play().catch(() => {});
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      this.remoteAnalyser = this.ctx.createAnalyser(); this.remoteAnalyser.fftSize = 256;
      src.connect(this.remoteAnalyser);
      // (not recorded here — each player records their OWN mic and they're swapped after the episode)
    } catch { /* ignore */ }
  }
  setRemoteVolume(v) { if (this.remoteEl) this.remoteEl.volume = Math.max(0, Math.min(1, v)); }
  setMuted(m) {
    this.muted = m;
    this.local?.getAudioTracks().forEach((t) => { t.enabled = !m; });
  }
  level(an) {
    if (!an) return 0;
    const d = new Uint8Array(an.fftSize); an.getByteTimeDomainData(d);
    let s = 0; for (const x of d) { const v = (x - 128) / 128; s += v * v; }
    return Math.sqrt(s / d.length);
  }
  updateLevels() {
    this.localLevel = this.muted ? 0 : this.level(this.localAnalyser);
    this.remoteLevel = this.level(this.remoteAnalyser);
  }
  get hasAnything() { return !!(this.local || this.remote); }

  // ---- Tape audio: follows the camera's REC state so audio lines up with the video ----
  syncRec(rec) {
    if (!this.local || typeof MediaRecorder === 'undefined') return;
    if (rec && this.recState === 'idle') {
      try {
        this.chunks = [];
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m));
        this.recorder = new MediaRecorder(this.mix.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
        this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
        this.recorder.start(250);
        this.recState = 'rec';
      } catch { this.recState = 'broken'; }
    } else if (rec && this.recState === 'paused') { this.recorder.resume(); this.recState = 'rec'; }
    else if (!rec && this.recState === 'rec') { this.recorder.pause(); this.recState = 'paused'; }
  }
  // Finish the tape audio → Blob of MY voice (or null)
  finishRec() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recState === 'idle' || this.recState === 'broken') { this.recState = 'idle'; return resolve(null); }
      const r = this.recorder;
      r.onstop = () => { const blob = new Blob(this.chunks, { type: r.mimeType || 'audio/webm' }); this.chunks = []; resolve(blob.size ? blob : null); };
      try { r.stop(); } catch { resolve(null); }
      this.recorder = null; this.recState = 'idle';
    });
  }
  destroy() {
    try { this.recorder?.stop(); } catch { /* */ }
    this.local?.getTracks().forEach((t) => t.stop());
    if (this.remoteEl) { this.remoteEl.srcObject = null; this.remoteEl = null; }
    try { this.ctx?.close(); } catch { /* */ }
  }
}
