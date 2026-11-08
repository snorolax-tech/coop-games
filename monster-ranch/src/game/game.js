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
import { ZONES, WILD_ZONES, zoneTitle } from '../world/zones.js';
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
import { createCreature, calcStats } from '../creatures/instance.js';
import { STARTERS } from '../ui/starter.js';
import { ratingPoints, ratingInfo } from './rating.js';
import { Buildings } from '../ranch/buildings.js';
import { RanchSim } from '../ranch/ranch.js';
import { BuildMode } from '../ui/build.js';
import { BarnPanel } from '../ui/barn.js';
import { HOTBAR } from '../data/items.js';
import { ShopPanel, BoardPanel } from '../ui/shop.js';
import { SUPPLIES, UPGRADES, ZONE_PASSES, makeRequest } from '../data/shop.js';
import { GUARDIANS } from '../data/creatures.js';
import { Minimap } from '../ui/minimap.js';
import { Companion } from '../creatures/companion.js';
import { DuelPrompt } from '../ui/battle.js';
import { Net } from '../net/network.js';
import * as Save from '../save/save.js';

const DAY_SECONDS = 12 * 60; // one in-game day = 12 real minutes
// eslint-disable-next-line no-undef
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const REFRESH_MSG = 'Press Ctrl+F5 (or Cmd+Shift+R on Mac) on BOTH computers to load the newest version, then join again.';
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
    this.eggs = [];    // eggs I'm carrying (max 3)
    this.pendingEvo = [];
    this.ranch = [];   // shared ranch storage (host) — creatures that didn't fit in a party
    this.stats = { wins: 0, requests: 0 };
    this.upgrades = {};             // shared ranch upgrades (level per id)
    this.requests = [];             // notice board
    this.guardiansCalmed = new Set();
    this.rating = { level: 0, points: 0, breakdown: [] };
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
      get eggs() { return game.eggs; },
      set eggs(v) { game.eggs = v; },
      held: () => game.items.current.id,
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
    this.buildings = new Buildings(this);
    this.ranchSim = new RanchSim(this);
    this.buildMode = new BuildMode(uiRoot, this);
    this.barn = new BarnPanel(uiRoot, this);
    this.shop = new ShopPanel(uiRoot, this);
    this.board = new BoardPanel(uiRoot, this);
    this.minimap = new Minimap(uiRoot, this);
    this.companion = new Companion(this, { local: true });
    this.friendComp = new Companion(this, { local: false });
    this.companionOut = localStorage.getItem('mr-companion') === '1';
    this.duelPrompt = new DuelPrompt(uiRoot, this);
    this.pendingDuel = null;

    this._wirePlayer();
    this._wireNet();
    this.input.onLockChange = (locked, expected) => this._onLock(locked, expected);
    // the browser refused to recapture the mouse (it needs a click): show a small hint, not the pause menu
    this.input.onLockFail = () => {
      if (this.state === 'playing' && !this.menuOpen && !this.input.locked) this.hud.setClickHint(true);
    };
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
      this.toast(`🔒 ${zoneTitle(zone)} opens at Ranch Rating ${ZONES[zone].rating} (you're at ${this.rating.level}) — fill the Dex, befriend creatures and find landmarks!`, 'muted');
      this.audio.play('locked');
    };
    p.onZone = (zone) => {
      this.hud.setZone(zone);
      const z = ZONES[zone];
      if (this.state === 'playing') { this.hud.banner(zoneTitle(zone), z.order ? `${z.subtitle} · wild creatures Lv ${z.levels}` : z.subtitle, z.color); this.audio.play('zone'); }
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
      if (m.v !== BUILD_ID) {
        // different game versions can't play together — tell both sides to refresh
        net.send({ t: 'bye', reason: `Your game version doesn't match the host's. ${REFRESH_MSG}` });
        setTimeout(() => net.dropGuest(), 300);
        this.toast(`A friend tried to join with a different game version. ${REFRESH_MSG}`, 'bad');
        this.chat.add('', `⚠️ A friend tried to join with a different game version — both of you press Ctrl+F5 to refresh.`, '', true);
        return;
      }
      const name = String(m.name || 'Friend').slice(0, 14);
      let saved = this.guestSaves[name] || {};
      if (saved.orb !== undefined) saved = { inv: saved, party: [] }; // old save format
      const inv = { ...newInventory(), ...(saved.inv || {}) };
      const actor = {
        id: 'guest', name, inventory: inv, party: saved.party || [], eggs: saved.eggs || [],
        held: () => HOTBAR[this.remote?.item]?.id,
        give: (item, n, quiet) => { inv[item] = (inv[item] || 0) + n; net.send({ t: 'give', item, n, quiet: !!quiet, inv }); },
        toast: (msg, kind) => net.send({ t: 'toast', msg, kind }),
      };
      this.guestActor = actor;
      this._spawnRemote({ name, color: m.color });
      net.send({
        t: 'welcome', v: BUILD_ID, host: { name: this.profile.name, color: this.profile.color },
        time: this.world.sky.time, unlocked: [...this.unlocked], landmarks: [...this.landmarks],
        nodes: this.world.resources.flags(), inv, party: actor.party, pr: this.projectiles.snapshot(),
        cr: this.creatures.snapshot(), dex: { seen: [...this.dex.seen], caught: [...this.dex.caught] },
        ranch: this._ranchMsg(),
      });
      this.battles.changed();
      this.updateRating(true);
      net.send({ t: 'rating', r: this.rating });
      this.chat.add('', `🤠 ${name} joined the ranch!`, '', true);
      this.toast(`${name} joined the ranch!`, 'good');
      this.audio.play('chime');
      this.hud.setPlayers(2);
    });
    net.on('p', (m) => { if (this.remote) this._applyPose(this.remote, m.p); });
    net.on('use', (m) => {
      const def = this.interactions.byId.get(m.id);
      if (def?.use && this.guestActor && this._guestNear(def)) def.use(this.guestActor, m.mode);
    });
    net.on('build', (m) => { if (this.guestActor) this.buildings.place(this.guestActor, m.type, m.x, m.z, m.rot, m.color || null); });
    net.on('demolish', (m) => { if (this.guestActor) this.buildings.demolish(this.guestActor, m.id, !!m.full); });
    net.on('sign', (m) => { if (this.guestActor) this.buildings.setText(this.guestActor, m.id, m.text); });
    net.on('rmove', (m) => { if (this.guestActor) this._ranchMove(this.guestActor, m.uid, m.act); });
    net.on('shop', (m) => { if (this.guestActor) this._shop(this.guestActor, m.op, m.id, m.n); });
    net.on('petc', () => { if (this.guestActor) this._petLead(this.guestActor); });
    net.on('duel', () => { if (this.guestActor) this._duelRequest(this.guestActor); });
    net.on('duelAns', (m) => { if (this.guestActor) this._duelAnswer(this.guestActor, !!m.ok); });
    net.on('duelAsk', (m) => this.duelPrompt.show(m.from));
    net.on('board', (m) => { if (this.guestActor) this._board(this.guestActor, m.op, m.i); });
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
      if (m.rc) this.ranchSim.applySnapshot(m.rc);
    });
    net.on('ranch', (m) => this._applyRanchMsg(m.r));
    net.on('remote', (m) => this.ranchSim.showEmote(m.id, m.s, m.d));
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
    net.on('rating', (m) => { this.rating = m.r; this.hud.setRating(this.rating); if (this.panel.open) this.panel.render(); });
    net.on('party', (m) => { this.party = m.party; this.ranchCount = m.ranch; this.eggs = m.eggs || []; this._partyUpdated(); });
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
      if (!this.guestActor) return; // e.g. a rejected join attempt
      if (this.guestActor) {
        this.battles.run(this.guestActor);
        this.guestSaves[this.guestActor.name] = { inv: this.guestActor.inventory, party: this.guestActor.party, eggs: this.guestActor.eggs };
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
      if (this.state === 'menu') { this._joinReject?.(reason || 'Connection closed.'); return; }
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
    this._remoteDef = this.interactions.add({
      id: 'player', root: this.remote.root, name: `${profile.name} (rancher)`, range: 30, color: profile.color,
      sub: () => (this.items.current.kind === 'partner' ? 'Click: challenge to a friendly battle ⚔️' : 'Hold Partner (6) and click to challenge to a friendly battle'),
    });
  }

  _removeRemote() {
    if (this._remoteDef) { this.interactions.remove(this._remoteDef); this._remoteDef = null; }
    this.friendComp.clear();
    if (this.remote) { this.remote.dispose(); this.remote = null; }
  }

  _pose() {
    const p = this.player;
    return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), this.items.index, this.items.swings || 0, this.companion.state()];
  }

  _applyPose(r, a) {
    if (!a) return;
    this.friendComp.apply(a[7] || null);
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
      this._joinReject = (msg) => { clearTimeout(timeout); this._joinReject = null; reject(new Error(msg)); };
      this.net.on('welcome', (m) => {
        clearTimeout(timeout);
        this._joinReject = null;
        if (m.v !== BUILD_ID) {
          this.net.leave();
          reject(new Error(`The host is running a different game version. ${REFRESH_MSG}`));
          return;
        }
        this._startGuest(m, profile);
        resolve();
      });
      this.net.join(code).then(() => {
        this.net.send({ t: 'hello', v: BUILD_ID, name: profile.name, color: profile.color });
      }).catch((e) => { clearTimeout(timeout); this._joinReject = null; reject(e); });
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
    this.ranchSim.clear();
    this.ranchSim.authority = false;
    this._applyRanchMsg(m.ranch);
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

  // --- ranch: buildings, ranch creatures, barn --------------------------------------------

  /** Host: an actor's inventory changed by a ranch action. */
  inventoryChanged(actor) {
    if (actor?.id === 'guest') this.net.send({ t: 'inv', inv: actor.inventory });
    else { this.hud.refreshCounts(); if (this.panel.open) this.panel.render(); if (this.buildMode.active) this.buildMode.render(); if (this.shop.open) this.shop.render(); if (this.board.open) this.board.render(); }
  }

  /** Host: buildings / ranch members / drops / messes changed. */
  ranchChanged() { this._ranchDirty = true; }

  _ranchMsg() {
    return {
      b: this.buildings.serialize(), st: this.ranchSim.state(), cap: this.ranchCapacity(),
      list: this.ranch.map((c) => ({ uid: c.uid, species: c.species, level: c.level, shiny: c.shiny, nickname: c.nickname, happiness: Math.round(c.happiness ?? 70), role: c.role || null, xp: c.xp })),
      up: this.upgrades, req: this.requests, gc: [...this.guardiansCalmed], stats: this.stats, unlocked: [...this.unlocked],
    };
  }

  _applyRanchMsg(r) {
    if (!r) return;
    this.buildings.apply(r.b || []);
    this.ranchSim.applyState(r.st || {});
    this.ranchSummary = r.list || [];
    this.guestCap = r.cap;
    this.upgrades = r.up || {};
    this.requests = r.req || [];
    this.guardiansCalmed = new Set(r.gc || []);
    if (r.stats) this.stats = r.stats;
    for (const id of r.unlocked || []) if (!this.unlocked.has(id)) { this.unlocked.add(id); this.world.setUnlocked(id, true); }
    if (this.barn.open) this.barn.render();
    if (this.shop.open) this.shop.render();
    if (this.board.open) this.board.render();
  }

  ranchList() { return this.isGuest ? (this.ranchSummary || []) : this.ranch; }
  ranchCapacity() { return this.isGuest ? (this.guestCap || 6) : this.ranchSim.capacity; }

  _flushRanch() {
    if (!this._ranchDirty) return;
    this._ranchDirty = false;
    this.ranchSim.syncCreatures();
    this.ranchSim._applyObjects();
    this.ensureRequests();
    if (this.net.connected) this.net.send({ t: 'ranch', r: this._ranchMsg() });
    if (this.barn.open) this.barn.render();
    if (this.shop.open) this.shop.render();
    if (this.board.open) this.board.render();
    this.updateRating();
    this._saveSoon = 3;
  }

  openBarn() {
    this.barn.toggle(true);
    this.audio.play('open');
    this.input.exitLock();
  }

  closeBarn() {
    this.barn.toggle(false);
    this.input.requestLock();
  }

  _ranchMove(actor, uid, act) {
    if (this.battles.battleOf(actor.id)) { actor.toast('Finish your battle first!', 'muted'); return; }
    if (act === 'breed' || act === 'train' || act === 'free') {
      const c = this.ranch.find((x) => x.uid === uid);
      if (!c) return;
      if (act === 'free') { c.role = null; actor.toast(`${this.creatureName(c)} is back to normal ranch life`, 'muted'); }
      else if (act === 'breed') {
        if (!this.buildings.first('breeder')) { actor.toast('Build a Breeding Pen first (B).', 'muted'); return; }
        if (this.ranchSim.breeders().length >= 2) { actor.toast('The Breeding Pen already has two creatures.', 'muted'); return; }
        c.role = 'breed'; actor.toast(`${this.creatureName(c)} moved into the Breeding Pen 💞`, 'good');
      } else {
        if (!this.buildings.first('trainyard')) { actor.toast('Build a Training Yard first (B).', 'muted'); return; }
        if (this.ranchSim.trainees().length >= 4) { actor.toast('The Training Yard is full (4).', 'muted'); return; }
        c.role = 'train'; actor.toast(`${this.creatureName(c)} started training 💪`, 'good');
      }
      // roles need a visible spot on the ranch: move it to the front of the list
      const i = this.ranch.indexOf(c);
      if (c.role && i >= this.ranchSim.capacity) { this.ranch.splice(i, 1); this.ranch.unshift(c); }
      this.ranchChanged();
      return;
    }
    if (act === 'toRanch') {
      if (actor.party.length <= 1) { actor.toast('Keep at least one partner with you.', 'muted'); return; }
      const i = actor.party.findIndex((c) => c.uid === uid);
      if (i < 0) return;
      const [c] = actor.party.splice(i, 1);
      this.ranch.push(c);
      actor.toast(`${this.creatureName(c)} moved to the ranch 🏡`, 'good');
    } else {
      if (actor.party.length >= 6) { actor.toast('Your party is full (6).', 'muted'); return; }
      const i = this.ranch.findIndex((c) => c.uid === uid);
      if (i < 0) return;
      const [c] = this.ranch.splice(i, 1);
      c.role = null;
      actor.party.push(c);
      actor.toast(`${this.creatureName(c)} joined your party 🐾`, 'good');
    }
    this.partyChanged(actor);
    this.ranchChanged();
  }

  requestRanchMove(uid, act) {
    if (this.isGuest) this.net.send({ t: 'rmove', uid, act });
    else this._ranchMove(this.local, uid, act);
  }

  requestBuild(type, x, z, rot, color = null) {
    if (this.isGuest) this.net.send({ t: 'build', type, x, z, rot, color });
    else this.buildings.place(this.local, type, x, z, rot, color);
  }

  requestDemolish(id, full = false) {
    if (this.isGuest) this.net.send({ t: 'demolish', id, full });
    else this.buildings.demolish(this.local, id, full);
  }

  /** Open the little text box to write on a signpost. */
  editSign(id, current) {
    if (!this._signEl) {
      const el = document.createElement('div');
      el.className = 'sign-edit hidden';
      el.innerHTML = '<div class="sign-title">🪧 What should the sign say?</div><input maxlength="28"><div class="hint">Enter to save · Esc to cancel</div>';
      this.uiRoot.appendChild(el);
      const input = el.querySelector('input');
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { this._closeSign(true); ev.preventDefault(); }
        else if (ev.key === 'Escape') { this._closeSign(false); ev.preventDefault(); }
      });
      this._signEl = el;
    }
    this._signId = id;
    const input = this._signEl.querySelector('input');
    input.value = current || '';
    this._signEl.classList.remove('hidden');
    this.input.typing = true;
    this.input.keys.clear();
    this.input.exitLock();
    setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  _closeSign(save) {
    const el = this._signEl;
    el.classList.add('hidden');
    this.input.typing = false;
    if (save) {
      const text = el.querySelector('input').value.trim();
      if (this.isGuest) this.net.send({ t: 'sign', id: this._signId, text });
      else this.buildings.setText(this.local, this._signId, text);
    }
    this.input.requestLock();
  }

  // --- companion (partner walking with you) & friendly battles --------------------------------

  toggleCompanion(force) {
    const lead = this.party[0];
    if (!lead) { this.toast('You need a partner first!', 'muted'); return; }
    if (this.inBattle) return;
    this.companionOut = force ?? !this.companionOut;
    localStorage.setItem('mr-companion', this.companionOut ? '1' : '0');
    const near = this.player.pos.clone().add(new THREE.Vector3(Math.cos(this.player.yaw) * 1.4, 0, -Math.sin(this.player.yaw) * 1.4));
    this.companion.setCreature(lead.species, lead.shiny);
    this.companion.show(this.companionOut, near);
    this.audio.play(this.companionOut ? 'chime' : 'ui');
    this.toast(this.companionOut ? `${this.creatureName(lead)} is walking with you! (F or 6+click to call back)` : `${this.creatureName(lead)} came back.`, 'good');
    if (this.companionOut) this.companion.say('♥', 1.6);
  }

  petCompanion() {
    const now = performance.now();
    if (now - (this._petCompAt || 0) < 15000) { this.toast(`${this.creatureName(this.party[0])} is still happy from the last pets ♥`, 'muted'); return; }
    this._petCompAt = now;
    this.companion.say('♥', 1.8);
    this.companion.excited = 2;
    this.fx.sparkle(this.companion.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff8fb8, 14);
    this.audio.play('chime');
    if (this.isGuest) this.net.send({ t: 'petc' });
    else this._petLead(this.local);
  }

  /** Host: petting your walking partner makes it a bit happier. */
  _petLead(actor) {
    const c = actor.party[0];
    if (!c) return;
    c.happiness = Math.min(100, (c.happiness ?? 70) + 3);
    actor.toast(`${this.creatureName(c)} loves you! (♥ ${Math.round(c.happiness)})`, 'good');
    if (SPECIES_BY_ID[c.species].evolve?.happiness) this.queueEvolution(c, actor);
    this.partyChanged(actor);
  }

  challengeFriend() {
    if (!this.remote) { this.toast('Your friend isn\'t here.', 'muted'); return; }
    if (!this.party.some((c) => c.hp > 0)) { this.toast('Your creatures need rest first (Farmhouse).', 'muted'); return; }
    if (this.isGuest) this.net.send({ t: 'duel' });
    else this._duelRequest(this.local);
  }

  /** Host: someone challenged the other rancher. */
  _duelRequest(from) {
    const to = from === this.local ? this.guestActor : this.local;
    if (!to) return;
    if (this.pendingDuel) { from.toast('A challenge is already waiting for an answer.', 'muted'); return; }
    const pa = this.battles.posOf(from.id), pb = this.battles.posOf(to.id);
    if (pa && pb && pa.distanceTo(pb) > 30) { from.toast('Get closer to your friend (within 30 m) to challenge them.', 'muted'); return; }
    this.pendingDuel = { from, to, t: 22 };
    from.toast(`Challenge sent to ${to.name}… ⚔️`, 'good');
    if (to === this.local) this.duelPrompt.show(from.name);
    else this.net.send({ t: 'duelAsk', from: from.name });
  }

  /** Called by the prompt (my answer to a challenge). */
  answerDuel(ok) {
    if (this.isGuest) this.net.send({ t: 'duelAns', ok });
    else this._duelAnswer(this.local, ok);
    if (ok) this.input.requestLock();
  }

  _duelAnswer(actor, ok) {
    const d = this.pendingDuel;
    if (!d || d.to !== actor) return;
    this.pendingDuel = null;
    if (!ok) { d.from.toast(`${actor.name} declined the battle.`, 'muted'); return; }
    if (this.companionOut) this.companion.show(false);
    this.battles.startPvp(d.from, d.to);
  }

  // --- shop, notice board, upgrades, guardians ----------------------------------------------

  get shopOpen() { return this.shop.open || this.board.open; }

  openModal(which) {
    const m = which === 'shop' ? this.shop : this.board;
    m.toggle(true);
    this.audio.play('open');
    this.input.exitLock();
  }

  closeModals() {
    this.shop.toggle(false);
    this.board.toggle(false);
    this.input.requestLock();
  }

  troughMax() { return this.upgrades.trough ? 20 : 10; }
  eggCap() { return this.upgrades.satchel ? 6 : 3; }

  requestShop(op, id, n) {
    if (this.isGuest) this.net.send({ t: 'shop', op, id, n });
    else this._shop(this.local, op, id, n);
  }

  _shop(actor, op, id, n) {
    const inv = actor.inventory;
    const pay = (price) => {
      if (inv.coins < price) { actor.toast(`Not enough coins (need 🪙 ${price}).`, 'bad'); return false; }
      inv.coins -= price; return true;
    };
    if (op === 'buy') {
      const s = SUPPLIES.find((x) => x.id === id);
      if (!s || !pay(s.price)) return;
      inv[s.item] = (inv[s.item] || 0) + s.n;
      actor.toast(`Bought ${s.label}!`, 'good');
    } else if (op === 'upgrade') {
      const u = UPGRADES[id];
      const lvl = this.upgrades[id] || 0;
      if (!u || lvl >= u.max || !pay(u.price[lvl])) return;
      this.upgrades[id] = lvl + 1;
      this.sharedBanner(`${u.icon} ${u.name}${u.max > 1 ? ` Lv ${lvl + 1}` : ''}!`, `${actor.name} upgraded the ranch: ${u.desc}`, '#ffd166', 'chime');
      this.ranchChanged();
    } else if (op === 'zone') {
      const price = ZONE_PASSES[id];
      if (!price || this.unlocked.has(id) || !pay(price)) return;
      this.unlocked.add(id);
      this.world.setUnlocked(id, true);
      this.worldEvent({ t: 'unlock', id });
      this.sharedBanner(`${zoneTitle(id)} is open!`, `${actor.name} bought a Zone Pass — go explore!`, ZONES[id].color, 'zone');
      this.ranchChanged();
    } else if (op === 'sell') {
      const it = ITEMS[id];
      const have = inv[id] || 0;
      const k = Math.min(have, n || 1);
      if (!it?.sell || !k) return;
      inv[id] -= k; inv.coins += k * it.sell;
      actor.toast(`Sold ${k} ${it.name} for 🪙 ${k * it.sell}`, 'good');
    } else if (op === 'sellAll') {
      this.sellAll(actor);
    }
    if (actor === this.local) this.audio.play('coin');
    this.inventoryChanged(actor);
    this.ranchChanged();
  }

  /** Host: keep three requests on the board. */
  ensureRequests() {
    while (this.requests.length < 3) this.requests.push(makeRequest(this.rating.level));
  }

  requestBoard(op, i) {
    if (this.isGuest) this.net.send({ t: 'board', op, i });
    else this._board(this.local, op, i);
  }

  _board(actor, op, i) {
    const r = this.requests[i];
    if (!r) return;
    const inv = actor.inventory;
    if (op === 'reroll') {
      if (inv.coins < 5) { actor.toast('Swapping a request costs 🪙 5.', 'bad'); return; }
      inv.coins -= 5;
      this.requests[i] = makeRequest(this.rating.level);
      this.inventoryChanged(actor);
      this.ranchChanged();
      return;
    }
    // deliver
    if (r.kind === 'bring') {
      if ((inv[r.item] || 0) < r.n) { actor.toast(`You need ${r.n} ${ITEMS[r.item].name} (you have ${inv[r.item] || 0}).`, 'bad'); return; }
      inv[r.item] -= r.n;
    } else if (r.kind === 'show') {
      const ok = actor.party.some((c) => SPECIES_BY_ID[c.species].type === r.type && c.level >= r.level);
      if (!ok) { actor.toast(`None of your party is a ${TYPES[r.type].name}-type at Lv ${r.level}+. (Swap creatures at the Barn.)`, 'bad'); return; }
    } else if (r.kind === 'species') {
      if (!actor.party.some((c) => c.species === r.species)) { actor.toast(`Bring a ${SPECIES_BY_ID[r.species].name} in your party.`, 'bad'); return; }
    }
    inv.coins += r.reward;
    this.stats.requests = (this.stats.requests || 0) + 1;
    this.requests[i] = makeRequest(this.rating.level);
    this.sharedBanner('📋 Request complete!', `${actor.name} helped ${r.who} — 🪙 ${r.reward}`, '#06d6a0', 'coin');
    this.inventoryChanged(actor);
    this.ranchChanged();
    this.updateRating();
  }

  /** Host: a zone guardian was calmed in battle. */
  guardianCalmed(c, actors) {
    const zone = c.guardian;
    c.calmed = true;
    if (this.guardiansCalmed.has(zone)) return;
    this.guardiansCalmed.add(zone);
    this.markCaught(c.sp.id);
    const reward = 100 + GUARDIANS[zone].level * 10;
    for (const a of actors) { a.inventory.coins += reward; a.give('orb', 5); this.inventoryChanged(a); }
    this.sharedBanner(`🌟 ${c.sp.name} is at peace!`, `The guardian of ${ZONES[zone].name} thanks you (+15 rating, 🪙 ${reward} and 5 Bond Orbs each)`, ZONES[zone].color, 'chime');
    this.worldFx('sparkle', c.center.clone(), 0xffe066);
    if (this.guardiansCalmed.size === 4) {
      setTimeout(() => this.sharedBanner('🏆 All four guardians are calm!', 'The whole land is at peace. Your ranch is legendary!', '#ffd166', 'chime'), 4500);
    }
    this.updateRating();
    this.ranchChanged();
    this.save();
  }

  // --- evolution ---------------------------------------------------------------------------

  /** Host: check this creature for evolution soon (not mid-battle). actor may be null. */
  queueEvolution(inst, actor) {
    if (!this.pendingEvo.some((p) => p.inst === inst)) this.pendingEvo.push({ inst, actor });
  }

  _ownerOf(inst) {
    if (this.party.includes(inst)) return this.local;
    if (this.guestActor?.party.includes(inst)) return this.guestActor;
    return null;
  }

  _processEvolutions() {
    if (!this.pendingEvo.length) return;
    const busy = new Set();
    for (const b of this.battles.battles.values()) for (const a of b.allies) busy.add(a.inst);
    this.pendingEvo = this.pendingEvo.filter(({ inst, actor }) => {
      if (busy.has(inst)) return true;
      this._tryEvolve(inst, actor || this._ownerOf(inst));
      return false;
    });
  }

  _tryEvolve(inst, actor) {
    const sp = SPECIES_BY_ID[inst.species];
    const ev = sp.evolve;
    if (!ev) return;
    if (ev.level && inst.level < ev.level) return;
    if (ev.happiness && (inst.happiness ?? 0) < ev.happiness) return;
    const to = SPECIES_BY_ID[ev.to];
    const lost = inst.stats.hp - inst.hp;
    inst.species = to.id;
    inst.stats = calcStats(to, inst.level);
    inst.hp = Math.max(1, inst.stats.hp - lost);
    // keep any inherited move in the last slot, learn the rest of the new form's moves
    const inherited = inst.moves[3] && !sp.moves.includes(inst.moves[3]) ? inst.moves[3] : null;
    inst.moves = [...to.moves];
    if (inherited && !inst.moves.includes(inherited)) inst.moves[3] = inherited;
    this.markCaught(to.id);
    this.sharedBanner(`✨ ${sp.name} evolved into ${to.name}!`, actor ? `${actor.name}'s partner looks bigger and cooler!` : 'Your ranch creature looks bigger and cooler!', TYPES[to.type].color, 'chime');
    const where = actor === this.guestActor && this.remote ? this.remote.target : this.player.pos;
    this.worldFx('sparkle', where.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffe066);
    if (actor) this.partyChanged(actor);
    this.ranchChanged();
  }

  // --- ranch rating ----------------------------------------------------------------------

  /** Host: recount rating points; level-ups unlock zones for everyone. silent = no banners. */
  updateRating(silent = false) {
    if (this.isGuest) return;
    let creatures = this.party.length + this.ranch.length;
    if (this.guestActor) creatures += this.guestActor.party.length;
    for (const [name, s] of Object.entries(this.guestSaves)) {
      if (this.guestActor && name === this.guestActor.name) continue;
      creatures += s?.party?.length || 0;
    }
    const { points, breakdown } = ratingPoints({
      seen: this.dex.seen.size, caught: this.dex.caught.size, creatures, landmarks: this.landmarks.size, wins: this.stats.wins,
      buildings: this.buildings.map.size, happy: this.ranchSim.happyCount(),
      requests: this.stats.requests || 0, guardians: this.guardiansCalmed.size,
    });
    const before = this.rating.level;
    const info = ratingInfo(points);
    const changed = info.points !== this.rating.points || info.level !== before;
    this.rating = { ...info, breakdown };
    this.hud.setRating(this.rating);
    if (!changed) return;
    if (this.net.connected) this.net.send({ t: 'rating', r: this.rating });
    if (this.panel.open) this.panel.render();
    if (info.level > before && !silent) {
      this.sharedBanner(`⭐ Ranch Rating ${info.level}!`, 'Your ranch is becoming famous', '#ffd166', 'chime');
      this.worldFx('sparkle', this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xffd166);
      if (info.next === null && !this.dex.caught.has('solstara')) {
        setTimeout(() => this.sharedBanner('✨ A legendary visitor has arrived!', 'Solstara was spotted near the Sunstone Spire in Breezy Meadow — befriend it together!', '#ff9e00', 'chime'), 4200);
      }
    }
    this._unlockForRating(silent);
  }

  _unlockForRating(silent) {
    const opened = [];
    for (const id of WILD_ZONES) {
      if (this.unlocked.has(id) || ZONES[id].rating > this.rating.level) continue;
      this.unlocked.add(id);
      this.world.setUnlocked(id, true);
      this.worldEvent({ t: 'unlock', id });
      opened.push(id);
    }
    if (!opened.length || silent) return;
    setTimeout(() => {
      for (const id of opened) this.sharedBanner(`${zoneTitle(id)} is open!`, 'The barrier at the gate has faded — go explore!', ZONES[id].color, 'zone');
    }, 3600);
    this.save();
  }

  onBattleWon() {
    this.stats.wins++;
    this.updateRating();
  }

  // --- party, starters & battles ------------------------------------------------------

  _giveStarter(actor, id) {
    if (!STARTERS.includes(id)) return;
    const c = createCreature(id, 5, { personality: 'playful' });
    actor.party.push(c);
    this.updateRating();
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
    let where = 'ranch';
    if (actor.party.length < 6) { actor.party.push(inst); where = 'party'; } else this.ranch.push(inst);
    this.partyChanged(actor);
    this.updateRating();
    return where;
  }

  markCaught(id) {
    this.markSeen(id, false);
    if (this.dex.caught.has(id)) return;
    this.dex.caught.add(id);
    if (this.net.role === 'host' && this.net.connected) this.net.send({ t: 'dex', caught: [id] });
    if (this.panel.open) this.panel.render();
    this.updateRating();
  }

  /** Host: an actor's party changed — refresh my UI or tell the guest. */
  partyChanged(actor) {
    if (actor?.id === 'guest') this.net.send({ t: 'party', party: actor.party, ranch: this.ranch.length, eggs: actor.eggs || [] });
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

  /** Battle menu: lob a Bond Orb at the (weakest) wild foe. It's a real throw that still has to hit. */
  throwOrbInBattle() {
    const b = this.myBattle;
    if (!b || b.pvp) return;
    if (!(this.inventory.orb > 0)) { this.toast('You\'re out of Bond Orbs! Buy more at the Ranch Shop.', 'muted'); return; }
    const now = performance.now();
    if (now - (this._battleThrowAt || 0) < 1500) return;
    const foes = b.foes.filter((f) => f.hp > 0).sort((x, y) => x.hp / x.max - y.hp / y.max);
    const c = foes[0] && this.creatures.list.get(foes[0].nid);
    if (!c || c.captured) return;
    this._battleThrowAt = now;
    const origin = new THREE.Vector3(0.25, -0.15, -0.6).applyMatrix4(this.camera.matrixWorld);
    const base = this.isGuest ? c.netTarget : c.pos;
    const target = new THREE.Vector3(base.x, base.y + c.view.height * 0.5, base.z);
    const flat = target.clone().sub(origin);
    const T = Math.max(0.35, Math.hypot(flat.x, flat.z) / 14);
    const vel = new THREE.Vector3(flat.x / T, (flat.y + 0.5 * 22 * T * T) / T, flat.z / T);
    this.items.select(0);
    this.items.swingLen = this.items.swing = 0.35;
    this.items.swings = (this.items.swings || 0) + 1;
    this.requestThrow('orb', origin, vel);
    this.toast(`🔵 You throw a Bond Orb at ${c.sp.name}!`, 'good');
    if (!this.input.locked) this.input.requestLock();
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
    this.updateRating();
  }

  sendChat(text) {
    this.chat.add(this.profile.name, text, this.profile.color);
    if (this.net.connected) this.net.send({ t: 'chat', text });
  }

  // --- requests (routed to the host when we're a guest) -------------------------------

  requestUse(def, mode) {
    if (def?.localUse) { def.localUse(); return; } // purely local UI (e.g. the barn)
    if (!def?.use && !this.isGuest) return;
    if (this.isGuest) { if (def.id) this.net.send({ t: 'use', id: def.id, mode }); return; }
    def.use(this.local, mode);
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
    this.minimap.show(true);
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
    this.eggs = d?.eggs || [];
    this.pendingEvo = [];
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
    this.stats = { wins: 0, requests: 0, ...(d?.stats || {}) };
    this.upgrades = d?.upgrades || {};
    this.requests = d?.requests || [];
    this.guardiansCalmed = new Set(d?.guardians || []);
    this.buildings.apply(d?.buildings || []);
    this.ranchSim.clear();
    this.ranchSim.authority = true;
    const st = d?.ranchState || {};
    this.ranchSim.applyState(st);
    this.ranchSim.nextObj = 1 + Math.max(0, ...(st.d || []).map((o) => o.id), ...(st.m || []).map((o) => o.id));
    this._ranchDirty = true;
    this._flushRanch();
    this.rating = { level: 0, points: 0, breakdown: [] };
    this.updateRating(true);
  }

  serialize() {
    const guests = { ...this.guestSaves };
    if (this.guestActor) guests[this.guestActor.name] = { inv: this.guestActor.inventory, party: this.guestActor.party, eggs: this.guestActor.eggs };
    return {
      profile: this.profile,
      inventory: this.inventory,
      party: this.party,
      eggs: this.eggs,
      ranch: this.ranch,
      guests,
      unlocked: [...this.unlocked],
      landmarks: [...this.landmarks],
      stats: this.stats,
      upgrades: this.upgrades,
      requests: this.requests,
      guardians: [...this.guardiansCalmed],
      buildings: this.buildings.serialize(),
      ranchState: this.ranchSim.state(),
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
    this.buildMode.toggle(false);
    this.minimap.show(false);
    this.companion.clear();
    this.pendingDuel = null;
    this.duelPrompt.open = false; this.duelPrompt.el.classList.add('hidden');
    this.barn.toggle(false);
    this.shop.toggle(false);
    this.board.toggle(false);
    this.ranchSim.clear();
    this.ranchSim.authority = true;
    this.buildings.apply([]);
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

  get menuOpen() {
    return this.panel.open || this.chat.open || this.starter.open || this.barn.open || this.shopOpen || this.duelPrompt.open
      || (this._signEl && !this._signEl.classList.contains('hidden')) || this.state !== 'playing';
  }

  _onLock(locked, expected) {
    if (locked) { this.pause.show(false); this.battleCursor = false; this.hud.setClickHint(false); return; }
    if (expected || this.battleCursor) return; // we released it on purpose (menu / battle move picking)
    if (this.state === 'playing' && !this.panel.open && !this.chat.open && !this.starter.open && !this.barn.open && !this.shopOpen) {
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

  /** Farmhouse: rest any time to heal your party. At night it also sleeps until morning. */
  sleep(actor = this.local) {
    if (this.battles.battleOf(actor.id)) { actor.toast('Finish your battle first!', 'muted'); return; }
    const party = actor.party || [];
    const hurt = party.filter((c) => c.hp < c.stats.hp).length;
    for (const c of party) { c.hp = c.stats.hp; c.happiness = Math.min(100, (c.happiness ?? 70) + 2); }
    this.partyChanged(actor);
    const names = party.map((c) => this.creatureName(c)).join(', ');
    const title = '💖 Your creatures are fully healed!';
    const sub = party.length ? `${names} ${party.length === 1 ? 'is' : 'are'} rested and ready${hurt ? '' : ' (they were already healthy)'}` : 'Rest up — choose a partner to start adventuring';
    // tell just the rancher who rested
    if (actor === this.local) {
      this.hud.banner(title, sub, '#ff8fb8');
      this.audio.play('chime');
      this.fx.sparkle(this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xff8fb8, 24);
    } else {
      this.net.send({ t: 'banner', title, sub, color: '#ff8fb8', snd: 'chime' });
    }
    actor.toast(`💖 Healed ${party.length} creature${party.length === 1 ? '' : 's'} at the Farmhouse`, 'good');
    const t = this.world.sky.time;
    if (t > 0.75 || t < 0.22) {
      setTimeout(() => {
        this.world.sky.time = 0.27;
        this.sharedBanner('☀️ Good morning!', `${actor.name} slept until sunrise`, '#ffd166', null);
      }, 2800);
    }
    this.save();
  }

  touchLandmark(id, msg, actor = this.local, pos, repeatMsg = 'You\'ve already discovered this place.') {
    if (!this.landmarks.has(id)) {
      this.landmarks.add(id);
      this.worldEvent({ t: 'landmark', id });
      this.sharedBanner('Landmark discovered! (+5 rating)', msg, '#ffe066', 'chime');
      this.worldFx('sparkle', pos || this.player.pos.clone(), 0xffe066);
      this.updateRating();
      this.save();
    } else {
      actor.toast(repeatMsg);
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
      else if (input.pressedAny('Escape')) this.closePanel();
    } else if (this.state === 'playing' && input.wasPressed('Tab')) {
      this.openPanel();
    }

    // the world keeps running while paused when someone else is in it
    const active = this.state === 'playing' && input.locked && !this.panel.open && !this.chat.open;
    if (this.state !== 'paused' || this.net.connected) {
      this.world.sky.time = (this.world.sky.time + dt / DAY_SECONDS) % 1;
    }
    this.player.update(dt, input, !active);
    this.items.update(dt, input, this.player, active && !this.buildMode.active);
    if (this.isGuest) this.projectiles.updateProxies(dt);
    else this.projectiles.update(dt);
    this.remote?.update(dt);
    this.creatures.update(dt);
    if (this.isAuthority) { this.battles.update(dt); this.catching.update(dt); this._regen(dt); }
    this.battleView.update(dt);
    const myBattle = this.myBattle;
    // partner walking with you (hidden while it's out battling)
    const lead = this.party[0];
    this.companion.setCreature(lead?.species, lead?.shiny);
    const wantComp = this.companionOut && !!lead && !myBattle;
    if (wantComp !== this.companion.visible) this.companion.show(wantComp, this.player.pos.clone().add(new THREE.Vector3(1.4, 0, 1.4)));
    this.companion.follow(dt, this.player);
    this.friendComp.updateRemote(dt);
    if (active && input.wasPressed('KeyF')) this.toggleCompanion();
    // friendly-battle challenges
    this.duelPrompt.update(dt, input);
    if (this.pendingDuel) { this.pendingDuel.t -= dt; if (this.pendingDuel.t <= 0) { this.pendingDuel.from.toast('No answer to your challenge.', 'muted'); this.pendingDuel = null; } }
    // When it's my turn to pick a move, free the mouse so the move buttons can be clicked.
    const meAlly = myBattle?.allies.find((a) => a.owner === this.myId && a.hp > 0);
    const myTurn = !!(myBattle && myBattle.phase === 'choose' && meAlly && !meAlly.chose);
    if (myTurn && this.state === 'playing' && input.locked && !this.panel.open && !this.chat.open) {
      const key = myBattle.id + ':' + myBattle.turn;
      if (this._cursorTurn !== key) { this._cursorTurn = key; this.battleCursor = true; input.exitLock(); }
    }
    this.battleHUD.update(myBattle, this.myId);
    const canPick = this.state === 'playing' && !this.panel.open && !this.chat.open && (active || this.battleCursor);
    if (myBattle && canPick) {
      for (let i = 0; i < 4; i++) if (input.pressedAny('Digit' + (i + 1))) { this.requestMove(i); if (!input.locked) input.requestLock(); }
      if (input.pressedAny('KeyR')) { this.requestRun(); if (!input.locked) input.requestLock(); }
      if (input.pressedAny('KeyC')) this.throwOrbInBattle();
    }
    // battle ended while the cursor was free: grab the mouse back automatically
    if (!myBattle && this.battleCursor && !input.locked && !input.lockPending) {
      this.battleCursor = false;
      if (this.state === 'playing') input.requestLock();
    }
    if (input.locked || this.menuOpen || this.battleCursor) this.hud.setClickHint(false);
    // mouse not captured but nothing needs it: recapture on any key press (a keypress counts as a click for the browser)
    if (this.state === 'playing' && !input.locked && !input.lockPending && !this.menuOpen && !this.battleCursor) {
      if (input.pressed.size && !input.pressedAny('Escape')) input.requestLock();
    }
    this.ranchSim.update(dt);
    this.buildings.update(this.world.sky.night, dt);
    if (this.isAuthority) {
      this._processEvolutions();
      this._flushRanch();
      if (this._saveSoon > 0) { this._saveSoon -= dt; if (this._saveSoon <= 0) this.save(); }
    }
    // build mode (B) on the ranch, world map (M)
    if (active && input.wasPressed('KeyB')) this.buildMode.toggle();
    if (this.state === 'playing' && !this.chat.open && input.pressedAny('KeyM')) { this.minimap.toggleFull(); this.audio.play('ui'); }
    this.minimap.update(dt);
    this.buildMode.update(dt, input);
    this.fx.update(dt);
    this.world.update(dt, this.camera.position);

    // look-at + interact (tap E = use, hold E on creatures = pet)
    const barnWasOpen = this.barn.open;
    const modalWasOpen = this.shopOpen;
    const target = active ? this.interactions.update() : null;
    const inRange = this.interactions.inUseRange(target);
    this.hud.setLook(target, target ? this.interactions.subtitle(target) : '');
    if (active && target && inRange && target.holdable) {
      if (input.wasPressed('KeyE')) this._hold = { def: target, t: 0 };
      if (this._hold && this._hold.def === target && input.isDown('KeyE')) {
        this._hold.t += dt;
        if (this._hold.t >= 1) { this.requestUse(target, 'pet'); this._hold = null; }
      } else if (this._hold) {
        if (this._hold.def === target && this._hold.t < 0.45) this.requestUse(target);
        this._hold = null;
      }
    } else {
      this._hold = null;
      if (active && target && inRange && input.wasPressed('KeyE')) this.requestUse(target);
    }
    this.hud.setHold(this._hold ? Math.min(1, this._hold.t) : 0);
    if (barnWasOpen && this.barn.open && (input.pressedAny('Escape') || input.pressedAny('KeyE') || input.pressedAny('Tab'))) this.closeBarn();
    if (modalWasOpen && this.shopOpen && (input.pressedAny('Escape') || input.pressedAny('KeyE') || input.pressedAny('Tab'))) this.closeModals();

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
      if (this.net.role === 'host') this.net.send({ t: 's', tm: r2(this.world.sky.time * 1000) / 1000, h: this._pose(), pr: this.projectiles.snapshot(), cr: this.creatures.snapshot(), rc: this.ranchSim.snapshot() });
      else this.net.send({ t: 'p', p: this._pose() });
    }

    this._autosave += dt;
    if (this._autosave > 30) { this._autosave = 0; this.save(); }

    this.renderer.render(this.scene, this.camera);
    input.endFrame();
  }
}
