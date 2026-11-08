// Peer-to-peer co-op with PeerJS (uses the free public PeerJS broker, no server of our own).
// The host is authoritative: it simulates the world, owns the save, and broadcasts
// snapshots ~20x/second. The guest moves its own rancher locally (so it feels instant),
// sends its pose + action requests, and renders whatever the host says the world is.
import Peer from 'peerjs';

const PREFIX = 'monster-ranch-v1-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SEND_HZ = 20;

function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class Net {
  constructor() {
    this.role = 'solo'; // 'solo' | 'host' | 'guest'
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.handlers = {};   // message type -> fn(msg)
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onDisconnect = null;
    this._sendT = 0;
    this.lastRecv = 0;
  }

  get online() { return this.role !== 'solo'; }
  get connected() { return !!(this.conn && this.conn.open); }

  on(type, fn) { this.handlers[type] = fn; }

  /** Become a host. Resolves with the room code once the broker has registered us. */
  host() {
    return new Promise((resolve, reject) => {
      const tryOpen = (attempt) => {
        const code = makeCode();
        const peer = new Peer(PREFIX + code, { debug: 1 });
        let opened = false;
        peer.on('open', () => {
          opened = true;
          this.peer = peer; this.code = code; this.role = 'host';
          resolve(code);
        });
        peer.on('connection', (conn) => this._acceptGuest(conn));
        peer.on('error', (err) => {
          if (!opened && err.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
          if (!opened) { peer.destroy(); reject(friendlyError(err)); return; }
          console.warn('[net] host error', err);
        });
        peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
      };
      tryOpen(0);
    });
  }

  _acceptGuest(conn) {
    if (this.conn && this.conn.open) {
      conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
      return;
    }
    this.conn = conn;
    conn.on('open', () => { this.lastRecv = performance.now(); });
    conn.on('data', (msg) => this._recv(msg));
    conn.on('close', () => this._lost());
    conn.on('error', () => this._lost());
  }

  /** Join a host by room code. Resolves when the data channel is open. */
  join(code) {
    code = code.trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      let done = false;
      const fail = (e) => { if (done) return; done = true; peer.destroy(); reject(e); };
      const timer = setTimeout(() => fail(new Error('Could not reach that ranch (timed out). Check the code and try again.')), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        conn.on('open', () => {
          if (done) return;
          done = true; clearTimeout(timer);
          this.peer = peer; this.conn = conn; this.role = 'guest'; this.code = code;
          this.lastRecv = performance.now();
          conn.on('data', (msg) => this._recv(msg));
          conn.on('close', () => this._lost());
          conn.on('error', () => this._lost());
          resolve();
        });
        conn.on('error', (e) => fail(friendlyError(e)));
      });
      peer.on('error', (e) => { clearTimeout(timer); fail(friendlyError(e)); });
    });
  }

  _recv(msg) {
    this.lastRecv = performance.now();
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'full') { this.leave(); this.onDisconnect?.('That ranch already has two ranchers.'); return; }
    if (msg.t === 'bye') { this._lost(msg.reason); return; }
    const h = this.handlers[msg.t];
    if (h) h(msg);
  }

  _lost(reason) {
    if (this.role === 'host') {
      if (this.conn) { this.conn = null; this.onPeerLeave?.(reason); }
    } else if (this.role === 'guest') {
      const r = reason || 'Lost connection to the host.';
      this.leave();
      this.onDisconnect?.(r);
    }
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); } catch (e) { console.warn('[net] send failed', e); }
    }
  }

  /** Call every frame; returns true when it's time to send a state/pose packet. */
  tick(dt) {
    if (!this.connected) return false;
    // heartbeat timeout
    if (performance.now() - this.lastRecv > 10000) { this._lost('Connection timed out.'); return false; }
    this._sendT += dt;
    if (this._sendT >= 1 / SEND_HZ) { this._sendT = 0; return true; }
    return false;
  }

  leave() {
    if (this.conn) { try { this.conn.send({ t: 'bye', reason: this.role === 'host' ? 'The host closed the ranch.' : 'Your friend left.' }); } catch { /* */ } }
    const c = this.conn, p = this.peer;
    this.conn = null; this.peer = null;
    setTimeout(() => { try { c?.close(); } catch { /* */ } try { p?.destroy(); } catch { /* */ } }, 150);
    this.role = 'solo'; this.code = null;
  }
}

function friendlyError(err) {
  const type = err?.type;
  if (type === 'peer-unavailable') return new Error('No ranch found with that code.');
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return new Error('Could not reach the matchmaking server. Check your internet connection.');
  if (type === 'browser-incompatible') return new Error('This browser does not support WebRTC.');
  return new Error(err?.message || 'Connection failed.');
}
