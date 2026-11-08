// Game orchestrator: owns the renderer, scene, world, player and UI, runs the loop and
// handles game state (menu / playing / paused / panel), inventory, saving and co-op.
//
// Co-op model: the host is authoritative. Every world-changing action goes through an
// "actor" ({ id, name, inventory, give, toast }) so the host can perform it on behalf of
// either player. A guest sends requests (use / hit / throw / chat) and mirrors snapshots.
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { World } from '../world/world.js';
import { ZONES, WILD_ZONES } from '../world/zones.js';
import { Player } from '../player/player.js';
import { HeldItems } from '../player/items.js';
import { Rancher } from '../player/rancher.js';
import { Projectiles } from '../physics/projectiles.js';
import { WildCreatures } from '../creatures/wild.js';
import { SPECIES, SPECIES_BY_ID } from '../data/creatures.js';
import { TYPES } from '../data/types.js';
import { Interactions } from './interact.js';
import { FX } from './fx.js';
import { HUD } from '../ui/hud.js';
import { TabPanel, PauseMenu } from '../ui/panels.js';
import { Chat } from '../ui/chat.js';
import { ITEMS, newInventory } from '../data/items.js';
import { BattleManager } from '../battle/battle.js';
import { BattleView } from '../battle/view.js';
import { BattleHUD } from '../ui/battle.js';
import { StarterPicker } from '../ui/starter.js';
import { Catching } from '../catching/catching.js';
import { createCreature } from '../creatures/instance.js';
import { STARTERS } from '../ui/starter.js';
import { Net } from '../net/network.js';
import * as Save from '../save/save.js';

