// The Game: one episode. The host (or solo player) runs physics + game logic authoritatively;
// a client only simulates its own movement and renders interpolated snapshots from the host.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildKitchen, BURNERS, BOARDS, WINDOW_POS, SINK_POS, TRASH_POS, SPAWNS, PUDDLE_CENTER } from './kitchen.js';
import { Item, ITEM_DEFS, buildIngredient } from './items.js';
import { LocalPlayer, PlayerProxy, ChefAvatar, EYE, RAGDOLL_TIME } from './player.js';
import { CookingSystem, canAddToContainer } from './cooking.js';
import { ViewerSystem } from './viewers.js';
import { ChaosDirector } from './events.js';
import { ShowCam, CAM_FOV, CAM_MULT } from './showcam.js';
import { Particles, FireVisuals, PuddleVisual, buildChicken } from './fx.js';
import { audio } from '../audio.js';

export const PLAYER_COLORS = [0xff006e, 0x3a86ff];
const SNAP_INTERVAL = 1 / 20, INPUT_INTERVAL = 1 / 30, INTERP_DELAY = 110;
export const EPISODE_LENGTH = 300;
export const TAPE_SECONDS = [90, 120, 150];
export const MAX_HP = 100;
const GHOST_TIME = 10, BURN_TIME = 6, BURN_DPS = 9;
const REC_FX = new Set(['sfx', 'burst', 'ragdoll', 'captured', 'banner']);
const REACH = 3.0;

const r3 = (v) => Math.round(v * 1000) / 1000;
const toV3 = (p) => (!p ? null : Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p.x, p.y, p.z));
const K = (k) => `<span class="key">${k}</span>`;

export class Game {
  constructor({ renderer, input, hud, net = null, role = 'solo', setId = 'classic', upgrades, names, myId = 0, startViewers = 40, settings = {}, onEnd, voice = null }) {
    Object.assign(this, { renderer, input, hud, net, role, setId, myId, onEnd, voice });
    this.upgrades = { knife: 0, pan: 0, ext: 0, cam: 0, ...upgrades };
    this.auth = role !== 'client';
    this.running = true; this.paused = false;
    this.time = 0; this.frame = 0;

    // --- scene & physics ---
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 200);
    this.camera.layers.enable(2);
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    // NaiveBroadphase: SAP missed pairs against our long static counters; ~70 bodies is cheap anyway.
    this.physics.broadphase = new CANNON.NaiveBroadphase();
    this.physics.allowSleep = true;
    this.physics.defaultContactMaterial.friction = 0.45;
    this.physics.defaultContactMaterial.restitution = 0.15;
    this.playerMat = new CANNON.Material('player');
    this.physics.addContactMaterial(new CANNON.ContactMaterial(this.playerMat, this.physics.defaultMaterial, { friction: 0, restitution: 0 }));
    this.kitchen = buildKitchen(this.scene, this.physics, setId);

    // --- state ---
    this.items = new Map(); this.nextId = 1;
    this.state = {
      time: EPISODE_LENGTH, duration: EPISODE_LENGTH, burners: [0, 0, 0], fires: [], orders: [],
      flood: { on: 0, r: 0, t: 0 }, quake: 0, dark: 0, money: 0, served: [], expired: 0,
      rec: 0, rt: 0, tape: TAPE_SECONDS[this.upgrades.cam] || 90, clips: 0, int: 0, zoom: 1,
      viewers: startViewers, peak: startViewers, set: setId, windDir: 0, gust: 0, tilt: [0, 0], chicken: null, eventsSeen: 0,
    };
    const count = role === 'solo' ? 1 : 2;
    this.players = [];
    for (let i = 0; i < 2; i++) {
      this.players.push(i < count ? {
        id: i, name: names[i] || `Chef ${i + 1}`, color: PLAYER_COLORS[i], pos: [SPAWNS[i].x, SPAWNS[i].y, SPAWNS[i].z],
        yaw: 0, pitch: 0, held: -1, cam: -1, int: false, act: null, vel: [0, 0, 0], slipCd: 0, foamCd: 0,
        hp: MAX_HP, fire: 0, dead: 0, lastHurt: -99, screamT: 0,
      } : null);
    }
    this.local = new LocalPlayer(this.physics, SPAWNS[myId], this.playerMat);
    this.local.sens = settings.sens || 1;
    this.avatars = []; this.proxies = []; this.view = [];
    this.players.forEach((p, i) => {
      if (!p) return;
      const av = new ChefAvatar(p.color, p.name);
      if (i === myId) av.group.traverse((o) => o.layers.set(1)); // only the show camera sees yourself
      this.scene.add(av.group); this.avatars[i] = av;
      this.view[i] = { pos: new THREE.Vector3(...p.pos), yaw: 0, pitch: 0, speed: 0 };
      if (i !== myId) this.proxies[i] = new PlayerProxy(this.physics);
    });

    // --- visuals ---
    this.particles = new Particles(this.scene);
    this.fireVis = new FireVisuals(this.scene);
    this.puddleVis = new PuddleVisual(this.scene, PUDDLE_CENTER);
    this.chickenMesh = buildChicken(); this.chickenMesh.visible = false; this.scene.add(this.chickenMesh);
    this.chickenView = null; this.chickenLootKey = '';
    this.showCam = new ShowCam();
    this.highlight = new THREE.BoxHelper(undefined, 0xffd166);
    this.highlight.material.depthTest = false; this.highlight.renderOrder = 5;
    this.highlight.layers.set(2); this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.raycaster = new THREE.Raycaster();
    this.shake = 0; this.chopSfxT = 0;
    this.darkLevel = 1;

    // --- networking ---
    this.snaps = []; this.outFx = []; this.pendingKnocks = [];
    this.recording = []; this.forceFull = false;
    this.removedIds = []; this.netItems = new Map();
    this.snapT = 0; this.inputT = 0;

