// Glue: renderer, input, networking, syncing the host's world state into meshes.
import * as THREE from 'three';
import { Net } from './net.js';
import { Town, LAYOUT, BENCH, CONTAINER_NAMES, STORAGE } from './town.js';
import { Director, wallBox } from './director.js';
import { Player, HOTBAR } from './player.js';
import { Character, PLAYER_COLORS } from './character.js';
import { ZombieModel, ZTYPES } from './zombies.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { analyze, itemMesh, makeItem, combine, MAX_PARTS, repairPair } from './items.js';
import { sfx, sfx3d, unlockAudio } from './audio.js';

// eslint-disable-next-line no-undef
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const ZT = Object.keys(ZTYPES);

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 300);
    this.scene.add(this.camera);
    this.town = new Town(this.scene);
    this.fx = new FX(this.scene);
    this.net = new Net();
    this.mode = 'menu';
    this.me = 0;
    this.director = null;
    this.state = null; this.netState = null;
    this.player = null;
    this.friendPose = null; this.friendTarget = null;
    this.zModels = new Map();
    this.stMeshes = new Map();
    this.groundMeshes = new Map();
    this.zoneMeshes = new Map();
    this.prompt = '';
    this.reviveT = 0;
    this.t = 0;
    this.lastPh = null;

    // input
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { down: false, pressed: false };
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.code === 'Tab' && this.mode !== 'menu' && this.player && !this.ui.crafting) { if (this.ui.invOpen) this.closeInv(); else this.openInv(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      unlockAudio();
      if (this.ui.crafting || this.ui.invOpen || this.mode === 'menu') return;
      if (!this.locked) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) { this.mouse.down = true; this.mouse.pressed = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked || !this.player) return;
      this.player.yaw -= e.movementX * 0.0024;
      this.player.pitch = Math.max(-1.45, Math.min(1.45, this.player.pitch - e.movementY * 0.0024));
    });
    addEventListener('wheel', (e) => {
      if (!this.player || this.ui.crafting) return;
      if (this.ui.invOpen) return;
      const n = HOTBAR;
      this.player.sel = (this.player.sel + (e.deltaY > 0 ? 1 : -1) + n) % n;
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (!this.locked) this.mouse.down = false; });
    addEventListener('resize', () => this._resize());
    this._resize();

    this.ui = new UI(uiRoot, {
      onHost: () => this.startHost(), onJoin: (c) => this.joinGame(c), onSolo: () => this.startSolo(),
      onLeave: () => this.leave(), onRestart: () => this.restart(),
      onCloseCraft: () => this.closeCraft(), onCraft: (picked) => this.doCraft(picked), onRepair: (picked) => this.doRepair(picked),
      onCloseInv: () => this.closeInv(),
      onStore: (invIdx, slot) => {
        const it = this.player.inv[invIdx]; if (!it) return;
        this.player.inv[invIdx] = null;
        if (this.isHost) this.director.store(this.me, it, slot); else this.send({ t: 'store', item: it, slot });
        sfx('loot');
      },
      onWithdraw: (idx, slot) => { if (this.isHost) this.director.withdraw(this.me, idx, slot); else this.send({ t: 'withdraw', idx, slot }); },
      onStorageMove: (a, b) => { if (this.isHost) this.director.moveStorage(a, b); else this.send({ t: 'smove', a, b }); },
      onDropItem: (invIdx) => {
        const P = this.player, it = P.inv[invIdx]; if (!it) return;
        const f = _v.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
        this._drop(it, P.pos.x + f.x * 1.5, P.pos.z + f.z * 1.5); P.inv[invIdx] = null; sfx('throw');
      },
    });
    this.ui.version(BUILD_ID);
    this._setupNet();
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  _resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  get isHost() { return this.mode === 'solo' || this.mode === 'host'; }
  get crafting() { return this.ui.crafting || this.ui.invOpen; }

  // ------------------------------------------------------------ modes
  _begin() {
    this.player = this.player || new Player(this, this.camera);
    this.player.setColor(PLAYER_COLORS[this.me]);
    this.player.reset();
    if (this.friendChar) { this.scene.remove(this.friendChar.root); this.friendChar = null; }
    this.ui.showMenu(false);
    this.lastPh = null;
  }
  startSolo() { unlockAudio(); this.mode = 'solo'; this.me = 0; this.director = new Director(1); this._begin(); }
  async startHost() {
    unlockAudio();
    this.ui.status('Opening the town…');
    try { await this.net.host(); this.mode = 'host'; this.me = 0; this.director = new Director(1); this._begin(); }
    catch (e) { this.ui.status(e.message, true); }
  }
  async joinGame(code) {
    unlockAudio();
    this.ui.status('Connecting…');
    try {
      await this.net.join(code);
      this.mode = 'guest'; this.me = 1; this.director = null; this.netState = null;
      this.net.send({ t: 'hello', build: BUILD_ID });
      this._begin();
    } catch (e) { this.ui.status(e.message, true); }
  }
  leave(reason = '') {
    if (this.grabArm) { this.scene.remove(this.grabArm); this.grabArm = null; } this.grabbed = null;
    if (this.net.online) this.net.leave();
    this.mode = 'menu'; this.director = null; this.state = this.netState = null;
    this.friendPose = this.friendTarget = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this._clearWorld();
    this.ui.showMenu(true, reason, !!reason);
  }
  restart() {
    if (this.isHost) this.director.voteRestart(0);
    else this.net.send({ t: 'restart' });
  }
  toast(msg, color) { this.ui.toast(msg, color); }

  // ------------------------------------------------------------ actions (routed to host)
  send(msg) { if (this.net.connected) this.net.send(msg); }
  _hostPlayers() { return this.mode === 'host' ? [this.player.pose(), this.net.connected ? this.friendPose : null] : [this.player.pose()]; }
  hitZ(h) {
    if (h.k !== 'flame') {
      // instant local feedback, before the host even answers
      (this._myHits ||= new Map()).set(h.id, performance.now());
      const m = this.zModels.get(h.id);
      if (m) { m.flinch = 0.25; m.flashT = 0.08; this.fx.blood(_v.set(m.x, 1.5 * ZTYPES[m.type].scale, m.z), h.k === 'melee' ? 8 : 4); }
      this.ui.hitMarker(false);
      if (h.k === 'melee') this.hitStop = Math.max(this.hitStop || 0, 0.055);
    }
    if (this.isHost) this.director.hitZ(h, this._hostPlayers()); else this.send({ t: 'hitZ', h });
  }
  land(l) { if (this.isHost) this.director.land(l, this._hostPlayers()); else this.send({ t: 'land', l }); }
  place(item, x, z, rot) { if (this.isHost) this.director.place(this.me, item, x, z, rot); else this.send({ t: 'place', item, x, z, rot }); }
  _loot(cid) { if (this.isHost) this.director.loot(this.me, cid); else this.send({ t: 'loot', cid }); }
  _take(gid) { if (this.isHost) this.director.take(this.me, gid); else this.send({ t: 'take', gid }); }
  _drop(item, x, z) { if (this.isHost) this.director.drop(item, x, z); else this.send({ t: 'drop', item, x, z }); }

  zombieList() { return [...this.zModels.values()].filter((m) => !m.dead).map((m) => ({ id: m.id, x: m.x, z: m.z, scale: ZTYPES[m.type].scale })); }

  _setupNet() {
    const n = this.net;
    n.on('hello', (m) => {
      if (this.mode !== 'host') return;
      if (m.build !== BUILD_ID) { n.send({ t: 'bye', reason: 'Version mismatch: you both need to refresh the page.' }); setTimeout(() => n.dropGuest(), 300); return; }
      this.director.nPlayers = 2;
      this.toast('Your friend joined!', '#9be564');
    });
    n.on('p', (m) => { this.friendTarget = m; if (!this.friendPose) this.friendPose = { ...m }; });
    n.on('hitZ', (m) => this.isHost && this.director.hitZ(m.h, this._hostPlayers()));
    n.on('land', (m) => this.isHost && this.director.land(m.l, this._hostPlayers()));
    n.on('place', (m) => this.isHost && this.director.place(1, m.item, m.x, m.z, m.rot));
    n.on('loot', (m) => this.isHost && this.director.loot(1, m.cid));
    n.on('take', (m) => this.isHost && this.director.take(1, m.gid));
    n.on('drop', (m) => this.isHost && this.director.drop(m.item, m.x, m.z));
    n.on('store', (m) => this.isHost && this.director.store(1, m.item, m.slot));
    n.on('withdraw', (m) => this.isHost && this.director.withdraw(1, m.idx, m.slot));
    n.on('smove', (m) => this.isHost && this.director.moveStorage(m.a, m.b));
    n.on('skip', () => this.isHost && this.director.voteSkip(1));
    n.on('restart', () => this.isHost && this.director.voteRestart(1));
    n.on('revive', () => this.player?.revive());
    n.on('s', (m) => { this.netState = m.s; });
    n.on('ev', (m) => this.onEvent(m.e));
    n.on('fx', (m) => { if (m.k === 'proj' && this.player) this.player._spawnProjectile(m.kind, m.parts, new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.kind === 'throw' ? 18 : 3, false); });
    n.onPeerLeave = () => {
      if (this.mode !== 'host') return;
      this.director.nPlayers = 1; this.friendPose = this.friendTarget = null;
      this.toast('Your friend left.', '#f77');
    };
    n.onDisconnect = (r) => this.leave(r);
  }

  /** world-positioned sound */
  s3(name, x, z, throttle = 0, range = 60) { const P = this.player; if (P) sfx3d(name, x, z, P.pos.x, P.pos.z, P.yaw, throttle, range); }

  /** a hand bursts out of the dumpster and holds you. mash E to get free */
  _startGrab(e) {
    const P = this.player;
    this.scare(true);
    sfx('growl');
    this.grabbed = { t: 0, presses: 0, need: 9, x: e.x, z: e.z, hurtT: 0.5 };
    const arm = this.grabArm = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x7fa36a, flatShading: true, roughness: 0.9 });
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.8), skin); fore.position.z = 0.9; arm.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.3), skin); hand.position.z = 1.9; arm.add(hand);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), skin); f.position.set(-0.11 + i * 0.075, -0.04, 2.12); f.rotation.x = 0.5; arm.add(f); }
    const dl = Math.hypot(P.pos.x - e.x, P.pos.z - e.z) || 1;
    arm.position.set(e.x + (P.pos.x - e.x) / dl * 0.6, 1.55, e.z + (P.pos.z - e.z) / dl * 0.6);
    arm.lookAt(P.pos.x, 0.9, P.pos.z);
    this.scene.add(arm);
  }
  /** show the arm holding your friend for a few seconds */
  _friendGrabbed(e) {
    const f = this.friendPose; if (!f) return;
    this.s3('growl', e.x, e.z);
    const arm = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x7fa36a, flatShading: true });
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1), skin); fore.position.z = 0.5; arm.add(fore);
    arm.position.set(e.x, 1.5, e.z); this.scene.add(arm);
    const t0 = this.t;
    const tick = () => {
      if (this.t - t0 > 4 || !this.friendPose) { this.scene.remove(arm); return; }
      const fp = this.friendPose, d = Math.hypot(fp.x - e.x, fp.z - e.z);
      arm.lookAt(fp.x, 1, fp.z); arm.scale.z = Math.max(0.3, d - 0.3);
      requestAnimationFrame(tick);
    };
    tick();
  }

  _updateGrab(dt) {
    const G = this.grabbed, P = this.player;
    G.t += dt;
    const want = Math.atan2(-(G.x - P.pos.x), -(G.z - P.pos.z));
    P.yaw += Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw)) * Math.min(1, dt * 5);
    P.pitch += (-0.15 - P.pitch) * Math.min(1, dt * 5);
    const d = Math.hypot(G.x - P.pos.x, G.z - P.pos.z);
    if (d > 2.9) { P.pos.x += (G.x - P.pos.x) / d * dt * 2; P.pos.z += (G.z - P.pos.z) / d * dt * 2; }
    this.grabArm.lookAt(P.pos.x, 0.9 + Math.sin(this.t * 25) * 0.08, P.pos.z);
    this.grabArm.scale.z = Math.min(1.2, Math.max(0.3, (d - 0.9) / 2.1));
    G.hurtT -= dt;
    if (G.hurtT <= 0) { G.hurtT = 0.5; P.hurt(3); }
    if (this.pressed.has('KeyE')) { G.presses++; sfx('breakfree', 40); P.kick = -0.03; }
    const n = Math.min(G.need, G.presses);
    this.prompt = `<span style="color:#ff6060;font-weight:900">IT'S GOT YOU! MASH <b>E</b></span> ${'▮'.repeat(n)}${'▯'.repeat(G.need - n)}`;
    const done = G.presses >= G.need, timeout = G.t > 7;
    if (done || timeout || P.down) {
      if (timeout && !P.down) { P.hurt(18); this.toast('It bit you before you got away!', '#ff6060'); }
      else if (done) { sfx('breakfree'); this.toast('You broke free!', '#9be564'); }
      this.scene.remove(this.grabArm); this.grabArm = null; this.grabbed = null;
    }
  }

  scare(force) {
    const now = performance.now();
    if (!force && now - (this._lastScare || 0) < 6000) return;
    this._lastScare = now;
    this.ui.jumpScare();
    sfx('scare');
    this.player.hurtT = 0.6;
  }

  // ------------------------------------------------------------ events
  onEvent(e) {
    const me = this.me, P = this.player;
    switch (e.k) {
      case 'loot':
        if (e.p === me) {
          sfx('loot');
          const got = [];
          for (const id of e.items) {
            const it = makeItem([id]);
            if (P.addItem(it)) got.push(analyze(it.parts).name);
            else { this._drop(it, P.pos.x, P.pos.z); this.toast('Inventory full: dropped ' + analyze(it.parts).name, '#f99'); }
          }
          if (got.length) this.toast('Found: ' + got.join(', '), '#ffe066');
          else if (!e.lurker) this.toast('Nothing useful in there…', '#aaa');
        }
        break;
      case 'take':
        if (e.p === me) {
          if (e.slot != null && !P.inv[e.slot]) { P.inv[e.slot] = e.item; sfx('loot'); }
          else if (!P.addItem(e.item)) { this._drop(e.item, P.pos.x, P.pos.z); this.toast('Inventory full', '#f99'); }
          else sfx('loot');
        }
        break;
      case 'hurt': if (e.p === me) P.hurt(e.dmg, e.kb); break;
      case 'deny': if (e.p === me && e.why) this.toast(e.why, '#f99'); break;
      case 'scare': if (e.p === me) this.scare(e.kind === 'lurker'); else this.s3('shriek', e.x, e.z); break;
      case 'shriek': this.s3('shriek', e.x, e.z, 250); break;
      case 'blackout':
        if (e.on) { sfx('blackout'); this.toast('⚡ The power just went out…', '#ff6a4a'); }
        else { sfx('power'); this.toast('💡 Power is back', '#ffe066'); }
        break;
      case 'boss':
        sfx('bossintro');
        this.toast(`☠ ${e.name} HAS ARRIVED ☠`, '#ff3030');
        P.hurtT = Math.max(P.hurtT, 0.5);
        break;
      case 'roar': this.s3('roar', e.x, e.z, 0, 90); break;
      case 'charge': this.s3('charge', e.x, e.z, 0, 70); break;
      case 'spit':
        this.s3('spit', e.a[0], e.a[1]);
        for (let i = 0; i < 12; i++) this.fx.gas(_v.set(e.a[0] + (e.b[0] - e.a[0]) * i / 12, 2.5 + Math.sin(i / 12 * Math.PI) * 3, e.a[1] + (e.b[1] - e.a[1]) * i / 12));
        break;
      case 'blink': this.s3('blink', e.x, e.z); if (e.p === me) this.s3('whisper', e.x, e.z); break;
      case 'scream': this.s3('scream', e.x, e.z, 0, 90); break;
      case 'stun': if (e.p === me) { P.stunT = e.t; P.hurtT = 0.4; } break;
      case 'alarm': {
        this.town.alarm(e.cid, 9);
        for (let i = 0; i < 14; i++) setTimeout(() => this.s3('horn', e.x, e.z, 0, 90), i * 640);
        this.toast('🚨 You set off a car alarm! They heard that…', '#ff6a4a');
        break;
      }
      case 'grab':
        this.s3('lid', e.x, e.z);
        if (e.p === me) this._startGrab(e);
        else this._friendGrabbed(e);
        break;
      case 'boom':
        sfx(e.big ? 'boom' : 'throw');
        if (e.big) this.fx.explosion(_v.set(e.x, 1, e.z), Math.min(2, e.r / 3));
        else if (e.toxic) for (let i = 0; i < 20; i++) this.fx.gas(_v.set(e.x + (Math.random() - 0.5) * e.r, 0.5, e.z + (Math.random() - 0.5) * e.r));
        else this.fx.sparks(_v.set(e.x, 0.5, e.z), 10, 0xff9933);
        if (e.big && Math.hypot(P.pos.x - e.x, P.pos.z - e.z) < 18) P.hurtT = Math.max(P.hurtT, 0.15);
        break;
      case 'zdie': {
        this.s3('zdie', e.x, e.z, 60);
        this.fx.blood(_v.set(e.x, 1.2, e.z), 14);
        const m = this.zModels.get(e.id);
        if (m && !m.dead) m.die(e.dx, e.dz, e.big, this.fx);
        if (this._myHits?.get(e.id) > performance.now() - 3000) { this.ui.hitMarker(true); sfx('kill'); this._myHits.delete(e.id); }
        break;
      }
      case 'zap': sfx('zap', 80); this.fx.zap(_v.set(e.a[0], 1.3, e.a[1]), _w.set(e.b[0], 1.3, e.b[1])); break;
      case 'night': sfx('night'); this.toast(`🌙 Night ${e.day} — they're coming!`, '#ff8080'); break;
      case 'dawn': if (e.day > 1) { sfx('dawn'); this.toast(`☀ You survived the night! Day ${e.day}`, '#ffe066'); this.toast('A few containers have been restocked', '#ccc'); } break;
      case 'place': sfx('build'); break;
      case 'break': sfx('break'); this.fx.sparks(_v.set(e.x, 0.8, e.z), 16, 0xccaa77); break;
      case 'whit': sfx('hit', 150); this.fx.sparks(_v.set(e.x, 1, e.z), 4, 0xccaa77); break;
      case 'fuse': sfx('fuse'); break;
      case 'over': sfx('down'); break;
    }
  }

  _onPhase(prev, ph) {
    if (ph === 'over' && document.pointerLockElement) document.exitPointerLock();
    if (prev === 'over' && ph === 'day') { this.player.reset(); this._clearWorld(); }
  }

  // ------------------------------------------------------------ crafting
  get nearStorage() { const P = this.player; return P && Math.hypot(STORAGE.x - P.pos.x, STORAGE.z - P.pos.z) < 2.8; }
  openInv(withStorage = this.nearStorage) { if (document.pointerLockElement) document.exitPointerLock(); this.ui.openInv(this.player, withStorage); }
  closeInv() { this.ui.closeInv(); if (this.state?.ph !== 'over') this.canvas.requestPointerLock?.(); }

  openCraft() { if (document.pointerLockElement) document.exitPointerLock(); this.ui.openCraft(this.player); }
  closeCraft() { this.ui.closeCraft(); this.canvas.requestPointerLock?.(); }
  doRepair(picked) {
    const P = this.player;
    const items = picked.map((i) => P.inv[i]);
    const r = items.length === 2 && repairPair(items[0], items[1]);
    if (!r) return;
    r.target.uses += r.amount;
    P.inv[P.inv.indexOf(r.mat)] = null;
    sfx('craft');
    this.toast(`${r.label} on your ${analyze(r.target.parts).name}`, '#7fd3ff');
    this.ui.picked = [];
    this.ui.renderCraft();
  }

  doCraft(picked) {
    const P = this.player;
    const items = picked.map((i) => P.inv[i]).filter(Boolean);
    if (items.length < 2) return;
    const it = combine(items);
    for (const i of picked) P.inv[i] = null;
    P.addItem(it);
    const ni = P.inv.indexOf(it);
    if (ni >= 0 && ni < HOTBAR) P.sel = ni;
    else if (ni >= HOTBAR) this.toast('Hotbar full: it went into your backpack (Tab)', '#ccc');
    const a = analyze(it.parts);
    sfx('craft');
    this.toast(`Crafted: ${a.name}!`, '#f2c230');
    this.ui.picked = [];
    this.ui.renderCraft();
  }

  // ------------------------------------------------------------ frame
  frame() {
    const now = performance.now();
    let dt = this.fixedDt ?? Math.min((now - this._last) / 1000, 0.05);
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    this._last = now; this.t += dt;
    if (this.mode === 'menu') { this._menuCam(dt); this.pressed.clear(); this.mouse.pressed = false; return; }
    const P = this.player;

    // friend pose interpolation
    if (this.friendTarget) {
      const f = this.friendPose, t = this.friendTarget, k = 1 - Math.exp(-15 * dt);
      for (const key of ['x', 'y', 'z']) f[key] += (t[key] - f[key]) * k;
      f.yaw += Math.atan2(Math.sin(t.yaw - f.yaw), Math.cos(t.yaw - f.yaw)) * k;
      Object.assign(f, { down: t.down, hp: t.hp, held: t.held, sw: t.sw, fl: t.fl, pitch: t.pitch });
    }

    if (this.isHost) { this.director.update(dt, this._hostPlayers()); this.state = this.director.state; }
    else this.state = this.netState;
    const s = this.state;
    if (s && s.ph !== this.lastPh) { this._onPhase(this.lastPh, s.ph); this.lastPh = s.ph; }

    // night lighting
    let night = 0;
    if (s) night = s.ph === 'night' || s.ph === 'over' ? 1 : s.t < 12 ? (12 - s.t) / 12 * 0.85 : 0;
    this._night = (this._night ?? night) + (night - (this._night ?? night)) * Math.min(1, dt * 1.5);
    const dusk = s && s.ph === 'day' && s.t < 30 ? (30 - s.t) / 30 : 0;
    this.town.setNight(this._night, P.pos, dusk, !!s?.blackout, this.t);
    if (s) this._ambience(dt, s);

    // player
    const walls = (s?.st || []).filter((q) => q.form === 'wall').map(wallBox);
    const canAct = !this.crafting && !this.grabbed && s && s.ph !== 'over';
    const k = this.keys;
    const inp = {
      mx: canAct ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0,
      mz: canAct ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0,
      jump: canAct && k.has('Space'), sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      fire: this.locked && this.mouse.down, firePressed: this.locked && this.mouse.pressed,
    };
    for (let i = 0; i < 10; i++) if (this.pressed.has('Digit' + ((i + 1) % 10))) P.sel = i;
    P.update(dt, inp, walls, canAct && this.locked);

    if (s) {
      this._interact(s, canAct, dt);
      if (this.pressed.has('KeyN') && s.ph === 'day') { if (this.isHost) this.director.voteSkip(this.me); else this.send({ t: 'skip' }); }
      if (this.pressed.has('KeyG') && P.held && canAct) {
        const f = _v.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
        this._drop(P.held, P.pos.x + f.x * 1.5, P.pos.z + f.z * 1.5); P.removeHeld(); sfx('throw');
      }
      this._syncWorld(dt, s);
    }

    // host events + network
    if (this.isHost) {
      for (const e of this.director.events) { this.onEvent(e); if (this.mode === 'host') this.send({ t: 'ev', e }); }
      this.director.events.length = 0;
    }
    if (this.net.online && this.net.tick(dt)) {
      this.send({ t: 'p', ...P.pose() });
      if (this.mode === 'host' && s) this.send({ t: 's', s });
    }
    this._friendModel(dt);

    this.town.update(dt, this.t);
    this.fx.update(dt);
    this.ui.update(this);
    this.renderer.render(this.scene, this.camera);
    this.pressed.clear(); this.mouse.pressed = false;
  }

  _ambience(dt, s) {
    const P = this.player;
    // countdown to night: siren at 30s, ticks for the last 10
    if (s.ph === 'day') {
      const prev = this._prevT ?? s.t;
      if (prev > 30 && s.t <= 30) { sfx('siren'); this.toast('⚠ Night is coming — get ready!', '#ff8a4a'); }
      if (s.t <= 10 && Math.ceil(prev) !== Math.ceil(s.t) && s.t > 0) sfx('tick10');
      this._prevT = s.t;
    } else this._prevT = null;
    // faces slamming against windows as you walk past houses
    this._winT = (this._winT ?? 20) - dt;
    if (this._winT <= 0 && !P.down) {
      this._winT = 1;
      if (Math.random() < (s.ph === 'night' ? 0.3 : 0.12)) {
        const w = this.town.tryWindowScare(P.pos.x, P.pos.z, P.yaw);
        if (w) { this._winT = 35 + Math.random() * 30; this.s3('bang', w.x, w.z, 0, 40); P.kick = -0.05; P.hurtT = Math.max(P.hurtT, 0.12); }
      }
    }
    if (s.ph !== 'night' && !s.z.length) return;
    // heartbeat when something is close
    let near = 1e9;
    for (const m of this.zModels.values()) if (!m.dead) near = Math.min(near, Math.hypot(m.x - P.pos.x, m.z - P.pos.z));
    this._hb = (this._hb ?? 0) - dt;
    if (near < 13 && this._hb <= 0 && !P.down) { sfx('heartbeat'); this._hb = 0.35 + near / 13 * 0.9; }
    // creepy noises out in the dark
    if (s.ph === 'night') {
      this._amb = (this._amb ?? 10) - dt;
      if (this._amb <= 0) {
        this._amb = 9 + Math.random() * 18;
        const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 25;
        this.s3(Math.random() < 0.55 ? 'distant' : 'whisper', P.pos.x + Math.cos(a) * d, P.pos.z + Math.sin(a) * d, 0, 70);
      }
    }
    // turning around to find a stalker right behind you
    this._scared ||= new Set();
    for (const m of this.zModels.values()) {
      if (m.type !== 'stalker' || m.dead || this._scared.has(m.id)) continue;
      const dx = m.x - P.pos.x, dz = m.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > 4.5) continue;
      if ((dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d > 0.8) { this._scared.add(m.id); this.scare(); }
    }
  }

  _interact(s, canAct, dt) {
    const P = this.player, f = this.friendPose;
    this.prompt = '';
    if (this.grabbed) { this._updateGrab(dt); return; }
    if (this.ui.invOpen) { if (this.pressed.has('KeyE') || this.pressed.has('Escape')) this.closeInv(); else this.ui.renderInv(s); return; }
    if (this.crafting) { if (this.pressed.has('KeyE') || this.pressed.has('Escape')) this.closeCraft(); return; }
    if (!canAct || P.down) return;
    const ePressed = this.pressed.has('KeyE');
    // revive friend
    if (f && f.down && Math.hypot(f.x - P.pos.x, f.z - P.pos.z) < 2.6) {
      if (this.keys.has('KeyE')) {
        this.reviveT += dt;
        this.prompt = `Reviving… ${'▮'.repeat(Math.ceil(this.reviveT / 2.5 * 10))}${'▯'.repeat(Math.max(0, 10 - Math.ceil(this.reviveT / 2.5 * 10)))}`;
        if (this.reviveT >= 2.5) { this.send({ t: 'revive' }); this.reviveT = 0; this.toast('You revived your friend!', '#9be564'); }
      } else { this.reviveT = 0; this.prompt = '<b>Hold E</b> revive your friend'; }
      return;
    }
    this.reviveT = 0;
    if (Math.hypot(BENCH.x - P.pos.x, BENCH.z - P.pos.z) < 2.8) {
      this.prompt = '<b>E</b> use workbench';
      if (ePressed) this.openCraft();
      return;
    }
    if (this.nearStorage) {
      this.prompt = '<b>E</b> open base storage (shared)';
      if (ePressed) this.openInv(true);
      return;
    }
    const looted = new Set(s.looted);
    let best = null, bd = 1e9;
    for (const c of LAYOUT.C) {
      if (looted.has(c.id)) continue;
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (d < (c.type === 'car' || c.type === 'dumpster' ? 3.3 : 2.4) && d < bd) { bd = d; best = c; }
    }
    if (best) { this.prompt = `<b>E</b> search ${CONTAINER_NAMES[best.type]}`; if (ePressed) this._loot(best.id); return; }
    let gi = null; bd = 2.2;
    for (const g of s.ground) { const d = Math.hypot(g.x - P.pos.x, g.z - P.pos.z); if (d < bd) { bd = d; gi = g; } }
    if (gi) { this.prompt = `<b>E</b> pick up ${analyze(gi.item.parts).name}`; if (ePressed) this._take(gi.id); }
  }

  // ------------------------------------------------------------ world sync (zombies, structures, ground items, zones)
  _syncWorld(dt, s) {
    this.town.setLooted(new Set(s.looted));
    const seen = new Set();
    for (const e of s.z) {
      const [id, ti, x, z, yaw, hp, f] = e;
      seen.add(id);
      let m = this.zModels.get(id);
      if (!m) { m = new ZombieModel(ZT[ti]); m.id = id; m.x = x; m.z = z; this.scene.add(m.root); this.zModels.set(id, m); }
      if (m.dead) continue;
      if (f & 16) m.flashT = 0.1;
      m.update(dt, { x, z, yaw, f, hp }, this.t, this.fx);
      if (f & 1 && Math.random() < dt * 6) this.fx.fire(_v.set(m.x, 1.5, m.z));
      if (Math.random() < dt * 0.08) this.s3('groan', m.x, m.z, 300, 35);
    }
    for (const [id, m] of this.zModels) {
      if (!seen.has(id) && !m.dead) m.die(0, 0, false, this.fx);
      if (m.dead && !m.update(dt, null, this.t, this.fx)) { this.scene.remove(m.root); this.zModels.delete(id); }
    }
    this._syncMap(this.stMeshes, s.st, (st) => this._structureMesh(st), (m, st) => {
      if (st.form === 'trap' && m.userData.spin) m.userData.spin.rotation.y += dt * (st.spin ? 25 : 2);
      if (st.form === 'magnet') m.userData.ring.scale.setScalar(1 + (this.t * 0.8 % 1) * 6), m.userData.ring.material.opacity = 0.5 * (1 - this.t * 0.8 % 1);
      if (st.form === 'mine') m.userData.led.visible = Math.floor(this.t * 3) % 2 === 0;
      if (m.userData.hpBar) m.userData.hpBar.scale.x = Math.max(0.01, st.hp / st.maxHp);
    });
    this._syncMap(this.groundMeshes, s.ground, (g) => {
      const m = new THREE.Group(); const im = itemMesh(g.item.parts, 0.9); im.rotation.set(Math.PI / 2, 0, 0); m.add(im);
      m.position.set(g.x, 0.25, g.z); return m;
    }, (m) => { m.rotation.y += dt; });
    this._syncMap(this.zoneMeshes, s.zones, (zn) => {
      const col = zn.kind === 'fire' ? 0xff6a00 : zn.kind === 'gas' ? 0x9acd32 : 0xff4fa3;
      const m = new THREE.Mesh(new THREE.CircleGeometry(zn.r, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: zn.kind === 'lure' ? 0.12 : 0.4, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(zn.x, 0.06, zn.z); return m;
    }, (m, zn) => {
      if (zn.kind === 'fire' && Math.random() < dt * 25) this.fx.fire(_v.set(zn.x + (Math.random() - 0.5) * zn.r * 1.6, 0.2, zn.z + (Math.random() - 0.5) * zn.r * 1.6));
      if (zn.kind === 'gas' && Math.random() < dt * 12) this.fx.gas(_v.set(zn.x + (Math.random() - 0.5) * zn.r * 1.6, 0.3, zn.z + (Math.random() - 0.5) * zn.r * 1.6));
      if (zn.kind === 'lure') m.material.opacity = 0.08 + Math.sin(this.t * 10) * 0.06;
    });
  }

  _syncMap(map, list, make, upd) {
    const seen = new Set();
    for (const o of list) {
      seen.add(o.id);
      let m = map.get(o.id);
      if (!m) { m = make(o); this.scene.add(m); map.set(o.id, m); }
      upd?.(m, o);
    }
    for (const [id, m] of map) if (!seen.has(id)) { this.scene.remove(m); map.delete(id); }
  }

  _structureMesh(st) {
    const g = new THREE.Group(); g.position.set(st.x, 0, st.z);
    const a = analyze(st.parts);
    if (st.form === 'wall') {
      const horiz = st.rot % 2 === 0;
      const body = new THREE.Mesh(new THREE.BoxGeometry(st.w, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x8b6b47, flatShading: true }));
      body.position.y = 0.8; body.castShadow = true; g.add(body);
      for (let i = 0; i < Math.min(6, st.parts.length * 2); i++) {
        const im = itemMesh([st.parts[i % st.parts.length]], 1.2);
        im.position.set(-st.w / 2 + 0.4 + (i / 6) * (st.w - 0.8), 0.5 + (i % 3) * 0.45, 0.3);
        im.rotation.set(0, Math.PI / 2, i * 0.7); g.add(im);
      }
      if (a.thorns) for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xaaaaaa })); sp.rotation.x = Math.PI / 2; sp.position.set(-st.w / 2 + 0.3 + i * (st.w - 0.6) / 5, 0.5 + (i % 2) * 0.6, 0.45); g.add(sp); }
      if (!horiz) g.rotation.y = Math.PI / 2;
    } else if (st.form === 'trap') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(a.radius * 0.9, a.radius, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x555b63 })); base.position.y = 0.1; g.add(base);
      const spin = new THREE.Group(); spin.position.y = 0.5; g.add(spin); g.userData.spin = spin;
      st.parts.forEach((p, i) => { const im = itemMesh([p], a.radius * 0.9); im.rotation.y = i / st.parts.length * Math.PI * 2; spin.add(im); });
    } else if (st.form === 'magnet') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x444444 })); post.position.y = 0.8; g.add(post);
      const im = itemMesh(st.parts, 1.2); im.position.y = 1.6; im.rotation.x = -Math.PI / 2; g.add(im);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 32), new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring); g.userData.ring = ring;
    } else if (st.form === 'mine') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.15, 12), new THREE.MeshStandardMaterial({ color: 0x3d405b })); disc.position.y = 0.08; g.add(disc);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2222 })); led.position.y = 0.2; g.add(led); g.userData.led = led;
      const im = itemMesh(st.parts, 0.8); im.position.set(-0.4, 0.15, 0); im.rotation.y = Math.PI / 2; g.add(im);
    }
    if (st.form !== 'mine') {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.1), new THREE.MeshBasicMaterial({ color: 0x7fd36b, side: THREE.DoubleSide }));
      bar.position.y = st.form === 'wall' ? 2 : 1.2; g.add(bar); g.userData.hpBar = bar;
    }
    return g;
  }

  _friendModel(dt) {
    const f = this.friendPose;
    if (!this.friendChar) {
      this.friendChar = new Character(PLAYER_COLORS[1 - this.me], 'Friend');
      this.scene.add(this.friendChar.root);
    }
    const c = this.friendChar;
    c.root.visible = !!f;
    if (!f) return;
    c.update(dt, f, this.t);
    if (f.fl && f.held) { const d = _v.set(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)); this.fx.flame(_w.set(f.x + d.x * 1.2, f.y + 1.35, f.z + d.z * 1.2), d); }
  }

  _clearWorld() {
    for (const map of [this.zModels, this.stMeshes, this.groundMeshes, this.zoneMeshes]) {
      for (const m of map.values()) this.scene.remove(m.root || m);
      map.clear();
    }
  }

  _menuCam(dt) {
    const a = this.t * 0.05;
    this.camera.position.set(Math.sin(a) * 45, 18, Math.cos(a) * 45);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 2, 0);
    this.town.setNight(0.55, { x: 0, z: 0 });
    this.town.update(dt, this.t);
    this.renderer.render(this.scene, this.camera);
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export { MAX_PARTS };
