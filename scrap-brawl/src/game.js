// Ties everything together: renderer, input, camera, networking, phases.
import * as THREE from 'three';
import { Net } from './net.js';
import { Match, BELT_SPEED } from './match.js';
import { World, SPAWNS, JUNK, ARENA_R } from './world.js';
import { Mech } from './mech.js';
import { Pilot } from './pilot.js';
import { FX } from './fx.js';
import { Bot } from './bot.js';
import { UI, partTooltip } from './ui.js';
import { sfx, unlockAudio } from './audio.js';

// eslint-disable-next-line no-undef
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const FIGHT_PHASES = new Set(['countdown', 'fight', 'roundover']);
const newPose = () => ({ x: 0, y: 0, z: 0, yaw: 0, a: { gr: true } });

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
    this.world = new World(this.scene);
    this.fx = new FX(this.scene);
    this.mechs = [new Mech(0xff8a3d), new Mech(0x3dd6c6)];
    this.mechs.forEach((m) => this.scene.add(m.root));

    this.net = new Net();
    this.mode = 'menu';          // 'menu' | 'practice' | 'host' | 'guest'
    this.me = 0;
    this.state = null;
    this.netState = null;
    this.match = null;
    this.pilot = null;
    this.bot = null; this.botPilot = null;
    this.poses = [newPose(), newPose()];
    this.remotePose = newPose();
    this.remoteTarget = null;
    this.camYaw = Math.PI; this.camPitch = 0.28;
    this.shakeT = 0;
    this.lastPhase = null;
    this.t = 0;

    // ---- input
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { l: false, r: false, x: 0, y: 0 };
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this._mouseDown(e));
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked) {
        this.camYaw -= e.movementX * 0.0026;
        this.camPitch = Math.max(-0.35, Math.min(1.1, this.camPitch + e.movementY * 0.0022));
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.l = this.mouse.r = false; }
    });
    addEventListener('resize', () => this._resize());
    this._resize();

    this.ui = new UI(uiRoot, {
      onHost: () => this.startHost(),
      onJoin: (code) => this.joinGame(code),
      onPractice: () => this.startPractice(),
      onLeave: () => this.leave(),
      onRematch: () => this.rematch(),
    });
    this.ui.version(BUILD_ID);
    this._setupNet();

    this.raycaster = new THREE.Raycaster();
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  get isAuthority() { return this.mode === 'practice' || this.mode === 'host'; }

  // ------------------------------------------------------------ modes
  _makePilots() {
    this.pilot = new Pilot(this.me, this._hooks(this.me));
    this.poses[this.me] = this.pilot.pose || newPose();
    if (this.mode === 'practice') { this.bot = new Bot(); this.botPilot = new Pilot(1, this._hooks(1)); }
    else { this.bot = null; this.botPilot = null; }
  }

  _hooks(idx) {
    return {
      hit: (h) => this.reportHit(idx, h),
      missile: (pos, dir, dmg) => {
        this.fx.missile(pos, dir, () => this.poses[1 - idx],
          () => this.reportHit(idx, { dmg, partMult: 1, kb: [0, 6, 0], src: 'missile' }));
        if (this.mode !== 'practice') this.net.send({ t: 'fx', k: 'missile', o: idx, p: pos.toArray(), d: dir.toArray() });
      },
      sound: (n) => sfx(n, 40),
      fx: (k, p) => {
        if (k === 'dust') { this.fx.dust(p); if (this.mode !== 'practice') this.net.send({ t: 'fx', k: 'dust', p: [p.x, p.y, p.z] }); }
      },
    };
  }

  startPractice() {
    unlockAudio();
    this.mode = 'practice'; this.me = 0;
    this.match = new Match();
    this._makePilots();
    this.match.startMatch();
    this.ui.showMenu(false);
  }

  async startHost() {
    unlockAudio();
    this.ui.status('Opening your garage…');
    try {
      const code = await this.net.host();
      this.mode = 'host'; this.me = 0;
      this.match = new Match();
      this._makePilots();
      this.ui.showMenu(false);
      this.ui.showLobby(code);
    } catch (e) { this.ui.status(e.message, true); }
  }

  async joinGame(code) {
    unlockAudio();
    this.ui.status('Connecting…');
    try {
      await this.net.join(code);
      this.mode = 'guest'; this.me = 1;
      this.netState = null;
      this._makePilots();
      this.net.send({ t: 'hello', build: BUILD_ID });
      this.ui.showMenu(false);
    } catch (e) { this.ui.status(e.message, true); }
  }

  leave(reason = '') {
    if (this.net.online) this.net.leave();
    this.mode = 'menu';
    this.state = this.netState = this.match = null;
    this.pilot = this.bot = this.botPilot = null;
    this.lastPhase = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.showMenu(true, reason, !!reason);
    this._menuParts = false;
  }

  rematch() {
    if (this.mode === 'practice') { this.match.voteRematch(0); this.match.voteRematch(1); }
    else if (this.mode === 'host') this.match.voteRematch(0);
    else this.net.send({ t: 'rematch' });
  }

  reportHit(attacker, h) {
    if (this.isAuthority) this.match.hit(attacker, 1 - attacker, h, this.poses);
    else this.net.send({ t: 'hit', h });
  }

  _setupNet() {
    const n = this.net;
    // host side
    n.on('hello', (m) => {
      if (this.mode !== 'host') return;
      if (m.build !== BUILD_ID) {
        n.send({ t: 'bye', reason: 'Version mismatch: you both need to refresh the page.' });
        setTimeout(() => n.dropGuest(), 300);
        return;
      }
      this.ui.hideLobby();
      this.match.startMatch();
    });
    n.on('p', (m) => { this.remoteTarget = m; });
    n.on('grab', (m) => { if (this.mode === 'host') this.match.grab(1, m.id, m.slot); });
    n.on('hit', (m) => { if (this.mode === 'host') this.match.hit(1, 0, m.h, this.poses); });
    n.on('pick', (m) => { if (this.mode === 'host') this.match.pickup(1, m.id, this.poses); });
    n.on('rematch', () => { if (this.mode === 'host') this.match.voteRematch(1); });
    n.onPeerLeave = () => { if (this.mode === 'host') this.leave('Your friend left the garage.'); };
    // guest side
    n.on('s', (m) => { this.netState = m.s; });
    n.on('ev', (m) => this.onEvent(m.e));
    n.on('kb', (m) => this.pilot?.applyKnockback(m.v));
    n.onDisconnect = (reason) => this.leave(reason);
    // both
    n.on('fx', (m) => {
      if (m.k === 'missile') this.fx.missile(new THREE.Vector3(...m.p), new THREE.Vector3(...m.d), () => this.poses[1 - m.o], null);
      if (m.k === 'dust') this.fx.dust(new THREE.Vector3(...m.p));
    });
  }

  // ------------------------------------------------------------ events (sounds/fx)
  onEvent(e) {
    const me = this.me;
    switch (e.k) {
      case 'grab': {
        sfx('grab');
        const p = this.world.podiumPose(e.p);
        this.fx.sparks(_v.set(p.x, 3, p.z), 16);
        break;
      }
      case 'deny': if (e.p === me) sfx('deny'); break;
      case 'hit': {
        this.fx.sparks(_v.set(...e.pos), e.dmg >= 4 ? 14 : 4, e.sh ? 0x77ddff : 0xffdd55);
        this.mechs[e.v].flash();
        if (e.dmg >= 2) {
          sfx('hit', 50);
          this.ui.floater(e.sh ? `🛡${Math.round(e.dmg)}` : String(Math.round(e.dmg)), e.v === me ? '#ff7070' : '#ffe066', e.pos);
        } else sfx('tick', 90);
        if (e.v === me && e.dmg >= 8) this.shakeT = Math.max(this.shakeT, 0.25);
        break;
      }
      case 'detach': sfx('detach'); this.fx.explosion(_v.set(...e.pos), 0.7); break;
      case 'bolt': sfx('bolt'); break;
      case 'slam': {
        sfx('slam'); this.fx.dust(_v.set(0, 0.5, 0), 30);
        const p = this.poses[me];
        if (Math.hypot(p.x, p.z) < 14) this.shakeT = 0.4;
        break;
      }
      case 'magnet': sfx('magnet'); break;
      case 'countdown': sfx('count'); break;
      case 'fight': sfx('go'); break;
      case 'roundover': sfx(e.w === me ? 'win' : 'lose'); break;
    }
  }

  _onPhase(prev, ph) {
    if (ph === 'build' || ph === 'matchover' || ph === 'lobby') { if (document.pointerLockElement) document.exitPointerLock(); }
    if (ph === 'countdown') {
      const sp = SPAWNS[this.me];
      this.pilot.reset(sp);
      this.camYaw = sp.yaw; this.camPitch = 0.28;
      this.botPilot?.reset(SPAWNS[1]);
      this.remoteTarget = null;
      const o = SPAWNS[1 - this.me];
      Object.assign(this.remotePose, { x: o.x, y: 0, z: o.z, yaw: o.yaw });
      if (this.mode !== 'practice') this.poses[1 - this.me] = this.remotePose;
      this._countBeep = 3;
    }
  }

  // ------------------------------------------------------------ input
  _mouseDown(e) {
    unlockAudio();
    const ph = this.state?.phase;
    if (FIGHT_PHASES.has(ph)) {
      if (!this.locked) { this.canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
      return;
    }
    if (ph === 'build') {
      const id = this._pickBelt(e.clientX, e.clientY);
      if (id == null) return;
      const slot = e.button === 2 ? 'rightArm' : 'leftArm';
      if (this.isAuthority) this.match.grab(this.me, id, slot);
      else this.net.send({ t: 'grab', id, slot });
    }
  }

  _pickBelt(x, y) {
    _ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(_ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.world.beltGroup.children, true)[0];
    return hit ? hit.object.userData.itemId ?? null : null;
  }

  _input() {
    const k = this.keys, p = this.pressed;
    return {
      mx: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      mz: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      yaw: this.camYaw,
      jump: k.has('Space'),
      lmb: this.mouse.l, rmb: this.mouse.r,
      shift: k.has('ShiftLeft') || k.has('ShiftRight'),
      shiftPressed: p.has('ShiftLeft') || p.has('ShiftRight'),
      dash: p.has('KeyQ'),
    };
  }

  // ------------------------------------------------------------ frame
  frame() {
    const now = performance.now();
    const dt = this.fixedDt ?? Math.min((now - this._last) / 1000, 0.05);
    this._last = now;
    this.t += dt;

    if (this.mode === 'menu') { this._menuScene(dt); this.pressed.clear(); return; }

    if (this.isAuthority) {
      if (this.mode === 'practice' && this.match.state.phase === 'build') this.bot.build(dt, this.match.state, this.match);
      this.match.update(dt, this.poses);
      this.state = this.match.state;
    } else this.state = this.netState;

    const s = this.state;
    if (!s) { this._render(dt); this.pressed.clear(); return; }
    this.ui.hud.classList.toggle('hidden', s.phase === 'lobby');
    if (s.phase !== this.lastPhase) { this._onPhase(this.lastPhase, s.phase); this.lastPhase = s.phase; }
    const ph = s.phase, me = this.me, foe = 1 - me;

    this.mechs.forEach((m, i) => m.setParts(s.players[i].parts));
    this.pilot.setParts(s.players[me].parts);
    this.botPilot?.setParts(s.players[1].parts);

    if (FIGHT_PHASES.has(ph)) {
      const canAct = ph === 'fight';
      const env = { canAct, magnetOn: canAct && s.mg?.on };
      this.poses[me] = this.pilot.update(dt, this._input(), this.poses[foe], env);
      if (this.mode === 'practice') {
        const bi = canAct ? this.bot.fight(dt, this.poses[1], this.poses[0], this.botPilot, s) : { mx: 0, mz: 0, yaw: this.botPilot.yaw };
        this.poses[1] = this.botPilot.update(dt, bi, this.poses[0], env);
      } else this._interpRemote(dt);
      // countdown beeps
      if (ph === 'countdown' && Math.ceil(s.timer) < this._countBeep) { this._countBeep = Math.ceil(s.timer); if (this._countBeep > 0) sfx('count'); }
    } else if (ph === 'build' || ph === 'lobby') {
      this.poses[0] = this.world.podiumPose(0);
      this.poses[1] = this.world.podiumPose(1);
    }

    // authority: deliver knockbacks + events
    if (this.isAuthority) {
      for (const kb of this.match.knockbacks) {
        if (kb.victim === me) this.pilot.applyKnockback(kb.v);
        else if (this.botPilot) this.botPilot.applyKnockback(kb.v);
        else this.net.send({ t: 'kb', v: kb.v });
      }
      this.match.knockbacks.length = 0;
      for (const e of this.match.events) { this.onEvent(e); if (this.mode === 'host') this.net.send({ t: 'ev', e }); }
      this.match.events.length = 0;
    }

    // pickups
    this.pickupHint = null;
    if (ph === 'fight') {
      const p = this.poses[me];
      let best = 3.2;
      for (const k of s.pickups) { const d = Math.hypot(p.x - k.x, p.z - k.z); if (d < best) { best = d; this.pickupHint = k; } }
      if (this.pickupHint && this.pressed.has('KeyE')) {
        if (this.isAuthority) this.match.pickup(me, this.pickupHint.id, this.poses);
        else this.net.send({ t: 'pick', id: this.pickupHint.id });
      }
    }

    // network
    if (this.net.online && this.net.tick(dt)) {
      const p = this.poses[me];
      this.net.send({ t: 'p', x: p.x, y: p.y, z: p.z, yaw: p.yaw, a: p.a });
      if (this.mode === 'host') this.net.send({ t: 's', s });
    }

    // visuals
    for (let i = 0; i < 2; i++) this.mechs[i].update(dt, this.poses[i], this.fx);
    this.world.syncBelt(ph === 'build' ? s.belt : [], dt, BELT_SPEED);
    this.world.syncPickups(FIGHT_PHASES.has(ph) ? s.pickups : []);

    // hover tooltip on the belt
    if (ph === 'build') {
      const id = this._pickBelt(this.mouse.x, this.mouse.y);
      this.world.hovered = id;
      const it = id != null && s.belt.find((b) => b.id === id);
      this.ui.tooltip(it ? partTooltip(it.part) : '', this.mouse.x, this.mouse.y);
      this.canvas.style.cursor = it ? 'pointer' : 'default';
    } else { this.world.hovered = null; this.ui.tooltip(''); this.canvas.style.cursor = 'default'; }

    this._camera(dt, ph);
    this.ui.update(this);
    this.ui.updateFloaters(dt, (x, y, z) => this._project(x, y, z));
    this._render(dt);
    this.pressed.clear();
  }

  _interpRemote(dt) {
    const t = this.remoteTarget, o = this.remotePose;
    this.poses[1 - this.me] = o;
    if (!t) return;
    const d = Math.hypot(t.x - o.x, t.z - o.z);
    const k = d > 8 ? 1 : 1 - Math.exp(-18 * dt);
    o.x += (t.x - o.x) * k; o.y += (t.y - o.y) * k; o.z += (t.z - o.z) * k;
    o.yaw += Math.atan2(Math.sin(t.yaw - o.yaw), Math.cos(t.yaw - o.yaw)) * k;
    o.a = t.a || {};
  }

  _camera(dt, ph) {
    const cam = this.camera;
    if (ph === 'build' || ph === 'lobby') {
      const sgn = this.me === 0 ? 1 : -1;
      cam.position.set(JUNK.x + Math.sin(this.t * 0.3) * 1.2, 9, JUNK.z + sgn * 18);
      cam.lookAt(JUNK.x, 1.2, JUNK.z - sgn * 1);
      this.world.focus(JUNK);
    } else if (FIGHT_PHASES.has(ph) || ph === 'matchover') {
      const p = this.poses[this.me];
      const cp = Math.cos(this.camPitch), dist = 9;
      _t.set(p.x, p.y + 3, p.z);
      cam.position.set(_t.x - Math.sin(this.camYaw) * cp * dist, _t.y + Math.sin(this.camPitch) * dist, _t.z - Math.cos(this.camYaw) * cp * dist);
      if (cam.position.y < 0.6) cam.position.y = 0.6;
      cam.lookAt(_t.x + Math.sin(this.camYaw) * 4, _t.y, _t.z + Math.cos(this.camYaw) * 4);
      this.world.focus(_t.set(0, 0, 0));
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      cam.position.x += (Math.random() - 0.5) * this.shakeT * 2;
      cam.position.y += (Math.random() - 0.5) * this.shakeT * 2;
    }
  }

  _menuScene(dt) {
    // backdrop: the two mechs squaring up in the arena
    this.world.update(dt, null);
    this.world.focus(_t.set(0, 0, 0));
    const a = this.t * 0.12;
    this.camera.position.set(Math.sin(a) * 22, 9, Math.cos(a) * 22);
    this.camera.lookAt(0, 2.5, 0);
    const p0 = { x: 0, y: 0, z: 4, yaw: Math.PI, a: { gr: true, la: (this.t % 2) < 0.3 ? 1 - (this.t % 2) / 0.3 : 0 } };
    const p1 = { x: 0, y: 0, z: -4, yaw: 0, a: { gr: true, ra: ((this.t + 1) % 2) < 0.3 ? 1 - ((this.t + 1) % 2) / 0.3 : 0 } };
    if (!this._menuParts) {
      this._menuParts = true;
      this.mechs[0].setParts({ rightArm: { id: 'saw' }, leftArm: { id: 'glove' }, legs: { id: 'spider' }, head: { id: 'horn' }, back: { id: 'missiles' } });
      this.mechs[1].setParts({ rightArm: { id: 'drill' }, leftArm: { id: 'magnet' }, legs: { id: 'treads' }, head: { id: 'googly' }, back: { id: 'jetpack' } });
    }
    this.mechs[0].update(dt, p0, this.fx); this.mechs[1].update(dt, p1, this.fx);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _project(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    if (_v.z > 1) return null;
    return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight };
  }

  _render(dt) {
    this.world.update(dt, this.state);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _ndc = new THREE.Vector2();
export { ARENA_R };