const DAY_SECONDS = 12 * 60; // one in-game day = 12 real minutes
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const r2 = (n) => Math.round(n * 100) / 100;

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.state = 'menu';

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1500);
    this.scene.add(this.camera);
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.input = new Input(canvas);
    this.audio = new Audio();
    this.net = new Net();
    this.inventory = newInventory();
    this.party = [];   // my creatures (max 6)
    this.ranch = [];   // shared ranch storage (host) — creatures that didn't fit in a party
    this.unlocked = new Set(['meadow']);
    this.landmarks = new Set();
    this.guestSaves = {};
    this.profile = { name: 'Rancher', color: '#ef476f' };
    this.remote = null;      // the other player's Rancher avatar
    this.guestActor = null;  // host only

    // the local player as an actor
    const game = this;
    this.local = {
      id: 'local',
      get name() { return game.profile.name; },
      get inventory() { return game.inventory; },
      get party() { return game.party; },
      give: (item, n, quiet) => this.give(item, n, quiet),
      toast: (msg, kind) => this.toast(msg, kind),
    };

    this.interactions = new Interactions(this.camera);
    this.fx = new FX(this.scene);
    this.hud = new HUD(uiRoot, this);
    this.world = new World(this.scene);
    this.world.build(this);
    for (const id of WILD_ZONES) this.world.setUnlocked(id, this.unlocked.has(id));
    this.projectiles = new Projectiles(this.world, this);
    this.creatures = new WildCreatures(this);
    this.dex = { seen: new Set(), caught: new Set() };
    this.player = new Player(this.camera, this.world);
    this.items = new HeldItems(this.camera, this);
    this.panel = new TabPanel(uiRoot, this);
    this.pause = new PauseMenu(uiRoot, this);
    this.chat = new Chat(uiRoot, this);
    this.battles = new BattleManager(this);
    this.battleView = new BattleView(this);
    this.battleHUD = new BattleHUD(uiRoot, this);
    this.catching = new Catching(this);
    this.starter = new StarterPicker(uiRoot, this);

    this._wirePlayer();
    this._wireNet();
    this.input.onLockChange = (locked) => this._onLock(locked);
    canvas.addEventListener('click', () => {
      this.audio.unlock();
      if (this.starter.open) return;
      if (this.state === 'paused' || (this.state === 'playing' && !this.input.locked)) this.resume();
    });
    addEventListener('beforeunload', () => { if (this.state !== 'menu') { this.save(); this.net.leave(); } });

    this.menuAngle = 0;
    this._blockToastAt = 0;
    this._autosave = 0;
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this._frame());
  }

  get isGuest() { return this.net.role === 'guest'; }
  get isAuthority() { return this.net.role !== 'guest'; }
  /** My owner id inside battles ('local' = host/solo player, 'guest' = joining player). */
  get myId() { return this.isGuest ? 'guest' : 'local'; }
  get myBattle() { return this.battleView.mine(this.myId); }
  get inBattle() { return !!this.myBattle; }

  creatureName(inst) { return inst.nickname || SPECIES_BY_ID[inst.species].name; }

  _wirePlayer() {
    const p = this.player;
    p.isLocked = (zone) => !this.unlocked.has(zone);
    p.onBlocked = (zone) => {
      const now = performance.now();
      if (now - this._blockToastAt < 2500) return;
      this._blockToastAt = now;
      this.toast(`🔒 ${ZONES[zone].name} opens at Ranch Rating ${ZONES[zone].rating}`, 'muted');
      this.audio.play('locked');
    };
    p.onZone = (zone) => {
      this.hud.setZone(zone);
      const z = ZONES[zone];
      if (this.state === 'playing') { this.hud.banner(z.name, z.subtitle, z.color); this.audio.play('zone'); }
    };
    p.onStep = (water) => this.audio.play(water ? 'stepWater' : 'step', 1);
    p.onJump = () => this.audio.play('jump');
    p.onLand = () => this.audio.play('land');
  }

  // --- networking ------------------------------------------------------------------

  _wireNet() {
    const net = this.net;

    // ---- host receives from guest ----
    net.on('hello', (m) => {
      const name = String(m.name || 'Friend').slice(0, 14);
      let saved = this.guestSaves[name] || {};
      if (saved.orb !== undefined) saved = { inv: saved, party: [] }; // old save format
      const inv = { ...newInventory(), ...(saved.inv || {}) };
      const actor = {
        id: 'guest', name, inventory: inv, party: saved.party || [],
        give: (item, n, quiet) => { inv[item] = (inv[item] || 0) + n; net.send({ t: 'give', item, n, quiet: !!quiet, inv }); },
        toast: (msg, kind) => net.send({ t: 'toast', msg, kind }),
      };
      this.guestActor = actor;
      this._spawnRemote({ name, color: m.color });
      net.send({
        t: 'welcome', host: { name: this.profile.name, color: this.profile.color },
        time: this.world.sky.time, unlocked: [...this.unlocked], landmarks: [...this.landmarks],
        nodes: this.world.resources.flags(), inv, party: actor.party, pr: this.projectiles.snapshot(),
        cr: this.creatures.snapshot(), dex: { seen: [...this.dex.seen], caught: [...this.dex.caught] },
      });
      this.battles.changed();
      this.chat.add('', `🤠 ${name} joined the ranch!`, '', true);
      this.toast(`${name} joined the ranch!`, 'good');
      this.audio.play('chime');
      this.hud.setPlayers(2);
    });
    net.on('p', (m) => { if (this.remote) this._applyPose(this.remote, m.p); });
    net.on('use', (m) => {
      const def = this.interactions.byId.get(m.id);
      if (def?.use && this.guestActor && this._guestNear(def)) def.use(this.guestActor);
    });
    net.on('hit', (m) => {
      const def = this.interactions.byId.get(m.id);
      if (def?.hit && this.guestActor && this._guestNear(def)) def.hit(this.guestActor, m.tool);
    });
    net.on('throw', (m) => {
      const a = this.guestActor;
      if (!a || !(a.inventory[m.k] > 0)) return;
      a.inventory[m.k]--;
      net.send({ t: 'inv', inv: a.inventory });
      this.projectiles.throw(m.k, v3(m.o), v3(m.v), 'guest');
      this.worldSound('throw', v3(m.o));
    });
    net.on('starter', (m) => { if (this.guestActor && !this.guestActor.party.length) this._giveStarter(this.guestActor, m.id); });
    net.on('battle', (m) => { if (this.guestActor) this.battles.request(this.guestActor, m.nid); });
    net.on('bmove', (m) => { if (this.guestActor) this.battles.choose(this.guestActor, m.i); });
    net.on('brun', () => { if (this.guestActor) this.battles.run(this.guestActor); });
    net.on('lead', (m) => { if (this.guestActor) this._setLead(this.guestActor, m.i); });

    // ---- guest receives from host ----
    net.on('s', (m) => {
      if (!this.isGuest) return;
      this.world.sky.time = m.tm;
      if (this.remote) this._applyPose(this.remote, m.h);
      this.projectiles.applySnapshot(m.pr);
      if (m.cr) this.creatures.applySnapshot(m.cr);
    });
    net.on('emote', (m) => this.creatures.showEmote(m.id, m.s, m.d));
    net.on('knock', (m) => this.knockback(m.d[0], m.d[1], m.s));
    net.on('seen', (m) => this.markSeen(m.id, true));
    net.on('dex', (m) => {
      for (const id of m.seen || []) this.markSeen(id, true);
      for (const id of m.caught || []) this.dex.caught.add(id);
    });
    net.on('give', (m) => {
      this.inventory = m.inv; this.hud.refreshCounts();
      if (!m.quiet) this.hud.itemToast(m.item, m.n);
      this.audio.play('pick');
      if (this.panel.open) this.panel.render();
    });
    net.on('inv', (m) => { this.inventory = m.inv; this.hud.refreshCounts(); if (this.panel.open) this.panel.render(); });
    net.on('toast', (m) => this.toast(m.msg, m.kind));
    net.on('banner', (m) => { this.hud.banner(m.title, m.sub, m.color); if (m.snd) this.audio.play(m.snd); });
    net.on('node', (m) => { if (this.isGuest) this.world.resources.setDepleted(m.i, !!m.d); });
    net.on('wobble', (m) => this.world.resources.wobble(m.i));
    net.on('fx', (m) => this._playFx(m.k, v3(m.p), m.c));
    net.on('snd', (m) => this._playSound(m.n, v3(m.p), m.k));
    net.on('landmark', (m) => this.landmarks.add(m.id));
    net.on('party', (m) => { this.party = m.party; this.ranchCount = m.ranch; this._partyUpdated(); });
    net.on('bstate', (m) => this.battleView.apply(m.list));
    net.on('bev', (m) => this._onBattleEvent(m.ev));
    net.on('catch', (m) => this.battleView.playCatch(m.ev));
    net.on('unlock', (m) => { this.unlocked.add(m.id); this.world.setUnlocked(m.id, true); });

    // ---- both ----
    net.on('chat', (m) => {
      const name = this.remote?.name || 'Friend';
      this.chat.add(name, m.text, this.remote?.color || '#06d6a0');
      this.remote?.say(m.text);
      this.audio.play('ui');
    });

    net.onPeerLeave = () => {
      if (this.guestActor) {
        this.battles.run(this.guestActor);
        this.guestSaves[this.guestActor.name] = { inv: this.guestActor.inventory, party: this.guestActor.party };
      }
      const name = this.remote?.name || 'Your friend';
      this._removeRemote();
      this.guestActor = null;
      this.chat.add('', `👋 ${name} left the ranch.`, '', true);
      this.toast(`${name} left the ranch`, 'muted');
      this.hud.setPlayers(1);
      this.save();
    };
    net.onDisconnect = (reason) => {
      if (this.state === 'menu') return;
      this.quitToMenu(reason);
    };
  }

  _guestNear(def) {
    if (!this.remote) return false;
    const p = def.root.getWorldPosition(new THREE.Vector3());
    return p.distanceTo(this.remote.target) < (def.range || 4.5) + 6;
  }

  _spawnRemote(profile) {
    this._removeRemote();
    this.remote = new Rancher(this.scene, profile);
    this.remote.color = profile.color;
  }

  _removeRemote() {
    if (this.remote) { this.remote.dispose(); this.remote = null; }
  }

  _pose() {
    const p = this.player;
    return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), this.items.index, this.items.swings || 0];
  }

  _applyPose(r, a) {
    if (!a) return;
    r.setPose(a[0], a[1], a[2], a[3], a[4], a[5]);
    if (a[6] !== r.lastSwings) { if (r.lastSwings !== undefined) r.swing(); r.lastSwings = a[6]; }
  }

  /** Host button: start (continue or new) and open the room. */
  async startHost(profile) {
    this.start({ fresh: !Save.hasSave(), profile });
    this.hud.setRoom('…');
    try {
      const code = await this.net.host();
      this.hud.setRoom(code);
      this.hud.setPlayers(1);
      this.chat.add('', `🏠 Ranch is open! Room code: ${code}`, '', true);
      this.toast(`Room code: ${code} — send it to your friend`, 'good');
      return code;
    } catch (e) {
      this.hud.setRoom(null);
      this.toast(`Couldn't open the ranch online: ${e.message}`, 'bad');
      throw e;
    }
  }

  /** Join button: connect, say hello, wait for the host's welcome. */
  joinRanch(code, profile) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.net.leave(); reject(new Error('The host did not respond.')); }, 12000);
      this.net.on('welcome', (m) => {
        clearTimeout(timeout);
        this._startGuest(m, profile);
        resolve();
      });
      this.net.join(code).then(() => {
        this.net.send({ t: 'hello', name: profile.name, color: profile.color });
      }).catch((e) => { clearTimeout(timeout); reject(e); });
    });
  }

  _startGuest(m, profile) {
    this.audio.unlock();
    this.profile = { ...profile };
    this.inventory = { ...newInventory(), ...m.inv };
    this.unlocked = new Set(m.unlocked);
    this.landmarks = new Set(m.landmarks);
    this.world.sky.time = m.time;
    for (const id of WILD_ZONES) this.world.setUnlocked(id, this.unlocked.has(id));
    this.world.resources.authoritative = false;
    this.world.resources.applyFlags(m.nodes);
    this.projectiles.clear();
    this.projectiles.applySnapshot(m.pr || []);
    this.creatures.clear();
    this.creatures.authority = false;
    this.creatures.applySnapshot(m.cr || []);
    this.dex = { seen: new Set(m.dex?.seen || []), caught: new Set(m.dex?.caught || []) };
    this.party = m.party || [];
    this.battleView.clear();
    this.player.teleport(3, 18, 0);
    this.player.zone = 'ranch';
    this._spawnRemote(m.host);
    this._enterPlay(`Joined ${m.host.name}'s ranch!`);
    this.hud.setRoom(this.net.code);
    this.hud.setPlayers(2);
    this.chat.add('', `🤠 You joined ${m.host.name}'s ranch.`, '', true);
  }

  actorById(id) {
    if (id === 'guest') return this.guestActor;
    return this.local;
  }

  // --- party, starters & battles ------------------------------------------------------

  _giveStarter(actor, id) {
    if (!STARTERS.includes(id)) return;
    const c = createCreature(id, 5, { personality: 'playful' });
    actor.party.push(c);
    actor.toast(`${SPECIES_BY_ID[id].name} is your new partner! Pick 🐾 (key 6), aim at a wild creature and click to battle.`, 'good');
    this.markCaught(id);
    this.partyChanged(actor);
  }

  chooseStarter(id) {
    if (this.isGuest) this.net.send({ t: 'starter', id });
    else this._giveStarter(this.local, id);
    this.items.select(5);
    this.hud.banner('Partner chosen!', `${SPECIES_BY_ID[id].name} joins you`, TYPES[SPECIES_BY_ID[id].type].color);
    this.audio.play('chime');
    this.input.requestLock();
  }

  /** Host: a newly befriended creature goes to the party, or the ranch if the party is full. */
  addCreatureTo(actor, inst) {
    if (actor.party.length < 6) { actor.party.push(inst); this.partyChanged(actor); return 'party'; }
    this.ranch.push(inst);
    this.partyChanged(actor);
    return 'ranch';
  }

  markCaught(id) {
    this.markSeen(id, false);
    if (this.dex.caught.has(id)) return;
    this.dex.caught.add(id);
    if (this.net.role === 'host' && this.net.connected) this.net.send({ t: 'dex', caught: [id] });
    if (this.panel.open) this.panel.render();
  }

  /** Host: an actor's party changed — refresh my UI or tell the guest. */
  partyChanged(actor) {
    if (actor?.id === 'guest') this.net.send({ t: 'party', party: actor.party, ranch: this.ranch.length });
    else this._partyUpdated();
  }

  _partyUpdated() {
    this.hud.refreshCounts();
    if (this.panel.open) this.panel.render();
  }

  _setLead(actor, i) {
    const p = actor.party;
    if (p.length < 2 || this.battles.battleOf(actor.id)) return;
    if (i === undefined || i === null) p.push(p.shift());
    else if (p[i]) p.unshift(p.splice(i, 1)[0]);
    actor.toast(`${this.creatureName(p[0])} is now your lead partner`, 'good');
    this.partyChanged(actor);
  }

  cycleLead() { this.setLead(null); }
  setLead(i) {
    if (this.party.length < 2) return;
    if (this.isGuest) this.net.send({ t: 'lead', i });
    else this._setLead(this.local, i);
  }

  requestBattle(def) {
    const nid = +def.id.slice(3);
    if (this.isGuest) this.net.send({ t: 'battle', nid });
    else this.battles.request(this.local, nid);
  }

  requestMove(i) {
    if (this.isGuest) this.net.send({ t: 'bmove', i });
    else this.battles.choose(this.local, i);
    this.audio.play('ui');
  }

  requestRun() {
    if (this.isGuest) this.net.send({ t: 'brun' });
    else this.battles.run(this.local);
  }

  /** Host: battle list changed. */
  battleState(list) {
    this.battleView.apply(list);
    if (this.net.connected) this.net.send({ t: 'bstate', list });
  }

  /** Host: something happened in a battle (animate everywhere). */
  battleEvent(ev) {
    this._onBattleEvent(ev);
    if (this.net.connected) this.net.send({ t: 'bev', ev });
  }

  _onBattleEvent(ev) {
    this.battleView.event(ev);
    const mine = this.myBattle;
    if (ev.end && mine && mine.id === ev.b) this.hud.banner(ev.text, '', ev.end === 'win' || ev.end === 'caught' ? '#06d6a0' : '#ffd166');
  }

  catchEvent(ev) {
    this.battleView.playCatch(ev);
    if (this.net.connected) this.net.send({ t: 'catch', ev });
  }

  healAll() {
    for (const actor of [this.local, this.guestActor]) {
      if (!actor) continue;
      for (const c of actor.party) c.hp = c.stats.hp;
      this.partyChanged(actor);
    }
  }

  _regen(dt) {
    this._regenT = (this._regenT || 0) + dt;
    if (this._regenT < 4) return;
    this._regenT = 0;
    for (const actor of [this.local, this.guestActor]) {
      if (!actor || this.battles.battleOf(actor.id)) continue;
      let changed = false;
      for (const c of actor.party) {
        if (c.hp < c.stats.hp) { c.hp = Math.min(c.stats.hp, c.hp + Math.max(1, Math.round(c.stats.hp * 0.04))); changed = true; }
      }
      if (changed) this.partyChanged(actor);
    }
  }

  knockback(dx, dz, strength) {
    this.player.knock.set(dx * strength, 0, dz * strength);
    this.player.vel.y = Math.max(this.player.vel.y, 4.5);
    this.player.onGround = false;
    this.player.shake = 1;
    this.audio.play('land');
    this.toast('Oof! You got bowled over!', 'bad');
  }

  onProjectileRest(p) {
    if (p.kind === 'treat' && this.isAuthority) this.creatures.onTreatRest(p);
  }

  /** Record a species in the shared Creature Dex. fromNet = don't echo back. */
  markSeen(id, fromNet = false) {
    if (!SPECIES_BY_ID[id]) return;
    if (this.dex.seen.has(id)) return;
    this.dex.seen.add(id);
    const sp = SPECIES_BY_ID[id];
    this.hud.toast(`📖 New in the Dex: #${String(sp.num).padStart(2, '0')} ${sp.name} (${TYPES[sp.type].name})`, 'good');
    this.audio.play('open');
    if (this.panel.open) this.panel.render();
    if (this.net.connected) {
      if (this.isGuest && !fromNet) this.net.send({ t: 'seen', id });
      if (this.net.role === 'host') this.net.send({ t: 'dex', seen: [id] });
    }
  }

  sendChat(text) {
    this.chat.add(this.profile.name, text, this.profile.color);
    if (this.net.connected) this.net.send({ t: 'chat', text });
  }

  // --- requests (routed to the host when we're a guest) -------------------------------

  requestUse(def) {
    if (!def?.use && !this.isGuest) return;
    if (this.isGuest) { if (def.id) this.net.send({ t: 'use', id: def.id }); return; }
    def.use(this.local);
  }

  requestHit(def, tool) {
    if (this.isGuest) { if (def.id) this.net.send({ t: 'hit', id: def.id, tool }); return; }
    def.hit?.(this.local, tool);
  }

  requestThrow(kind, origin, vel) {
    this.inventory[kind]--;
    this.hud.refreshCounts();
    this.audio.play('throw');
    if (this.isGuest) {
      this.net.send({ t: 'throw', k: kind, o: origin.toArray().map(r2), v: vel.toArray().map(r2) });
      return;
    }
    this.projectiles.throw(kind, origin, vel, 'host');
    if (this.net.connected) this.net.send({ t: 'snd', n: 'throw', p: origin.toArray().map(r2), k: 1 });
  }

  // --- shared-world effects (played locally, mirrored to the other player by the host) --

  worldFx(kind, pos, color) {
    this._playFx(kind, pos, color);
    if (this.net.role === 'host' && this.net.connected) this.net.send({ t: 'fx', k: kind, p: pos.toArray().map(r2), c: color });
  }

  worldSound(name, pos, k = 1) {
    this._playSound(name, pos, k);
    if (this.net.role === 'host' && this.net.connected) this.net.send({ t: 'snd', n: name, p: [r2(pos.x), r2(pos.y), r2(pos.z)], k });
  }

  worldEvent(msg) {
    if (this.net.role === 'host' && this.net.connected) this.net.send(msg);
  }

  onNodeChange(i, depleted) {
    if (this.net.role === 'host' && this.net.connected) this.net.send({ t: 'node', i, d: depleted ? 1 : 0 });
  }

  _playFx(kind, pos, color) {
    if (kind === 'puff') this.fx.puff(pos, color);
    else if (kind === 'splash') this.fx.splash(pos);
    else if (kind === 'sparkle') this.fx.sparkle(pos, color);
  }

  _playSound(name, pos, k = 1) {
    const d = pos ? this.camera.position.distanceTo(pos) : 0;
    const vol = k * Math.max(0, 1 - d / 45);
    if (vol > 0.03) this.audio.play(name, vol);
  }

  /** Banner for everyone. */
  sharedBanner(title, sub, color, snd) {
    this.hud.banner(title, sub, color);
    if (snd) this.audio.play(snd);
    this.worldEvent({ t: 'banner', title, sub, color, snd });
  }

  // --- state -------------------------------------------------------------------

  start({ fresh, profile }) {
    this.audio.unlock();
    this.profile = { ...profile };
    const data = fresh ? null : Save.loadSave();
    if (fresh) Save.clearSave();
    this._applySave(data);
    this.world.resources.authoritative = true;
    this.creatures.clear();
    this.creatures.authority = true;
    this._enterPlay(`Welcome, ${this.profile.name}!`);
    if (fresh) this.save();
  }

  _enterPlay(sub) {
    this.state = 'playing';
    this.hud.show(true);
    this.chat.show(true);
    this.hud.setHotbar(this.items.index);
    this.hud.setZone(this.player.zone);
    this.hud.banner(ZONES.ranch.name, sub, ZONES.ranch.color);
    this.pause.setRole(this.net.role);
    this.input.requestLock();
    this.onStateChange?.(this.state);
    if (!this.party.length) setTimeout(() => { if (this.state !== 'menu' && !this.party.length) this.starter.show(); }, 1200);
  }

  _applySave(d) {
    this.inventory = { ...newInventory(), ...(d?.inventory || {}) };
    this.unlocked = new Set(d?.unlocked || ['meadow']);
    this.landmarks = new Set(d?.landmarks || []);
    this.guestSaves = d?.guests || {};
    this.party = d?.party || [];
    this.ranch = d?.ranch || [];
    this.battles.clear();
    this.battleView.clear();
    this.dex = { seen: new Set(d?.dex?.seen || []), caught: new Set(d?.dex?.caught || []) };
    this.world.sky.time = d?.time ?? 0.3;
    for (const id of WILD_ZONES) this.world.setUnlocked(id, this.unlocked.has(id));
    this.world.resources.restore(d?.nodes || this.world.resources.nodes.map(() => 0));
    this.projectiles.clear();
    if (d?.player) this.player.teleport(d.player.x, d.player.z, d.player.yaw);
    else this.player.teleport(0, 16, 0);
    this.player.zone = this.world.zoneAt(this.player.pos.x, this.player.pos.z);
  }

  serialize() {
    const guests = { ...this.guestSaves };
    if (this.guestActor) guests[this.guestActor.name] = { inv: this.guestActor.inventory, party: this.guestActor.party };
    return {
      profile: this.profile,
      inventory: this.inventory,
      party: this.party,
      ranch: this.ranch,
      guests,
      unlocked: [...this.unlocked],
      landmarks: [...this.landmarks],
      dex: { seen: [...this.dex.seen], caught: [...this.dex.caught] },
      time: this.world.sky.time,
      nodes: this.world.resources.serialize(),
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw },
    };
  }

  /** Only the host / solo player owns a save. */
  save() { if (this.state !== 'menu' && !this.isGuest) Save.writeSave(this.serialize()); }
  exportSave() { this.save(); Save.exportSave(Save.loadSave()); }
  importSave(file) {
    if (this.isGuest) return;
    Save.readSaveFile(file).then((d) => {
      Save.writeSave(d);
      this._applySave(d);
      this.hud.refreshCounts();
      this.toast('Save imported!', 'good');
    }).catch((e) => this.toast(`Import failed: ${e.message}`, 'bad'));
  }

  resume() {
    if (this.state === 'menu') return;
    this.panel.toggle(false);
    this.pause.show(false);
    this.state = 'playing';
    this.input.requestLock();
  }

  quitToMenu(reason) {
    if (this.isAuthority) this.battles.clear();
    this.save();
    this.net.leave();
    this._removeRemote();
    this.guestActor = null;
    this.battleView.clear();
    this.battleHUD.update(null);
    this.starter.hide();
    this.catching.pending = [];
    this.projectiles.clear();
    this.creatures.clear();
    this.creatures.authority = true;
    this.world.resources.authoritative = true;
    this.state = 'menu';
    this.pause.show(false);
    this.panel.toggle(false);
    this.chat.close();
    this.chat.show(false);
    this.hud.show(false);
    this.hud.setRoom(null);
    this.input.exitLock();
    this.onStateChange?.(this.state, reason);
  }

  _onLock(locked) {
    if (locked) { this.pause.show(false); return; }
    if (this.state === 'playing' && !this.panel.open && !this.chat.open && !this.starter.open) {
      this.state = 'paused';
      this.pause.show(true);
    }
  }

  openPanel() {
    this.panel.toggle(true);
    this.audio.play('open');
    this.input.exitLock();
  }

  closePanel() {
    this.panel.toggle(false);
    this.input.requestLock();
  }

  // --- gameplay helpers -----------------------------------------------------------

  toast(msg, kind) { this.hud.toast(msg, kind); }

  give(item, n = 1, quiet = false) {
    this.inventory[item] = (this.inventory[item] || 0) + n;
    this.hud.refreshCounts();
    if (!quiet) this.hud.itemToast(item, n);
    this.audio.play('pick');
    if (this.panel.open) this.panel.render();
  }

  sellAll(actor = this.local) {
    const inv = actor.inventory;
    let total = 0, count = 0;
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!it.sell) continue;
      const n = inv[id] || 0;
      if (!n) continue;
      total += n * it.sell; count += n;
      inv[id] = 0;
    }
    if (!total) { actor.toast('Nothing to sell — gather berries, wood, stone and flowers!', 'muted'); return; }
    inv.coins += total;
    actor.toast(`Sold ${count} items for 🪙 ${total}`, 'good');
    if (actor === this.local) { this.hud.refreshCounts(); this.audio.play('coin'); }
    else this.net.send({ t: 'inv', inv });
  }

  sleep(actor = this.local) {
    const t = this.world.sky.time;
    if (t > 0.22 && t < 0.75) { actor.toast("You're not sleepy yet. Come back in the evening.", 'muted'); return; }
    this.world.sky.time = 0.27;
    this.healAll();
    this.sharedBanner('Good morning!', `${actor.name} rested — everyone's creatures are fully healed`, '#ffd166', 'chime');
    this.save();
  }

  touchLandmark(id, msg, actor = this.local, pos) {
    if (!this.landmarks.has(id)) {
      this.landmarks.add(id);
      this.worldEvent({ t: 'landmark', id });
      this.sharedBanner('Landmark discovered!', msg, '#ffe066', 'chime');
      this.worldFx('sparkle', pos || this.player.pos.clone(), 0xffe066);
      this.save();
    } else {
      actor.toast('The crystal hums warmly.');
    }
  }

  /** Debug helper (browser console): game.unlockAll() */
  unlockAll() {
    for (const id of WILD_ZONES) { this.unlocked.add(id); this.world.setUnlocked(id, true); this.worldEvent({ t: 'unlock', id }); }
    this.toast('All zones unlocked (debug)', 'good');
  }

  // --- loop --------------------------------------------------------------------------

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const input = this.input;

    if (this.state === 'menu') {
      this.menuAngle += dt * 0.05;
      const r = 58;
      this.camera.position.set(Math.sin(this.menuAngle) * r, 22, Math.cos(this.menuAngle) * r);
      this.camera.lookAt(0, 4, 0);
      if (this.camera.fov !== 60) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
      this.world.sky.time = (this.world.sky.time + dt / 400) % 1;
      this.world.update(dt, this.camera.position);
      this.items.holder.visible = false;
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
      return;
    }
    this.items.holder.visible = true;

    // chat (Enter) and panel toggling (works while unlocked)
    if (this.state === 'playing' && input.wasPressed('Enter') && !this.chat.open && !this.panel.open) this.chat.openInput();
    if (this.panel.open) {
      if (input.pressedAny('Tab')) this.closePanel();
      else if (input.pressedAny('Escape')) { this.panel.toggle(false); this.state = 'paused'; this.pause.show(true); }
    } else if (this.state === 'playing' && input.wasPressed('Tab')) {
      this.openPanel();
    }

    // the world keeps running while paused when someone else is in it
    const active = this.state === 'playing' && input.locked && !this.panel.open && !this.chat.open;
    if (this.state !== 'paused' || this.net.connected) {
      this.world.sky.time = (this.world.sky.time + dt / DAY_SECONDS) % 1;
    }
    this.player.update(dt, input, !active);
    this.items.update(dt, input, this.player, active);
    if (this.isGuest) this.projectiles.updateProxies(dt);
    else this.projectiles.update(dt);
    this.remote?.update(dt);
    this.creatures.update(dt);
    if (this.isAuthority) { this.battles.update(dt); this.catching.update(dt); this._regen(dt); }
    this.battleView.update(dt);
    const myBattle = this.myBattle;
    this.battleHUD.update(myBattle, this.myId);
    if (myBattle && active) {
      for (let i = 0; i < 4; i++) if (input.wasPressed('Digit' + (i + 1))) this.requestMove(i);
      if (input.wasPressed('KeyR')) this.requestRun();
    }
    this.fx.update(dt);
    this.world.update(dt, this.camera.position);

    // look-at + interact
    const target = active ? this.interactions.update() : null;
    const inRange = this.interactions.inUseRange(target);
    this.hud.setLook(target, target ? this.interactions.subtitle(target) : '');
    if (active && target && inRange && input.wasPressed('KeyE')) this.requestUse(target);

    // Dex: anything you look at, or that comes close, counts as seen
    if (target?.speciesId) this.markSeen(target.speciesId);
    this._seenT = (this._seenT || 0) + dt;
    if (this._seenT > 0.5) {
      this._seenT = 0;
      for (const c of this.creatures.list.values()) if (c.root.visible && c.pos.distanceTo(this.player.pos) < 12) this.markSeen(c.sp.id);
    }

    this.hud.setClock(this.world.sky.clockText(), this.world.sky.isNight);

    // network send
    if (this.net.tick(dt)) {
      if (this.net.role === 'host') this.net.send({ t: 's', tm: r2(this.world.sky.time * 1000) / 1000, h: this._pose(), pr: this.projectiles.snapshot(), cr: this.creatures.snapshot() });
      else this.net.send({ t: 'p', p: this._pose() });
    }

    this._autosave += dt;
    if (this._autosave > 30) { this._autosave = 0; this.save(); }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}
