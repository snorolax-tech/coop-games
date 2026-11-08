// Peer-to-peer networking via PeerJS (uses the free public PeerJS broker for matchmaking only;
// game data flows directly between the two browsers over WebRTC).
import Peer from 'peerjs';

const PREFIX = 'cookshowchaos-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');

export class Net {
  constructor() {
    this.peer = null; this.conn = null;
    this.isHost = false;
    this.handlers = { data: () => {}, open: () => {}, close: () => {}, error: () => {}, stream: () => {}, call: () => {} };
    this.lastRecv = 0;
    this.closed = false;
    this.hb = null;
  }
  on(ev, fn) { this.handlers[ev] = fn; return this; }

  host(onCode) {
    this.isHost = true;
    const tryOpen = (attempt = 0) => {
      const code = makeCode();
      const peer = new Peer(PREFIX + code, { debug: 1 });
      this.peer = peer;
      peer.on('open', () => onCode(code));
      peer.on('connection', (conn) => {
        if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
        this.attach(conn);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && attempt < 5) { peer.destroy(); tryOpen(attempt + 1); return; }
        this.handlers.error(friendlyError(err));
      });
      peer.on('disconnected', () => { if (!this.closed && !this.conn) peer.reconnect(); });
    };
    tryOpen();
  }

  join(code) {
    this.isHost = false;
    const peer = new Peer({ debug: 1 });
    this.peer = peer;
    if (this.voiceStream) this.listenForVoice(this.voiceStream);
    let timeout = setTimeout(() => this.handlers.error('Could not reach that room. Check the code and try again.'), 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true, serialization: 'json' });
      conn.on('open', () => clearTimeout(timeout));
      this.attach(conn);
    });
    peer.on('error', (err) => { clearTimeout(timeout); this.handlers.error(friendlyError(err)); });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.lastRecv = performance.now();
      this.handlers.open();
      this.hb = setInterval(() => {
        this.send({ t: 'hb' });
        if (performance.now() - this.lastRecv > 8000) this.drop('Lost connection to your friend (they left or their internet dropped).');
      }, 1000);
    });
    conn.on('data', (msg) => {
      this.lastRecv = performance.now();
      if (!msg || msg.t === 'hb') return;
      if (msg.t === 'full') { this.drop('That room is already full (2 players max).'); return; }
      this.handlers.data(msg);
    });
    conn.on('close', () => this.drop('Your friend disconnected.'));
    conn.on('error', () => this.drop('Connection error.'));
  }

  drop(reason) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.hb);
    this.handlers.close(reason);
    this.destroy();
  }

  // ---- voice: host calls, client answers ----
  callVoice(stream) {
    if (!this.peer || !this.conn) return;
    const c = this.peer.call(this.conn.peer, stream, { sdpTransform: tuneOpus });
    if (!c) return;
    this.media = c;
    c.on('stream', (s) => this.handlers.stream(s, c));
  }
  listenForVoice(getStream) {
    this.peer.on('call', async (c) => {
      this.media = c;
      c.on('stream', (s) => this.handlers.stream(s, c));
      c.answer(await getStream(), { sdpTransform: tuneOpus });
    });
  }

  // 'direct' (peer-to-peer) or 'relay' (bouncing through the free TURN server — laggier)
  async connectionType() {
    const pc = this.conn?.peerConnection; if (!pc) return null;
    try {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
      if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || s.selected)) pair = s; });
      if (!pair) return null;
      const lc = stats.get(pair.localCandidateId), rc = stats.get(pair.remoteCandidateId);
      return lc?.candidateType === 'relay' || rc?.candidateType === 'relay' ? 'relay' : 'direct';
    } catch { return null; }
  }

  get connected() { return !!(this.conn && this.conn.open); }
  send(msg) { if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch { /* ignore */ } } }
  destroy() {
    this.closed = true;
    clearInterval(this.hb);
    try { this.media?.close(); } catch { /* */ }
    try { this.conn?.close(); } catch { /* */ }
    try { this.peer?.destroy(); } catch { /* */ }
    this.conn = null; this.peer = null;
  }
}

// Ask Opus for proper voice quality: 64 kbps, forward error correction (survives packet loss),
// no discontinuous-transmission dropouts, mono.
function tuneOpus(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  const pt = m[1];
  const params = 'minptime=10;useinbandfec=1;usedtx=0;maxaveragebitrate=64000;stereo=0;sprop-stereo=0';
  const fmtp = new RegExp(`a=fmtp:${pt} [^\\r\\n]*`);
  return fmtp.test(sdp) ? sdp.replace(fmtp, `a=fmtp:${pt} ${params}`) : sdp.replace(m[0], `${m[0]}\r\na=fmtp:${pt} ${params}`);
}

function friendlyError(err) {
  switch (err?.type) {
    case 'peer-unavailable': return 'No game found with that code. Double-check it with your friend!';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your internet connection.';
    case 'browser-incompatible': return 'Your browser does not support WebRTC. Try Chrome, Edge or Firefox.';
    default: return 'Network error: ' + (err?.type || err?.message || 'unknown');
  }
}