    if (this.auth) {
      this.cooking = new CookingSystem(this);
      this.viewers = new ViewerSystem(this);
      this.chaos = new ChaosDirector(this);
      this.spawnInitialItems();
      this.fx('banner', { title: "🎬 LIGHTS, CAMERA... 🎬", sub: 'Grab the camera (Q), hit R to record, and cook! Hold TAB for recipes' });
      this.fx('sfx', { n: 'fanfare' });
    }
  }

  // ======================================================================
  // Items
  // ======================================================================
  spawnItem(type, pos, state = {}, quat = null) {
    const it = new Item(this.nextId++, type, state);
    const body = it.createBody(this.physics.defaultMaterial);
    body.position.set(pos.x, pos.y, pos.z);
    if (quat) body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    this.physics.addBody(body);
    it.mesh.position.copy(pos);
    this.scene.add(it.mesh);
    this.items.set(it.id, it);
    body.addEventListener('collide', (e) => this.onItemCollide(it, e));
    return it;
  }
  onItemCollide(it, e) {
    let v = 0;
    try { v = Math.abs(e.contact.getImpactVelocityAlongNormal()); } catch { /* */ }
    const p = it.body.position;
    if (v > 3 && this.time - (it.lastClatter || 0) > 0.2) {
      it.lastClatter = this.time;
      this.fx('sfx', { n: 'clatter', p: [p.x, p.y, p.z] });
      if (it.def.food && v > 6) this.fx('burst', { k: 'crumbs', p: [p.x, p.y, p.z], n: 6, s: 1.5 });
    }
    if (it.thrownBy >= 0 && this.time - it.thrownAt < 2 && v > 2) {
      const victim = this.bodyToPlayer(e.body);
      if (victim != null && victim !== it.thrownBy) {
        const thrower = this.players[it.thrownBy], vp = this.players[victim];
        it.thrownBy = -1;
        this.fx('sfx', { n: 'bonk', p: vp.pos });
        this.fx('shake', { to: victim, a: 0.5 });
        this.fx('burst', { k: it.def.food ? 'crumbs' : 'dust', p: [p.x, p.y, p.z], n: 12, s: 2 });
        this.moment('bonk', vp.pos, 55, `${thrower.name} bonked ${vp.name} with a ${it.def.name.toLowerCase()}`);
        // knock them flat — heavier/faster objects hit harder. Deferred: we're inside the physics step.
        const bv = it.body.velocity;
        const strength = Math.max(3.5, Math.min(9, it.body.mass * Math.hypot(bv.x, bv.y, bv.z) * 1.2));
        this.pendingKnocks.push([victim, { x: bv.x, z: bv.z }, strength, null, 0]);
      }
    }
  }
  bodyToPlayer(body) {
    if (body === this.local.body) return this.myId;
    for (let i = 0; i < this.proxies.length; i++) if (this.proxies[i] && this.proxies[i].body === body) return i;
    return null;
  }
  destroyItem(it) {
    if (!this.items.has(it.id)) return;
    if (it.holder >= 0) { const pl = this.players[it.holder]; if (pl) { if (pl.held === it.id) pl.held = -1; if (pl.cam === it.id) pl.cam = -1; } }
    it.holder = -1; it.slot = null;
    if (it.home) { // essentials respawn at home
      if (it.def.cookware) { it.s.c = []; it.s.w = 0; it.s.k = 0; it.touch(); }
      if (!this.physics.bodies.includes(it.body)) this.physics.addBody(it.body);
      it.body.position.copy(it.home.p); it.body.velocity.setZero(); it.body.angularVelocity.setZero();
      it.body.quaternion.set(0, 0, 0, 1); it.body.wakeUp();
      return;
    }
    if (it.body) this.physics.removeBody(it.body);
    this.removedIds.push(it.id);
    this.scene.remove(it.mesh);
    this.items.delete(it.id);
  }
  spawnInitialItems() {
    const add = (type, x, y, z, s) => { const it = this.spawnItem(type, new THREE.Vector3(x, y, z), s); it.home = { p: new CANNON.Vec3(x, y, z) }; return it; };
    add('pan', BURNERS[0].x, 0.98, BURNERS[0].z);
    add('pot', BURNERS[2].x, 1.07, BURNERS[2].z);
    add('pan', -5.0, 0.95, -4.6);
    add('pot', 0.5, 1.03, -4.6);
    add('extinguisher', -4.4, 0.27, -3.85);
    add('showcam', 0, 0.92, 3.6);
    this.spawnItem('plate', new THREE.Vector3(-0.3, 0.93, 0.3));
    this.spawnItem('plate', new THREE.Vector3(0.3, 0.93, 0.3));
    this.spawnItem('bowl', new THREE.Vector3(-0.3, 0.97, 0.9));
    this.spawnItem('bowl', new THREE.Vector3(0.3, 0.97, 0.9));
  }

  // ======================================================================
  // Targeting
  // ======================================================================
  lookDir(yaw, pitch, out = new THREE.Vector3()) {
    return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  }
  lookRay(pl) {
    return { origin: new THREE.Vector3(pl.pos[0], pl.pos[1] + EYE, pl.pos[2]), dir: this.lookDir(pl.yaw, pl.pitch) };
  }
  targetables() {
    if (this._tgtFrame === this.frame) return this._tgtList;
    const list = [];
    for (const it of this.items.values()) if (it.holder === -1) list.push(it.mesh);
    for (const m of this.stationExtraMeshes()) list.push(m); // tagged station meshes that aren't already blockers
    if (this.chickenMesh.visible) list.push(this.chickenMesh);
    for (const b of this.kitchen.blockers) list.push(b);
    this._tgtFrame = this.frame; this._tgtList = list;
    return list;
  }
  stationExtraMeshes() {
    if (!this._stExtra) {
      this._stExtra = [];
      this.scene.traverse((o) => { if (o.userData.station && !this.kitchen.blockers.includes(o)) this._stExtra.push(o); });
    }
    return this._stExtra;
  }
  findTarget(pl, maxDist = REACH) {
    const { origin, dir } = this.lookRay(pl);
    this.raycaster.set(origin, dir); this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.targetables(), true);
    for (const h of hits) {
      let o = h.object, item = null, station = null, npc = null;
      while (o) {
        if (o.userData.item) { item = o.userData.item; break; }
        if (o.userData.station) { station = o.userData.station; break; }
        if (o.userData.npc) { npc = o.userData.npc; break; }
        o = o.parent;
      }
      if (item && item.holder !== -1) continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (item) return { kind: 'item', item, point: h.point, normal, dist: h.distance, obj: item.mesh };
      if (station) return { kind: 'station', station, point: h.point, normal, dist: h.distance, obj: station.mesh };
      if (npc) return { kind: 'npc', npc, point: h.point, normal, dist: h.distance, obj: this.chickenMesh };
      return { kind: 'surface', point: h.point, normal, dist: h.distance, obj: null };
    }
    return null;
  }

  // ======================================================================
  // Actions (host-side resolution)
  // ======================================================================
  // ---- Ragdoll knockdowns (host decides, everyone simulates the flop locally) ----
  // ---- Health ----
  damage(pl, amt, cause) {
    if (!pl || pl.dead > 0 || amt <= 0) return;
    pl.hp = Math.max(0, pl.hp - amt);
    pl.lastHurt = this.time;
    if (amt >= 4) this.fx('hurt', { to: pl.id, a: Math.min(1, amt / 25) });
    if (pl.hp <= 0) this.wipeout(pl, cause);
  }
  ignite(pl) {
    if (!pl || pl.dead > 0 || pl.fire > 0) return;
    pl.fire = BURN_TIME;
    this.fx('sfx', { n: 'fire', p: pl.pos });
    this.fx('sfx', { n: 'scream', p: pl.pos });
    this.fx('toast', { to: pl.id, text: "🔥 YOU'RE ON FIRE! Get foamed 🧯 or jump in water 💦", kind: 'bad' });
    this.moment('onfire', pl.pos, 75, `${pl.name} caught on FIRE`);
  }
  wipeout(pl, cause) {
    pl.hp = 0; pl.dead = GHOST_TIME; pl.fire = 0;
    this.state.wipeouts = (this.state.wipeouts || 0) + 1;
    if (this.time >= (pl.kdEnd || 0)) { pl.kdImmune = 0; this.knockDown(pl.id, { x: Math.random() - 0.5, z: Math.random() - 0.5 }, 4, null, 0, 0); }
    else this.dropAll(pl);
    const why = { fire: 'burned to a crisp', bonk: 'got bonked into the afterlife', mixer: 'lost a fight to a mixer' }[cause] || 'got WIPED OUT';
    this.fx('toast', { text: `💀 ${pl.name} ${why}!`, kind: 'bad' });
    this.fx('sfx', { n: 'wipeout' });
    this.moment('wipeout', pl.pos, 100, `${pl.name} ${why}`);
  }
  respawn(pl) {
    pl.dead = 0; pl.hp = MAX_HP; pl.fire = 0;
    this.fx('respawn', { to: pl.id });
    this.fx('sfx', { n: 'respawn', p: pl.pos });
    this.fx('toast', { to: pl.id, text: '✨ Back from the dead! Full health', kind: 'good' });
  }
  healthStep(dt) {
    const st = this.state;
    for (const p of this.players) {
      if (!p) continue;
      if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) this.respawn(p); continue; }
      const feetY = p.pos[1] - 0.35;
      // walking into a stove fire
      for (const f of st.fires) if (Math.hypot(p.pos[0] - f.p[0], p.pos[2] - f.p[2]) < 0.55 + f.hp * 0.25 && feetY < 1.4) this.ignite(p);
      if (p.fire > 0) {
        p.fire -= dt;
        this.damage(p, BURN_DPS * dt, 'fire');
        p.screamT -= dt;
        if (p.screamT <= 0) { p.screamT = 1.6; this.fx('sfx', { n: 'scream', p: p.pos }); }
        // water puts you out
        if (st.flood.r > 0.1 && Math.hypot(p.pos[0] - PUDDLE_CENTER.x, p.pos[2] - PUDDLE_CENTER.z) < st.flood.r) {
          p.fire = 0; this.fx('sfx', { n: 'extinguish', p: p.pos }); this.fx('toast', { to: p.id, text: '💦 Phew, the puddle put you out', kind: 'good' });
        }
        // hugging your partner while burning = now you're both on fire
        for (const o of this.players) if (o && o !== p && Math.hypot(o.pos[0] - p.pos[0], o.pos[2] - p.pos[2]) < 0.8) this.ignite(o);
      } else if (this.time - p.lastHurt > 5 && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + 6 * dt);
    }
  }
  dropAll(pl) {
    for (const id of [pl.held, pl.cam]) {
      const it = id >= 0 ? this.items.get(id) : null; if (!it) continue;
      const pose = this.handPose(toV3(pl.pos), pl.yaw, pl.pitch, it.slot);
      this.release(pl, it, pose.p, pose.q, new THREE.Vector3((Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3));
      it.body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }
  }

  knockDown(pid, dir, strength = 5, label = null, value = 40, dmg = null) {
    const pl = this.players[pid]; if (!pl || pl.dead > 0) return;
    if (this.time < (pl.kdImmune || 0)) return;
    pl.kdEnd = this.time + RAGDOLL_TIME; pl.kdImmune = this.time + RAGDOLL_TIME + 1.5;
    this.dropAll(pl); // drop everything you're holding (yes, including the show camera)
    const d = new THREE.Vector3(dir.x, 0, dir.z);
    if (d.lengthSq() < 1e-4) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    d.normalize().multiplyScalar(strength * 0.75);
    this.fx('ragdoll', { to: pid, v: [r3(d.x), r3(2 + strength * 0.25), r3(d.z)] });
    this.fx('sfx', { n: 'flop', p: pl.pos });
    this.fx('burst', { k: 'stars', p: [pl.pos[0], pl.pos[1] + 1.3, pl.pos[2]], n: 16, s: 2.5 });
    if (label) this.moment('ragdoll', pl.pos, value, label);
    // getting flattened hurts (heavier hits hurt more)
    this.damage(pl, dmg ?? Math.round(strength * 2.6), this.knockCause || 'bonk');
  }
  startRagdoll(pid, v) {
    const av = this.avatars[pid]; if (!av) return;
    av.startRagdoll(this.physics, this.scene, v);
    if (pid === this.myId) {
      this.local.knock = RAGDOLL_TIME;
      this.local.body.velocity.set(v[0] * 0.6, 0, v[2] * 0.6);
      this.hud.toast('😵 KNOCKED OUT!', 'bad');
      this.shake = Math.max(this.shake, 0.6);
    }
  }

  // Show camera field of view: lens upgrade ÷ zoom (scroll wheel while holding the camera)
  camFov() { return (CAM_FOV[this.upgrades.cam] || 58) / (this.state.zoom || 1); }
  zoomCam(pl, steps) {
    if (!pl || pl.cam < 0 || !steps) return;
    const st = this.state;
    st.zoom = Math.max(1, Math.min(4, (st.zoom || 1) * Math.pow(1.15, steps)));
  }

  handleAction(pid, a, d) {
    if (a === 'zoom') return this.zoomCam(this.players[pid], d); // zooming works even mid-flop
    const pl = this.players[pid]; if (!pl) return;
    if (this.time < (pl.kdEnd || 0)) return; // can't do anything while flopping
    if (pl.dead > 0) return; // ghosts can't touch things
    const tgt = this.findTarget(pl);
    const held = pl.held >= 0 ? this.items.get(pl.held) : null;
    if (a === 'click') held ? this.useHeldOn(pl, held, tgt) : this.grab(pl, tgt);
    else if (a === 'throw') { if (held) this.throwItem(pl, held); }
    else if (a === 'cam') this.toggleCam(pl, tgt);
    else if (a === 'use') this.useE(pl, held, tgt);
    else if (a === 'rec') {
      const cam = [...this.items.values()].find((i) => i.type === 'showcam');
      if (pl.cam >= 0 || (cam && cam.holder === -1 && tgt?.item === cam)) this.toggleRec(pl);
      else this.toast(pl, '🎥 Hold the camera (Q) to start/stop recording');
    }
  }
  toast(pl, text, kind = 'bad') { this.fx('toast', { to: pl ? pl.id : null, text, kind }); }

  grab(pl, tgt) {
    if (!tgt) return;
    if (tgt.kind === 'item') {
      if (tgt.item.type === 'showcam') return this.toggleCam(pl, tgt);
      return this.pickUp(pl, tgt.item, 'hand');
    }
    if (tgt.kind === 'npc') return this.chaos.catchChicken(pl);
    if (tgt.kind !== 'station') return;
    const st = tgt.station;
    if (st.type === 'crate') {
      const it = this.spawnItem(st.ing, new THREE.Vector3(...pl.pos).setY(1.5));
      this.pickUp(pl, it, 'hand');
    } else if (st.type === 'dispenser') {
      let n = 0; for (const it of this.items.values()) if (it.type === 'plate' || it.type === 'bowl') n++;
      if (n >= 10) return this.toast(pl, 'Out of clean dishes! Serve or trash some 🍽');
      this.pickUp(pl, this.spawnItem(st.item, new THREE.Vector3(...pl.pos).setY(1.5)), 'hand');
    } else if (st.type === 'burner') this.toggleBurner(st.index, pl);
    else if (st.type === 'sink') this.useSink(pl, null);
  }
  pickUp(pl, it, slot) {
    if (it.holder !== -1) return;
    it.holder = pl.id; it.slot = slot;
    if (it.body && this.physics.bodies.includes(it.body)) this.physics.removeBody(it.body);
    if (slot === 'cam') pl.cam = it.id; else pl.held = it.id;
    if (it.type === 'mixer' && it.s.on) { it.s.on = 0; it.touch(); this.moment('mixer_tamed', it.mesh.position, 35, `${pl.name} grabbed the mixer`); }
    it.thrownBy = -1;
    this.fx('sfx', { n: 'pickup', p: pl.pos });
  }
  release(pl, it, pos, quat, vel = null) {
    if (pl.held === it.id) pl.held = -1;
    if (pl.cam === it.id) pl.cam = -1;
    it.holder = -1; it.slot = null;
    const b = it.body;
    b.position.set(pos.x, pos.y, pos.z);
    b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    b.velocity.set(vel ? vel.x : 0, vel ? vel.y : 0, vel ? vel.z : 0);
    b.angularVelocity.setZero();
    if (!this.physics.bodies.includes(b)) this.physics.addBody(b);
    b.wakeUp();
    it.mesh.position.copy(pos); it.mesh.quaternion.copy(quat);
  }
  yawQuat(yaw) { return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); }
  handPose(pos, yaw, pitch, slot) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const off = slot === 'cam' ? new THREE.Vector3(-0.42, -0.36, -0.62) : new THREE.Vector3(0.3, -0.3, -0.65);
    const p = new THREE.Vector3(pos.x, pos.y + EYE, pos.z).add(off.applyQuaternion(q));
    const rq = slot === 'cam' ? q : new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.25, yaw, 0, 'YXZ'));
    return { p, q: rq };
  }
  dropAt(pl, it, tgt) {
    let pos;
    const hh = it.halfHeight();
    if (tgt && tgt.point && tgt.dist < REACH) {
      if (tgt.normal.y > 0.5) pos = tgt.point.clone().add(new THREE.Vector3(0, hh + 0.02, 0));
      else pos = tgt.point.clone().addScaledVector(tgt.normal, 0.25).add(new THREE.Vector3(0, 0.1, 0));
    } else pos = this.handPose(toV3(pl.pos), pl.yaw, pl.pitch, 'hand').p;
    this.release(pl, it, pos, this.yawQuat(pl.yaw));
    this.fx('sfx', { n: 'drop', p: [pos.x, pos.y, pos.z] });
  }
  placeOn(pl, it, at) {
    const pos = new THREE.Vector3(at.x, at.y + it.halfHeight() + 0.02, at.z);
    this.release(pl, it, pos, this.yawQuat(pl.yaw));
    this.fx('sfx', { n: 'drop', p: [pos.x, pos.y, pos.z] });
  }
  throwItem(pl, it) {
    const { p } = this.handPose(toV3(pl.pos), pl.yaw, pl.pitch, 'hand');
    const dir = this.lookDir(pl.yaw, pl.pitch);
    const vel = dir.multiplyScalar(11).add(new THREE.Vector3(pl.vel[0], 1.5 + Math.max(0, pl.vel[1]) * 0.5, pl.vel[2]));
    this.release(pl, it, p, this.yawQuat(pl.yaw), vel);
    it.body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    it.thrownBy = pl.id; it.thrownAt = this.time; it.thrownFrom = p.clone();
    this.fx('sfx', { n: 'throw', p: pl.pos });
  }
  useHeldOn(pl, held, tgt) {
    if (!tgt) return this.dropAt(pl, held, null);
    if (tgt.kind === 'item') {
      const T = tgt.item;
      if (held.def.food && T.def.container) {
        const ok = canAddToContainer(T, held);
        if (ok === true) return this.addToContainer(pl, T, held);
        return this.toast(pl, ok);
      }
      if (held.def.container && T.def.container && this.transfer(pl, held, T)) return;
      if (held.def.container && !held.def.cookware && T.def.food) {
        const ok = canAddToContainer(held, T);
        if (ok === true) return this.addToContainer(pl, held, T);
        return this.toast(pl, ok);
      }
      if (held.def.cookware && T.def.food) {
        const ok = canAddToContainer(held, T);
        if (ok === true) return this.addToContainer(pl, held, T);
        return this.toast(pl, ok);
      }
      return this.dropAt(pl, held, tgt);
    }
    if (tgt.kind === 'npc') return this.chaos.catchChicken(pl);
    if (tgt.kind === 'station') {
      const st = tgt.station;
      switch (st.type) {
        case 'burner': if (held.def.cookware) return this.placeOn(pl, held, BURNERS[st.index]); break;
        case 'board': if (held.def.food) return this.placeOn(pl, held, BOARDS[st.index]); break;
        case 'window': {
          if (this.cooking.serve(held, pl)) this.destroyItem(held);
          return;
        }
        case 'trash': return this.trashItem(pl, held, false);
        case 'sink': if (held.type === 'pot') return this.useSink(pl, held); break;
        case 'crate':
          if (held.type === st.ing && !held.s.ch && !held.s.k) { this.destroyItem(held); this.fx('sfx', { n: 'drop', p: pl.pos }); return; }
          break;
        case 'dispenser':
          if (held.type === st.item && !held.s.c.length) { this.destroyItem(held); this.fx('sfx', { n: 'drop', p: pl.pos }); return; }
          break;
      }
    }
    this.dropAt(pl, held, tgt);
  }
  addToContainer(pl, container, food) {
    container.s.c.push({ t: food.type, ch: food.s.ch, k: food.s.k });
    container.touch();
    this.destroyItem(food);
    const p = container.mesh.position;
    this.fx('sfx', { n: 'pickup', p: [p.x, p.y, p.z] });
    this.fx('burst', { k: 'crumbs', p: [p.x, p.y + 0.1, p.z], n: 5, s: 1 });
  }
  transfer(pl, a, b) {
    let src, dst;
    if (a.def.cookware && !b.def.cookware) { src = a; dst = b; } else if (b.def.cookware && !a.def.cookware) { src = b; dst = a; } else return false;
    const p = dst.mesh.position;
    if (src.type === 'pan') {
      if (!src.s.c.length) { this.toast(pl, 'The pan is empty!'); return true; }
      if (dst.s.c.length + src.s.c.length > 6) { this.toast(pl, "It's full!"); return true; }
      dst.s.c.push(...src.s.c); src.s.c = [];
    } else {
      if (dst.type !== 'bowl') { this.toast(pl, 'Soup goes in a bowl! 🥣'); return true; }
      if (src.s.k < 1) { this.toast(pl, src.s.w ? "The soup isn't boiled yet! Put the pot on a lit burner." : 'Fill the pot with water at the sink first 💧'); return true; }
      if (dst.s.c.length) { this.toast(pl, 'Use an empty bowl!'); return true; }
      const ok = src.s.c.length >= 2 && src.s.c.every((c) => (c.t === 'carrot' || c.t === 'onion') && c.ch);
      dst.s.c = [{ t: 'soup', k: src.s.k, ok }];
      src.s.c = []; src.s.w = 0; src.s.k = 0;
    }
    src.touch(); dst.touch();
    this.fx('sfx', { n: 'pour', p: [p.x, p.y, p.z] });
    return true;
  }
  trashItem(pl, it, thrown) {
    const p = it.mesh.position.clone();
    if (it.def.cookware) {
      if (!it.s.c.length && !it.s.w && !it.s.k) { if (pl) this.toast(pl, "It's already empty"); else this.destroyItem(it); return; }
      it.s.c = []; it.s.w = 0; it.s.k = 0; it.touch();
      if (pl) this.toast(pl, `Emptied the ${it.def.name.toLowerCase()} 🗑`, 'good'); else this.destroyItem(it);
    } else if (it.type === 'showcam' || it.type === 'extinguisher') {
      if (pl) return this.toast(pl, "You can't throw that away!");
      this.destroyItem(it);
    } else this.destroyItem(it);
    this.fx('sfx', { n: 'drop', p: [p.x, p.y, p.z] });
    if (thrown) { this.fx('sfx', { n: 'cheer' }); this.moment('trash3', TRASH_POS, 35, 'TRASH 3-POINTER'); }
  }
  toggleCam(pl, tgt) {
    if (pl.cam >= 0) {
      const cam = this.items.get(pl.cam);
      if (!cam) { pl.cam = -1; return; }
      let pos;
      if (tgt && tgt.point && tgt.normal.y > 0.5 && tgt.dist < 2.5) pos = tgt.point.clone().add(new THREE.Vector3(0, cam.halfHeight() + 0.03, 0));
      else pos = this.handPose(toV3(pl.pos), pl.yaw, pl.pitch, 'cam').p;
      this.release(pl, cam, pos, this.yawQuat(pl.yaw));
      this.fx('sfx', { n: 'drop', p: pl.pos });
      this.toast(pl, '🎥 Camera set down — it keeps filming (static shots earn less hype)', 'good');
      return;
    }
    let cam = null;
    for (const it of this.items.values()) if (it.type === 'showcam') cam = it;
    if (!cam) return;
    if (cam.holder >= 0) return this.toast(pl, `${this.players[cam.holder].name} has the camera!`);
    const near = (tgt?.kind === 'item' && tgt.item === cam) || cam.mesh.position.distanceTo(new THREE.Vector3(pl.pos[0], pl.pos[1] + 1, pl.pos[2])) < 2.4;
    if (!near) return this.toast(pl, '🎥 The camera is too far away — walk up to it');
    this.pickUp(pl, cam, 'cam');
    this.toast(pl, "🎥 You're filming! Keep the action in frame", 'good');
  }
  toggleBurner(i, pl) {
    this.state.burners[i] = this.state.burners[i] ? 0 : 1;
    this.fx('sfx', { n: 'knob', p: [BURNERS[i].x, 0.9, BURNERS[i].z] });
    if (this.state.burners[i]) this.fx('sfx', { n: 'fire', p: [BURNERS[i].x, 0.9, BURNERS[i].z] });
  }
  useSink(pl, held) {
    if (this.chaos.stopFlood(pl)) return;
    if (held?.type === 'pot') {
      if (held.s.k >= 1) return this.toast(pl, 'The soup is already cooked!');
      if (held.s.w) return this.toast(pl, 'Already full of water 💧', 'good');
      held.s.w = 1; held.touch();
      this.fx('sfx', { n: 'splash', p: [SINK_POS.x, SINK_POS.y, SINK_POS.z] });
      this.fx('burst', { k: 'water', p: [SINK_POS.x, SINK_POS.y + 0.3, SINK_POS.z], n: 12, s: 1.5 });
      this.sinkRunT = 0.8;
      return;
    }
    this.fx('sfx', { n: 'splash', p: [SINK_POS.x, SINK_POS.y, SINK_POS.z] });
    this.sinkRunT = 0.6;
    this.toast(pl, 'Hold a pot and press E here to fill it with water 💧', '');
  }
  useE(pl, held, tgt) {
    if (held?.type === 'extinguisher') return;
    if (!tgt) return;
    if (tgt.kind === 'station') {
      const st = tgt.station;
      if (st.type === 'burner') return this.toggleBurner(st.index, pl);
      if (st.type === 'sink') return this.useSink(pl, held);
      return;
    }
    if (tgt.kind === 'item') {
      const T = tgt.item;
      if (T.type === 'mixer' && T.s.on) { T.s.on = 0; T.touch(); this.fx('sfx', { n: 'knob', p: pl.pos }); this.moment('mixer_tamed', T.mesh.position, 35, `${pl.name} unplugged the mixer`); return; }
      if (T.type === 'showcam') return this.toggleRec(pl); // E on a set-down camera = REC on/off (tripod mode)
      if (T.def.cookware) {
        for (let i = 0; i < BURNERS.length; i++) if (this.cooking.cookwareOnBurner(i) === T) return this.toggleBurner(i, pl);
      }
    }
  }

  // ======================================================================
  // Show camera & viewers
  // ======================================================================
  cameraInfo() {
    if (this._camFrame === this.frame) return this._camInfo;
    this._camFrame = this.frame;
    let cam = null;
    for (const it of this.items.values()) if (it.type === 'showcam') { cam = it; break; }
    if (!cam) return (this._camInfo = null);
    this.showCam.updateFrom(cam.mesh, this.camFov());
    const held = cam.holder >= 0;
    return (this._camInfo = { item: cam, held, holder: cam.holder, mult: (CAM_MULT[this.upgrades.cam] || 1) * (held ? 1 : 0.55) });
  }
  isOnCamera(pos) { return this.cameraInfo() ? this.showCam.isVisible(pos, 13 * (this.state.zoom || 1)) : false; }
  moment(kind, pos, value, label) {
    if (!this.auth) return 0;
    return this.viewers.moment(kind, toV3(pos), value, label);
  }
  computeInterest() {
    const cam = this.cameraInfo(); if (!cam) return 0;
    const st = this.state;
    let s = 0;
    const vis = (x, y, z) => this.showCam.isVisible(new THREE.Vector3(x, y, z));
    for (const f of st.fires) if (vis(f.p[0], f.p[1] + 0.3, f.p[2])) s += 1.2 + f.hp;
    if (this.chaos.chicken) { const c = this.chaos.chicken; if (vis(c.x, c.y + 0.3, c.z)) s += 1.6; }
    for (const m of this.chaos.mixers) if (m.s.on && this.items.has(m.id) && vis(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z)) s += 1.3;
    if (st.flood.on && vis(PUDDLE_CENTER.x, 0.2, PUDDLE_CENTER.z)) s += 0.6;
    if (st.quake > 0) s += 2.5;
    if (st.dark > 0) s += 0.4;
    for (const p of this.players) {
      if (!p || p.id === cam.holder) continue;
      if (vis(p.pos[0], p.pos[1] + 1, p.pos[2])) {
        s += 0.3;
        if (Math.hypot(p.vel[0], p.vel[2]) > 2) s += 0.3;
        if (p.held >= 0 || p.act) s += 0.4;
      }
    }
    for (let i = 0; i < BURNERS.length; i++) {
      const cw = this.cooking.cookwareOnBurner(i);
      if (cw && st.burners[i] && (cw.s.c.length || cw.s.w) && vis(BURNERS[i].x, 1, BURNERS[i].z)) s += 0.3;
    }
    return s * cam.mult;
  }

  // ======================================================================
  // FX routing (host broadcasts, everyone applies)
  // ======================================================================
  fx(name, data = {}) {
    this.applyFx(name, data);
    if (this.auth && (this.net || this.state.rec)) this.outFx.push([name, data]);
  }
  applyFx(name, d) {
    const me = this.players[this.myId];
    switch (name) {
      case 'sfx': {
        let vol = 1;
        if (d.p) { const dist = Math.hypot(d.p[0] - me.pos[0], d.p[2] - me.pos[2]); vol = Math.max(0.15, Math.min(1, 1.25 - dist / 14)); }
        audio.play(d.n, vol); break;
      }
      case 'banner': this.hud.banner(d.title, d.sub); break;
      case 'toast': if (d.to == null || d.to === this.myId) this.hud.toast(d.text, d.kind); break;
      case 'chat': this.hud.chat(d.u, d.c, d.m, d.h); break;
      case 'burst': this.particles.burst(d.k, toV3(d.p), d.n || 10, d.s || 2); break;
      case 'moment': this.hud.moment(d.label, d.gain); break;
      case 'foamface': if (d.to === this.myId) this.hud.foam(); break;
      case 'shake': if (d.to == null || d.to === this.myId) this.shake = Math.max(this.shake, d.a || 0.3); break;
      case 'ragdoll': this.startRagdoll(d.to, d.v); break;
      case 'hurt': if (d.to === this.myId) { this.hud.hurt(d.a); audio.play('hurt', 0.8); this.shake = Math.max(this.shake, d.a * 0.5); } break;
      case 'respawn':
        if (d.to === this.myId) {
          const s = SPAWNS[this.myId]; this.local.body.position.set(s.x, s.y, s.z); this.local.body.velocity.setZero(); this.local.yaw = 0; this.local.pitch = 0;
        }
        break;
    }
  }

  // ======================================================================
  // Networking
  // ======================================================================
  onNet(msg) {
    if (this.auth) {
      const pl = this.players[1]; if (!pl) return;
      if (msg.t === 'in' || msg.t === 'act') {
        if (msg.p) pl.pos = msg.p;
        if (msg.yaw != null) { pl.yaw = msg.yaw; pl.pitch = msg.pitch; }
        if (msg.v) pl.vel = msg.v;
        if (msg.i != null) pl.int = !!msg.i;
      }
      if (msg.t === 'act') this.handleAction(1, msg.a, msg.d);
    } else if (msg.t === 'snap') this.onSnap(msg);
  }
  itemEntry(item) {
    const p = item.mesh.position, q = item.mesh.quaternion;
    return [item.id, item.type, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), item.holder, item.slot === 'cam' ? 1 : 0];
  }
  // Delta snapshot: only items that moved or changed (plus everything on a "full" snapshot).
  // Keeps the connection light so voice chat isn't fighting the game for bandwidth.
  buildSnap(full) {
    const it = [];
    for (const item of this.items.values()) {
      const e = this.itemEntry(item);
      const changed = full || item.ver !== item.sentVer;
      const key = e.slice(2, 11).join(',');
      if (!changed && key === item.netKey) continue;
      item.netKey = key;
      if (changed) { e.push(item.s); item.sentVer = item.ver; }
      it.push(e);
    }
    const st = this.state;
    return {
      t: 'snap', it, fx: this.outFx, rm: this.removedIds.splice(0), full: full ? 1 : 0,
      pl: this.players.map((p) => p && { pos: p.pos.map(r3), yaw: r3(p.yaw), pitch: r3(p.pitch), held: p.held, cam: p.cam, act: p.act, int: p.int ? 1 : 0, vel: p.vel.map(r3),
        hp: Math.round(p.hp), fire: p.fire > 0 ? 1 : 0, dead: r3(p.dead) }),
      st: {
        time: st.time, burners: st.burners, fires: st.fires.map((f) => ({ id: f.id, b: f.b, hp: r3(f.hp), p: f.p })), orders: st.orders,
        flood: { on: st.flood.on, r: r3(st.flood.r) }, quake: st.quake, dark: st.dark, money: st.money, viewers: st.viewers, peak: st.peak,
        windDir: st.windDir, gust: st.gust, tilt: st.tilt, chicken: this.chaos.chickenState(),
        rec: st.rec, rt: r3(st.rt), tape: st.tape, clips: st.clips || 0, int: r3(st.int || 0), zoom: r3(st.zoom || 1),
      },
    };
  }
  onSnap(msg) {
    const now = performance.now();
    const map = new Map(); for (const e of msg.it) map.set(e[0], e);
    this.snaps.push({ t: now, it: map, pl: msg.pl, ch: msg.st.chicken });
    if (this.snaps.length > 12) this.snaps.shift();
    Object.assign(this.state, msg.st);
    for (const e of msg.it) {
      // keep the latest known state attached to each item's latest entry (deltas often carry position only)
      const prev = this.netItems.get(e[0]);
      if (e.length <= 11 && prev && prev.length > 11) e[11] = prev[11];
      this.netItems.set(e[0], e);
      let it = this.items.get(e[0]);
      if (!it) {
        it = new Item(e[0], e[1], e[11] || {}); this.items.set(e[0], it); this.scene.add(it.mesh);
        it.mesh.position.set(e[2], e[3], e[4]); it.mesh.quaternion.set(e[5], e[6], e[7], e[8]);
      } else if (e[11]) { it.s = e[11]; }
      it.holder = e[9]; it.slot = e[9] >= 0 ? (e[10] ? 'cam' : 'hand') : null;
    }
    const drop = (id) => { const it = this.items.get(id); if (it) this.scene.remove(it.mesh); this.items.delete(id); this.netItems.delete(id); };
    for (const id of msg.rm || []) drop(id);
    if (msg.full) for (const id of [...this.items.keys()]) if (!map.has(id)) drop(id);
    msg.pl.forEach((p, i) => {
      const pl = this.players[i]; if (!p || !pl) return;
      pl.held = p.held; pl.cam = p.cam; pl.act = p.act; pl.hp = p.hp; pl.fire = p.fire; pl.dead = p.dead;
      if (i !== this.myId) { pl.int = !!p.int; pl.vel = p.vel; }
    });
    if (msg.fx) for (const [n, d] of msg.fx) this.applyFx(n, d);
    if (msg.st.rec) this.recordFrame(msg, false); // the client keeps its own copy of the tape
  }
  interpolate() {
    const n = this.snaps.length; if (!n) return;
    const rt = performance.now() - INTERP_DELAY;
    const latest = this.snaps[n - 1];
    let a = this.snaps[0], b = latest;
    for (let i = 0; i < n - 1; i++) if (this.snaps[i].t <= rt && this.snaps[i + 1].t >= rt) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    if (rt >= latest.t) a = b = latest;
    const al = b.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t)));
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (const [id, it] of this.items) {
      if (it.holder === this.myId) continue;
      const eb = b.it.get(id) || this.netItems.get(id); if (!eb) continue;
      const ea = a.it.get(id) || eb;
      it.mesh.position.set(ea[2] + (eb[2] - ea[2]) * al, ea[3] + (eb[3] - ea[3]) * al, ea[4] + (eb[4] - ea[4]) * al);
      qa.set(ea[5], ea[6], ea[7], ea[8]); qb.set(eb[5], eb[6], eb[7], eb[8]);
      it.mesh.quaternion.slerpQuaternions(qa, qb, al);
    }
    this.players.forEach((p, i) => {
      if (!p || i === this.myId) return;
      const pa = a.pl[i], pb = b.pl[i]; if (!pa || !pb) return;
      const v = this.view[i];
      v.pos.set(pa.pos[0] + (pb.pos[0] - pa.pos[0]) * al, pa.pos[1] + (pb.pos[1] - pa.pos[1]) * al, pa.pos[2] + (pb.pos[2] - pa.pos[2]) * al);
      v.yaw = lerpAngle(pa.yaw, pb.yaw, al); v.pitch = pa.pitch + (pb.pitch - pa.pitch) * al;
      p.pos = [v.pos.x, v.pos.y, v.pos.z]; p.yaw = v.yaw; p.pitch = v.pitch;
      v.speed = Math.hypot(pb.vel[0], pb.vel[2]);
    });
    if (b.ch && a.ch) {
      this.chickenView = { x: a.ch.x + (b.ch.x - a.ch.x) * al, y: a.ch.y + (b.ch.y - a.ch.y) * al, z: a.ch.z + (b.ch.z - a.ch.z) * al, yaw: lerpAngle(a.ch.yaw, b.ch.yaw, al), carry: b.ch.carry, f: b.ch.f };
    } else this.chickenView = b.ch || null;
  }

  // ======================================================================
  // Main update
  // ======================================================================
  update(dt) {
    if (!this.running) return;
    this.frame++;
    this.time += dt;
    const st = this.state;
    const me = this.players[this.myId];

    // ---- local player movement + actions ----
    const inp = this.input;
    if (!this.paused) {
      if (inp.locked && !(this.local.knock > 0)) this.local.look(inp.dx, inp.dy);
      const lp = this.local.body.position;
      const slippery = st.flood.r > 0.1 && Math.hypot(lp.x - PUDDLE_CENTER.x, lp.z - PUDDLE_CENTER.z) < st.flood.r;
      const push = st.set === 'boat' ? { x: st.tilt[0] * 0.45, z: st.tilt[1] * 0.45 } : st.gust ? { x: Math.cos(st.windDir) * 2.5, z: Math.sin(st.windDir) * 2.5 } : null;
      this.local.update(dt, inp, { slippery, quake: st.quake > 0, push });
      this.slippery = slippery;
    }
    const lb = this.local.body;
    me.pos = [lb.position.x, lb.position.y, lb.position.z];
    me.vel = [lb.velocity.x, lb.velocity.y, lb.velocity.z];
    me.yaw = this.local.yaw; me.pitch = this.local.pitch;
    me.int = inp.isDown('KeyE');
    const acts = [];
    if (inp.locked && !this.paused && !(this.local.knock > 0)) {
      if (inp.clicked(0)) acts.push('click');
      if (inp.clicked(2)) acts.push('throw');
      if (inp.wasPressed('KeyQ')) acts.push('cam');
      if (inp.wasPressed('KeyR')) acts.push('rec');
      if (inp.wasPressed('KeyE')) acts.push('use');
    }
    if (lb.position.y < -5) { lb.position.set(SPAWNS[this.myId].x, 1, SPAWNS[this.myId].z); lb.velocity.setZero(); }

    if (this.auth) {
      for (const a of acts) this.handleAction(this.myId, a);
      if (inp.wheel && me.cam >= 0) this.zoomCam(me, -inp.wheel);
      if (!this.paused) this.hostStep(dt);
    } else {
      this.physics.step(1 / 60, dt, 4);
      this.clampLocal();
      for (const a of acts) this.net.send({ t: 'act', a, p: me.pos, yaw: me.yaw, pitch: me.pitch });
      if (inp.wheel && me.cam >= 0) {
        this.net.send({ t: 'act', a: 'zoom', d: -inp.wheel });
        this.state.zoom = Math.max(1, Math.min(4, (this.state.zoom || 1) * Math.pow(1.15, -inp.wheel))); // feel it instantly
      }
      this.inputT -= dt;
      if (this.inputT <= 0) {
        this.inputT = INPUT_INTERVAL;
        this.net.send({ t: 'in', p: me.pos.map(r3), v: me.vel.map(r3), yaw: r3(me.yaw), pitch: r3(me.pitch), i: me.int ? 1 : 0 });
      }
      this.interpolate();
    }
    this.updateVoice(inp);
    this.updateVisuals(dt);
    this.render(dt);
    inp.endFrame();
  }

  updateVoice(inp) {
    const v = this.voice;
    if (!v) { this.hud.voiceStatus(''); return; }
    if (inp.wasPressed('KeyV')) { v.setMuted(!v.muted); this.hud.toast(v.muted ? '🔇 Mic muted (V)' : '🎤 Mic on (V)', v.muted ? 'bad' : 'good'); }
    v.syncRec(!!this.state.rec);
    v.updateLevels();
    // proximity voice: your partner gets quieter across the kitchen
    const other = this.players.find((p, i) => p && i !== this.myId);
    if (other) {
      const me = this.players[this.myId];
      const d = Math.hypot(other.pos[0] - me.pos[0], other.pos[2] - me.pos[2]);
      v.setRemoteVolume(Math.max(0.3, Math.min(1, 1.25 - d / 10)));
    }
    const mic = !v.local ? (v.micDenied ? '🎤✖ mic blocked' : '🔇 mic off') : v.muted ? '🔇 muted (V)' : v.localLevel > 0.04 ? '🎤 talking…' : '🎤 on (V to mute)';
    const them = other && v.remoteLevel > 0.04 ? ` · 🔊 ${other.name}` : '';
    this.hud.voiceStatus(mic + them);
  }

  hostStep(dt) {
    const st = this.state;
    // remote players: smooth view + kinematic proxy
    this.players.forEach((p, i) => {
      if (!p || i === this.myId) return;
      const v = this.view[i], k = 1 - Math.exp(-dt * 18);
      v.pos.lerp(new THREE.Vector3(...p.pos), k);
      v.yaw = lerpAngle(v.yaw, p.yaw, k); v.pitch += (p.pitch - v.pitch) * k;
      v.speed = Math.hypot(p.vel[0], p.vel[2]);
      this.proxies[i].moveTo(v.pos, dt);
    });
    // timers
    const prev = st.time;
    st.time = Math.max(0, st.time - dt);
    if (prev > 60 && st.time <= 60) { this.fx('banner', { title: '⏰ ONE MINUTE LEFT! ⏰', sub: 'Serve everything you can!' }); this.fx('sfx', { n: 'alarm' }); }
    if (st.time <= 10 && Math.ceil(prev) !== Math.ceil(st.time)) this.fx('sfx', { n: 'tick' });
    // player acts (spray)
    for (const p of this.players) {
      if (!p) continue;
      const held = p.held >= 0 ? this.items.get(p.held) : null;
      if (held?.type === 'extinguisher' && p.int) p.act = 'spray';
      else if (p.act === 'spray') p.act = null;
      // slipping
      p.slipCd -= dt;
      const inPuddle = st.flood.r > 0.1 && Math.hypot(p.pos[0] - PUDDLE_CENTER.x, p.pos[2] - PUDDLE_CENTER.z) < st.flood.r;
      if (inPuddle && Math.hypot(p.vel[0], p.vel[2]) > 3.6 && p.slipCd <= 0) {
        p.slipCd = 6;
        this.fx('sfx', { n: 'slip', p: p.pos });
        this.fx('burst', { k: 'water', p: [p.pos[0], 0.1, p.pos[2]], n: 14, s: 2.5 });
        this.knockDown(p.id, { x: p.vel[0], z: p.vel[2] }, 4, `${p.name} slipped and ate the floor`, 45);
      }
    }
    this.cooking.tick(dt);
    this.healthStep(dt);
    this.chaos.tick(dt);
    st.int = st.rec ? this.computeInterest() : 0;
    if (st.rec) {
      st.rt += dt;
      if (st.rt >= st.tape) { st.rt = st.tape; st.rec = 0; this.fx('sfx', { n: 'recOff' }); this.fx('banner', { title: '📼 TAPE FULL! 📼', sub: 'No more recording this episode — finish those orders!' }); }
    }
    // boat rocking
    if (st.set === 'boat') {
      st.tilt = [Math.sin(this.time * 0.45) * 2.6, Math.sin(this.time * 0.31 + 1) * 1.5];
      this.physics.gravity.set(st.tilt[0], -9.82, st.tilt[1]);
      if (Math.abs(st.tilt[0]) > 2.3) for (const it of this.items.values()) if (it.body && it.holder === -1) it.body.wakeUp();
    }
    this.physics.step(1 / 60, dt, 4);
    this.clampLocal();
    this.postStep();
    if (st.time <= 0) return this.endEpisode();
    // snapshots: sent to the client and/or written to the tape while recording
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = SNAP_INTERVAL;
      if (this.net || st.rec) {
        this.snapCount = (this.snapCount || 0) + 1;
        const snap = this.buildSnap(this.forceFull || this.snapCount % 30 === 0);
        this.forceFull = false;
        if (this.net) this.net.send(snap);
        if (st.rec) this.recordFrame(snap, true);
        this.outFx = [];
      }
    }
  }

  // ---- Recording (the tape) ----
  toggleRec(pl) {
    const st = this.state;
    if (!st.rec && st.rt >= st.tape - 0.5) return this.toast(pl, '📼 The tape is full!');
    st.rec = st.rec ? 0 : 1;
    this.forceFull = true; this.recFresh = true;
    if (!this.net && st.rec) this.outFx = [];
    this.fx('sfx', { n: st.rec ? 'recOn' : 'recOff' });
    this.fx('toast', { text: st.rec ? '● RECORDING — get the good stuff on tape!' : '⏸ Recording paused (saving tape)', kind: st.rec ? 'bad' : '' });
  }
  // Tape frames always list every item (the network only sends changes).
  // Host: snapshot of its own items (state copied when it changed). Client: its merged view of the host's items.
  recordFrame(snap, isHost) {
    const keep = (f) => REC_FX.has(f[0]);
    let it;
    if (isHost) {
      it = [];
      for (const item of this.items.values()) {
        const e = this.itemEntry(item);
        if (item.ver !== item.recVer || this.recording.length === 0 || this.recFresh) { e.push(JSON.parse(JSON.stringify(item.s))); item.recVer = item.ver; }
        it.push(e);
      }
      this.recFresh = false;
    } else it = [...this.netItems.values()];
    this.recording.push({ rt: snap.st.rt, it, pl: snap.pl, st: snap.st, fx: (snap.fx || []).filter(keep) });
  }

  // Never get launched at crazy speeds or out of the kitchen, whatever the physics does.
  clampLocal() {
    const b = this.local.body, v = b.velocity, p = b.position;
    const h = Math.hypot(v.x, v.z), maxH = 9;
    if (h > maxH) { v.x *= maxH / h; v.z *= maxH / h; }
    if (v.y > 8) v.y = 8;
    const lim = (x, a, c) => Math.max(a, Math.min(c, x));
    const nx = lim(p.x, -6.62, 6.62), nz = lim(p.z, -4.62, 4.62);
    if (nx !== p.x) { p.x = nx; v.x = 0; }
    if (nz !== p.z) { p.z = nz; v.z = 0; }
    if (p.y > 6) { p.y = 6; v.y = 0; }
  }

  postStep() {
    for (const k of this.pendingKnocks.splice(0)) this.knockDown(...k);
    const up = new CANNON.Vec3(0, 1, 0), tmp = new CANNON.Vec3();
    for (const it of [...this.items.values()]) {
      if (it.holder !== -1 || !it.body) continue;
      const p = it.body.position;
      it.mesh.position.set(p.x, p.y, p.z);
      it.mesh.quaternion.set(it.body.quaternion.x, it.body.quaternion.y, it.body.quaternion.z, it.body.quaternion.w);
      // fell out of the world
      if (p.y < -4 || Math.abs(p.x) > 40 || Math.abs(p.z) > 40) { this.destroyItem(it); continue; }
      // trash can
      if (Math.hypot(p.x - TRASH_POS.x, p.z - TRASH_POS.z) < 0.3 && p.y < 1.0 && p.y > 0.3) {
        const thrown = it.thrownBy >= 0 && it.thrownFrom && it.thrownFrom.distanceTo(TRASH_POS) > 3;
        if (!it.def.cookware && it.type !== 'showcam' && it.type !== 'extinguisher') { this.trashItem(null, it, thrown); continue; }
        if (it.def.cookware && (it.s.c.length || it.s.w)) { it.s.c = []; it.s.w = 0; it.s.k = 0; it.touch(); }
      }
      // through the serving window
      if (p.x > 6.95 && Math.abs(p.z) < 0.8 && p.y > 0.9 && p.y < 2.2) {
        const pl = this.players[it.thrownBy] || null;
        if (it.def.container && !it.def.cookware) { this.cooking.serve(it, pl, it.thrownBy >= 0); this.destroyItem(it); continue; }
        if (it.def.food) { this.cooking.serve(it, pl, true); this.destroyItem(it); continue; }
        if (it.type === 'mixer') { this.moment('yeet', WINDOW_POS, 80, 'The mixer was thrown at the judges'); this.fx('sfx', { n: 'laugh' }); this.destroyItem(it); continue; }
        if (it.home) { this.fx('toast', { text: "The judges threw it back. Nice try. 🙄", kind: 'bad' }); this.destroyItem(it); continue; }
      }
      // upside-down containers spill
      if (it.def.container && (it.s.c.length || it.s.w) && !it.body.sleepState) {
        it.body.quaternion.vmult(up, tmp);
        if (tmp.y < -0.2) this.spill(it);
      }
      if (it.thrownBy >= 0 && this.time - it.thrownAt > 3) it.thrownBy = -1;
    }
  }
  spill(it) {
    const p = it.body.position;
    let n = 0;
    for (const c of it.s.c) {
      if (c.t === 'soup') { this.fx('burst', { k: 'confetti', p: [p.x, p.y, p.z], n: 0 }); continue; }
      const f = this.spawnItem(c.t, new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.3), { ch: c.ch, k: c.k || 0 });
      f.body.velocity.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2); n++;
    }
    if (it.s.w || it.s.c.some((c) => c.t === 'soup')) this.fx('burst', { k: 'water', p: [p.x, p.y, p.z], n: 20, s: 2.5 });
    it.s.c = []; it.s.w = 0; it.s.k = 0; it.touch();
    this.fx('sfx', { n: 'splash', p: [p.x, p.y, p.z] });
    this.moment('spill', p, 30, `Spilled the ${it.def.name.toLowerCase()}`);
  }

  endEpisode() {
    this.running = false;
    const st = this.state;
    st.rec = 0;
    const perfect = st.served.filter((s) => s.q === 'perfect').length;
    // views/ad money get filled in once the tape is posted (see main.js + replay)
    const results = {
      served: st.served, perfect, dishMoney: st.money, expired: st.expired, events: this.chaos.count, set: st.set,
      names: this.players.filter(Boolean).map((p) => p.name), footage: st.rt, clips: st.clips || 0, wipeouts: st.wipeouts || 0,
    };
    this.fx('sfx', { n: 'jingle' });
    if (this.net) { this.net.send(this.buildSnap(true)); this.net.send({ t: 'end', results }); }
    audio.stopLoops();
    this.onEnd?.(results);
  }

  // ======================================================================
  // Visuals (everyone)
  // ======================================================================
  cookwareNearBurnerVisual(i) {
    const b = BURNERS[i];
    for (const it of this.items.values()) {
      if (!it.def.cookware || it.holder !== -1) continue;
      const p = it.mesh.position;
      if (Math.hypot(p.x - b.x, p.z - b.z) < 0.3 && p.y > 0.85 && p.y < 1.3) return it;
    }
    return null;
  }
  updateVisuals(dt) {
    const st = this.state;
    // held items follow hands
    for (const it of this.items.values()) {
      if (it.holder < 0) { it.rebuildVisual(); continue; }
      it.rebuildVisual();
      if (it.holder === this.myId) {
        const pose = this.handPose(this.local.body.position, this.local.yaw, this.local.pitch, it.slot);
        it.mesh.position.copy(pose.p); it.mesh.quaternion.copy(pose.q);
      } else if (this.auth) {
        const v = this.view[it.holder]; if (!v) continue;
        const pose = this.handPose(v.pos, v.yaw, v.pitch, it.slot);
        it.mesh.position.copy(pose.p); it.mesh.quaternion.copy(pose.q);
      }
    }
    // avatars
    this.players.forEach((p, i) => {
      if (!p) return;
      const av = this.avatars[i];
      if (i === this.myId) {
        const lb = this.local.body;
        av.update(lb.position, this.local.yaw, this.local.pitch, dt, Math.hypot(lb.velocity.x, lb.velocity.z));
        if (av.ragdolling) {
          const ended = av.updateRagdoll(dt);
          if (!ended) { // your real body follows your flopping torso, so you get up where you landed
            const t = av.ragTorso();
            if (this.kitchen.groundHeightAt(t.position.x, t.position.z) === 0) {
              lb.position.x = t.position.x; lb.position.z = t.position.z; lb.velocity.x = 0; lb.velocity.z = 0;
            }
          } else this.local.knock = 0;
        }
      } else { const v = this.view[i]; av.update(v.pos, v.yaw, v.pitch, dt, v.speed); av.updateRagdoll(dt); }
      av.setOnFire(p.fire > 0);
      av.setGhost(p.dead > 0 && !av.ragdolling);
      if (p.fire > 0 && Math.random() < dt * 12) this.particles.spawn('ember', av.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3((Math.random() - 0.5), 2, (Math.random() - 0.5)));
    });
    // my own health / burning / ghost HUD
    const mine = this.players[this.myId];
    this.hud.health(mine.hp ?? MAX_HP, this.players.find((p, i) => p && i !== this.myId));
    this.hud.onFire(mine.fire > 0);
    this.hud.ghost(mine.dead > 0 ? mine.dead : 0);
    // stove
    this.kitchen.burnerMeshes.forEach((bm, i) => {
      const on = st.burners[i];
      bm.glowMat.emissive.setHex(on ? 0xff3300 : 0x000000);
      bm.glowMat.emissiveIntensity = on ? 1.4 + Math.sin(this.time * 8 + i) * 0.2 : 0;
      bm.knob.rotation.y = on ? -1.3 : 0;
    });
    // fires / puddle / sink
    this.fireVis.sync(st.fires, this.particles, dt);
    this.puddleVis.sync(st.flood.r, dt);
    this.sinkRunT = Math.max(0, (this.sinkRunT || 0) - dt);
    this.kitchen.sinkWater.visible = !!st.flood.on || this.sinkRunT > 0;
    if (st.flood.on && Math.random() < dt * 25) this.particles.spawn('water', new THREE.Vector3(SINK_POS.x, 1.0, SINK_POS.z + 0.2), new THREE.Vector3((Math.random() - 0.5) * 3, 2.5, 1.5 + Math.random() * 2));
    // chicken
    const ch = this.auth ? this.chaos.chickenState() : this.chickenView;
    this.chickenMesh.visible = !!ch;
    if (ch) {
      const m = this.chickenMesh; m.position.set(ch.x, ch.y, ch.z); m.rotation.y = ch.yaw;
      const t = this.time * (ch.f ? 30 : 18);
      m.userData.wingL.rotation.z = Math.sin(t) * 0.6; m.userData.wingR.rotation.z = -Math.sin(t) * 0.6;
      m.userData.legL.rotation.x = Math.sin(t) * 0.7; m.userData.legR.rotation.x = -Math.sin(t) * 0.7;
      m.userData.head.position.z = -0.18 + Math.sin(t * 0.5) * 0.04;
      const key = ch.carry.join(',');
      if (key !== this.chickenLootKey) {
        this.chickenLootKey = key; const loot = m.userData.loot; loot.clear();
        if (ch.carry.length) { const g = buildIngredient(ch.carry[ch.carry.length - 1]); g.scale.setScalar(0.8); loot.add(g); }
      }
      if (Math.random() < dt * 3) this.particles.spawn('feather', m.position.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3((Math.random() - 0.5), 0.5, (Math.random() - 0.5)));
    }
    // lights out
    const targetDark = st.dark > 0 ? 0.07 : 1;
    this.darkLevel += (targetDark - this.darkLevel) * Math.min(1, dt * (st.dark > 0 ? 8 : 2));
    const L = this.kitchen.lights;
    L.hemi.intensity = L.base.hemi * this.darkLevel; L.dir.intensity = L.base.dir * this.darkLevel; L.fill.intensity = L.base.fill * this.darkLevel;
    // ON AIR sign + camera REC light
    const cam = [...this.items.values()].find((i) => i.type === 'showcam');
    if (this.kitchen.onAirMat) this.kitchen.onAirMat.color.setScalar(0.6 + 0.4 * Math.abs(Math.sin(this.time * 3)));
    const rec = cam?.visual?.children[0]?.userData.rec;
    if (rec) rec.visible = Math.sin(this.time * 6) > 0;
    if (this.kitchen.judge) this.kitchen.judge.rotation.x = Math.sin(this.time * 1.5) * 0.15;
    for (const a of this.kitchen.animated) if (a.kind === 'wave') a.obj.rotation.z = Math.sin(this.time * 0.45) * 0.4;
    // mixer whisk spin
    for (const it of this.items.values()) if (it.type === 'mixer' && it.s.on) { const w = it.visual.children[0]?.userData.whisk; if (w) w.rotation.y += dt * 40; }

    // particles from state
    let sizzle = 0, boil = 0, spray = 0, chopping = false;
    for (let i = 0; i < BURNERS.length; i++) {
      const cw = this.cookwareNearBurnerVisual(i);
      const lit = st.burners[i] || st.fires.some((f) => f.b === i);
      if (!cw || !lit) continue;
      const p = cw.mesh.position;
      if (cw.type === 'pan' && cw.s.c.length) { sizzle++; if (Math.random() < dt * 6) this.particles.spawn('steam', new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.2, p.y + 0.08, p.z), new THREE.Vector3(0, 0.6, 0)); }
      if (cw.type === 'pot' && cw.s.w) { boil++; if (Math.random() < dt * 10) this.particles.spawn('steam', new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.2, p.y + 0.15, p.z), new THREE.Vector3(0, 0.9, 0)); }
    }
    for (const it of this.items.values()) {
      const burnt = it.def.cookware ? (it.s.k >= 2 || it.s.c.some((c) => c.k >= 2)) : (it.type === 'patty' && it.s.k >= 2);
      if (burnt && Math.random() < dt * 4) this.particles.spawn('smoke', it.mesh.position.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.7, (Math.random() - 0.5) * 0.2));
    }
    this.players.forEach((p) => {
      if (!p) return;
      if (p.act === 'chop') chopping = true;
      if (p.act === 'spray') {
        spray++;
        const ext = this.items.get(p.held);
        if (ext) {
          const dir = this.lookDir(p.id === this.myId ? this.local.yaw : this.view[p.id].yaw, p.id === this.myId ? this.local.pitch : this.view[p.id].pitch);
          const nozzle = ext.mesh.position.clone().addScaledVector(dir, 0.25).add(new THREE.Vector3(0, 0.25, 0));
          const range = [1, 1.3, 1.65][this.upgrades.ext] || 1;
          for (let k = 0; k < 4; k++) {
            const v = dir.clone().multiplyScalar(6.5 * range).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6));
            this.particles.spawn('foam', nozzle, v);
          }
        }
      }
    });
    this.particles.update(dt);
    // audio loops
    audio.setLoop('sizzle', Math.min(1, sizzle * 0.6));
    audio.setLoop('boil', Math.min(1, boil * 0.6));
    audio.setLoop('fire', Math.min(1, st.fires.reduce((a, f) => a + f.hp, 0) * 0.6));
    audio.setLoop('spray', spray ? 1 : 0);
    audio.setLoop('water', st.flood.on ? 1 : this.sinkRunT > 0 ? 0.6 : 0);
    this.chopSfxT -= dt;
    if (chopping && this.chopSfxT <= 0) { audio.play('chop', 0.8); this.chopSfxT = 0.17; }

    // camera-shake decay
    if (st.quake > 0) this.shake = Math.max(this.shake, 0.25);
    this.shake = Math.max(0, this.shake - dt * 1.5);

    this.updateTargetUI();
    this.updateBars();
    // let order tickets tick off what's already in the dish you're holding / looking at
    const me = this.players[this.myId];
    const heldIt = me.held >= 0 ? this.items.get(me.held) : null;
    const look = this.lastTarget?.kind === 'item' ? this.lastTarget.item : null;
    const chk = heldIt?.def.container ? heldIt : look?.def.container ? look : null;
    this.hud.update(st, chk ? { type: chk.type, s: chk.s } : null);
    this.hud.recipeBook(this.input.keys.has('Tab'));
  }

  updateTargetUI() {
    const me = this.players[this.myId];
    const held = me.held >= 0 ? this.items.get(me.held) : null;
    const tgt = this.findTarget(me);
    this.lastTarget = tgt;
    this.highlight.visible = false;
    let p = [];
    if (held?.type === 'extinguisher') p.push(`${K('Hold E')} Spray foam`);
    if (tgt) {
      if (tgt.obj && tgt.kind !== 'surface') { this.highlight.setFromObject(tgt.obj); this.highlight.visible = true; }
      if (tgt.kind === 'item') {
        const T = tgt.item;
        if (T.type === 'showcam') p.push(`${K('Q')} Pick up the show camera · ${K('E')} ${this.state.rec ? 'Stop' : 'Start'} recording`);
        else if (held && held.def.food && T.def.container) { const ok = canAddToContainer(T, held); p.push(ok === true ? `${K('LMB')} Put in ${T.def.name.toLowerCase()}` : `❌ ${ok}`); }
        else if (held && held.def.container && T.def.container && (held.def.cookware !== T.def.cookware)) p.push(`${K('LMB')} ${held.def.cookware ? 'Pour into' : 'Scoop from'} ${T.def.name.toLowerCase()}`);
        else if (held && held.def.container && T.def.food) p.push(`${K('LMB')} Add ${T.label().toLowerCase()}`);
        else if (!held) p.push(`${K('LMB')} Pick up ${T.label()}`);
        if (T.type === 'mixer' && T.s.on) p.push(`${K('E')} Unplug the mixer!`);
        if (T.def.choppable && !T.s.ch && this.onBoardVisual(T)) p.push(`${K('Hold E')} Chop`);
        if (T.def.cookware && this.burnerOfVisual(T) >= 0) p.push(`${K('E')} Burner ${this.state.burners[this.burnerOfVisual(T)] ? 'OFF' : 'ON'}`);
      } else if (tgt.kind === 'station') {
        const s = tgt.station;
        switch (s.type) {
          case 'crate': p.push(held ? (held.type === s.ing ? `${K('LMB')} Put it back` : '') : `${K('LMB')} Grab ${ITEM_DEFS[s.ing].emoji} ${ITEM_DEFS[s.ing].name.toLowerCase()}`); break;
          case 'dispenser': if (!held) p.push(`${K('LMB')} Take a ${s.item}`); break;
          case 'burner': p.push(`${K('E')} Turn burner ${this.state.burners[s.index] ? 'OFF' : 'ON'}`); if (held?.def.cookware) p.push(`${K('LMB')} Place on burner`); break;
          case 'board': if (held?.def.food) p.push(`${K('LMB')} Place on cutting board`); else p.push(`${K('Hold E')} Chop`); break;
          case 'sink': p.push(this.state.flood.on ? `${K('E')} STOP THE FLOOD!` : held?.type === 'pot' ? `${K('E')} Fill with water` : 'Sink — bring a pot'); break;
          case 'window': p.push(held ? `${K('LMB')} Serve ${held.label()}` : '🛎 Serving window — bring finished dishes'); break;
          case 'trash': if (held) p.push(`${K('LMB')} ${held.def.cookware ? 'Empty it' : 'Trash it'}`); break;
        }
      } else if (tgt.kind === 'npc') p.push(`${K('LMB')} CATCH THE CHICKEN!`);
    }
    if (held && held.type !== 'extinguisher' && !(tgt && tgt.kind === 'station' && ['window', 'trash'].includes(tgt.station.type))) p.push(`${K('LMB')} Drop · ${K('RMB')} Throw`);
    else if (held?.type === 'extinguisher') p.push(`${K('LMB')} Drop · ${K('RMB')} Throw`);
    this.hud.prompt(p.filter(Boolean).join('\n'), !!tgt && tgt.kind !== 'surface');

    // camera status line
    const cam = [...this.items.values()].find((i) => i.type === 'showcam');
    let cs = '';
    if (cam) {
      if (cam.holder === this.myId) cs = this.state.rec ? '🎥 ● RECORDING — keep the action in frame! (R to pause)' : '🎥 Camera in hand — press R to start recording';
      else {
        this.showCam.updateFrom(cam.mesh, this.camFov());
        const seen = this.showCam.isVisible(this.local.headPos());
        const who = cam.holder >= 0 ? this.players[cam.holder].name : null;
        const rolling = this.state.rec ? '● REC' : '⏸ not recording';
        cs = (seen && this.state.rec ? '🔴 YOU ARE ON TAPE · ' : seen ? '📷 In frame · ' : '⚫ Off camera · ') + (who ? `${who} has the camera (${rolling})` : `camera on a static shot (${rolling})`);
      }
    }
    this.hud.camStatus(cs);
  }
  onBoardVisual(it) {
    const p = it.mesh.position;
    return BOARDS.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < 0.34 && p.y > 0.9 && p.y < 1.25);
  }
  burnerOfVisual(it) {
    const p = it.mesh.position;
    return BURNERS.findIndex((b) => Math.hypot(p.x - b.x, p.z - b.z) < 0.3 && p.y > 0.85 && p.y < 1.3);
  }
  updateBars() {
    const bars = [];
    const v = new THREE.Vector3();
    const push = (pos, frac, cls) => {
      v.copy(pos).project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return;
      if (this.camera.position.distanceTo(pos) > 9) return;
      bars.push({ x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, frac, cls });
    };
    for (const it of this.items.values()) {
      if (it.holder >= 0) continue;
      const above = it.mesh.position.clone().add(new THREE.Vector3(0, 0.35, 0));
      if (it.def.choppable && it.s.cp > 0 && !it.s.ch) push(above, it.s.cp, '');
      if (it.def.cookware && this.burnerOfVisual(it) >= 0) {
        const k = it.type === 'pot' ? it.s.k : Math.max(0, ...it.s.c.map((c) => c.k || 0));
        if (k > 0) {
          if (k < 1) push(above, k, 'cook');
          else if (k < 1.6) push(above, 1, 'done');
          else push(above, (k - 1.6) / 1.1, 'danger');
        }
      }
    }
    this.hud.bars(bars);
  }

  // ======================================================================
  // Rendering
  // ======================================================================
  render(dt) {
    const st = this.state;
    const cam = this.camera;
    this.local.headPos(cam.position);
    let roll = 0;
    if (st.set === 'boat') roll = (st.tilt?.[0] || 0) * 0.012;
    if (this.slippery) roll += Math.sin(this.time * 4) * 0.02;
    cam.rotation.set(this.local.pitch, this.local.yaw, roll, 'YXZ');
    // ragdoll cam: you see the world from your tumbling head, then blend back up when you stand
    const myAv = this.avatars[this.myId];
    if (myAv.ragdolling) {
      const h = myAv.ragHead();
      this.ragPose = { p: new THREE.Vector3(h.position.x, h.position.y + 0.05, h.position.z), q: new THREE.Quaternion(h.quaternion.x, h.quaternion.y, h.quaternion.z, h.quaternion.w) };
      cam.position.copy(this.ragPose.p); cam.quaternion.copy(this.ragPose.q);
      this.getUpT = 0.5;
    } else if (this.getUpT > 0 && this.ragPose) {
      this.getUpT -= dt;
      const k = Math.max(0, this.getUpT / 0.5), e = k * k * (3 - 2 * k);
      cam.position.lerp(this.ragPose.p, e); cam.quaternion.slerp(this.ragPose.q, e);
    }
    if (this.shake > 0) {
      const s = this.shake * 0.08;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      cam.rotation.z += (Math.random() - 0.5) * s * 0.5;
    }
    const target = this.local.sprinting && this.local.moving ? 80 : 72;
    if (Math.abs(cam.fov - target) > 0.1) { cam.fov += (target - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
    this.renderer.render(this.scene, cam);

    // Picture-in-picture LIVE feed for whoever holds the camera
    const me = this.players[this.myId];
    const showItem = me.cam >= 0 ? this.items.get(me.cam) : null;
    if (showItem) {
      const w = Math.round(Math.min(460, innerWidth * 0.3)), h = Math.round(w * 9 / 16);
      const rect = { x: innerWidth - w - 18, y: innerHeight - h - 18, w, h };
      this.showCam.updateFrom(showItem.mesh, this.camFov());
      const heldItem = me.held >= 0 ? this.items.get(me.held) : null;
      showItem.mesh.visible = false; if (heldItem) heldItem.mesh.visible = false;
      this.avatars[this.myId].group.visible = false;
      this.showCam.renderPIP(this.renderer, this.scene, rect);
      showItem.mesh.visible = true; if (heldItem) heldItem.mesh.visible = true;
      this.avatars[this.myId].group.visible = true;
      this.hud.setPIP(rect, false);
    } else this.hud.setPIP(null);
  }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  dispose() {
    this.running = false;
    audio.stopLoops();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
