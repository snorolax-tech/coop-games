// App entry: renderer, menu flow, lobby/networking glue and the main loop.
import './style.css';
import * as THREE from 'three';
import { Input } from './core/input.js';
import { HUD } from './ui/hud.js';
import * as UI from './ui/menus.js';
import { Game } from './game/game.js';
import { Net } from './net/network.js';
import { Voice, blobToChunks, chunksToUrl } from './net/voice.js';
import { ReplayPlayer } from './game/replay.js';
import { simulateViews } from './game/viewers.js';
import { buildKitchen } from './game/kitchen.js';
import { ChefAvatar } from './game/player.js';
import { audio } from './audio.js';
import { loadSave, writeSave, UPGRADES, SETS, upgradePrice } from './save.js';

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game-container').appendChild(renderer.domElement);

const input = new Input(renderer.domElement);
const hud = new HUD();
const save = loadSave();
if (!save.name) { save.name = 'Chef ' + ['Spatula', 'Noodle', 'Biscuit', 'Pickles', 'Waffles', 'Nugget'][(Math.random() * 6) | 0]; writeSave(save); }
audio.setVolume(save.settings.volume);

let game = null, net = null, voice = null, replay = null;
let pending = null;          // finished episode waiting to be posted: { results, frames, set, names, camLevel }
let pendingPost = null;      // (client) the host's 'post' message, if it arrived before we were ready
let incomingVoice = null, partnerVoiceStash = null; // partner's voice recording (arrives after the episode)
let role = 'solo';           // 'solo' | 'host' | 'client'
let lobby = {};              // lobby view state
let selectedSet = save.sets[save.lastSet] ? save.lastSet : 'classic';
let screenState = 'menu';
let myName = save.name;

// ---------- menu backdrop (a slowly orbiting kitchen) ----------
const backdrop = (() => {
  const scene = new THREE.Scene();
  buildKitchen(scene, null, 'classic');
  const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  const a = new ChefAvatar(0xff006e, ''); a.group.position.set(-1, 0, 2); scene.add(a.group); a.tag.visible = false;
  const b = new ChefAvatar(0x3a86ff, ''); b.group.position.set(1.2, 0, 1.6); b.group.rotation.y = 0.6; scene.add(b.group); b.tag.visible = false;
  let t = 0;
  return {
    render(dt) {
      t += dt * 0.12;
      cam.position.set(Math.sin(t) * 5.5, 3.2, 3.5 + Math.cos(t) * 2);
      cam.lookAt(0, 1, -1.5);
      a.update(new THREE.Vector3(-1, 0.35, 2), Math.sin(t * 3) * 0.5, 0, dt, 0);
      b.update(new THREE.Vector3(1.2, 0.35, 1.6), 0.6 + Math.sin(t * 2.3) * 0.4, 0, dt, 0);
      renderer.render(scene, cam);
    },
    resize() { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); },
  };
})();

// ---------- navigation ----------
function persist() { writeSave(save); }

function showMain() {
  screenState = 'menu';
  teardown();
  UI.mainMenu(save, {
    setName: (n) => { if (n) { save.name = n.slice(0, 14); myName = save.name; persist(); } },
    setSens: (v) => { save.settings.sens = v; persist(); },
    setVolume: (v) => { save.settings.volume = v; audio.setVolume(v); persist(); },
    solo: (name) => { myName = name; role = 'solo'; showLobby(); },
    host: (name) => { myName = name; startHosting(); },
    join: (name) => { myName = name; showJoin(); },
    shop: () => showShop(showMain),
    help: () => UI.helpScreen(showMain),
  });
}

function teardown() {
  if (game) { game.dispose(); game = null; }
  if (replay) { replay.dispose(); replay = null; }
  if (net) { const n = net; net = null; n.destroy(); }
  if (voice) { voice.destroy(); voice = null; }
  pending = null; pendingPost = null;
  hud.show(false);
  input.exitLock();
}

function showShop(back) {
  screenState = 'shop';
  UI.shopScreen(save, {
    buyUpgrade: (id) => {
      const u = UPGRADES.find((x) => x.id === id); const price = upgradePrice(save, u);
      if (price != null && save.money >= price) { save.money -= price; save.upgrades[id]++; persist(); audio.play('cash'); }
      showShop(back);
    },
    buySet: (id) => {
      const s = SETS.find((x) => x.id === id);
      if (!save.sets[id] && save.money >= s.price) { save.money -= s.price; save.sets[id] = true; selectedSet = id; persist(); audio.play('fanfare'); }
      showShop(back);
    },
    back,
  });
}

function showLobby() {
  screenState = 'lobby';
  hud.show(false);
  lobby.role = role; lobby.save = save;
  lobby.mic = save.settings.mic !== false;
  lobby.micDenied = !!voice?.micDenied;
  lobby.headphones = !!save.settings.headphones;
  if (net?.connected && !lobby.connType) net.connectionType().then((t) => { if (t) { lobby.connType = t; if (screenState === 'lobby') showLobby(); } });
  if (role !== 'client') lobby.set = selectedSet;
  UI.lobbyScreen(lobby, {
    toggleHeadphones: () => {
      save.settings.headphones = !save.settings.headphones; persist();
      voice?.setHeadphones(!!save.settings.headphones);
      showLobby();
    },
    toggleMic: () => {
      save.settings.mic = !lobby.mic; persist();
      if (!save.settings.mic) voice?.setMuted(true);
      else if (voice) voice.enableMic().then(() => screenState === 'lobby' && showLobby());
      else getVoice();
      showLobby();
    },
    pickSet: (id) => { selectedSet = id; save.lastSet = id; persist(); sendLobbyInfo(); showLobby(); },
    start: () => startEpisode(),
    startSolo: () => { if (net) { const n = net; net = null; n.destroy(); } role = 'solo'; startEpisode(); },
    shop: () => showShop(showLobby),
    reset: () => UI.confirmScreen('🔄 Start a New Game?',
      `This resets you to Episode 1 and wipes your $${save.money}, upgrades, unlocked kitchens and fans. Your name and settings stay.`,
      'Yes, start over', { yes: () => { resetProgress(); showLobby(); }, no: showLobby }),
    leave: () => showMain(),
  });
}

function resetProgress() {
  Object.assign(save, {
    money: 0, episodes: 0, fans: 0, bestViewers: 0, totalEarned: 0,
    upgrades: { knife: 0, pan: 0, ext: 0, cam: 0 }, sets: { classic: true, boat: false, bbq: false }, lastSet: 'classic',
  });
  selectedSet = 'classic';
  persist(); sendLobbyInfo();
}

function sendLobbyInfo() { if (net && role === 'host') net.send({ t: 'lobby', set: selectedSet, name: myName }); }

// ---------- voice ----------
function getVoice() {
  if (!voice) voice = new Voice(save.settings.mic !== false, !!save.settings.headphones);
  voice.ready().then(() => { if (screenState === 'lobby') showLobby(); });
  return voice;
}

// ---------- multiplayer setup ----------
function startHosting() {
  teardown();
  role = 'host'; lobby = { code: null, friend: null };
  const v = getVoice();
  net = new Net();
  net.on('open', () => {
    net.send({ t: 'hello', name: myName }); sendLobbyInfo();
    v.ready().then((s) => net?.callVoice(s));
  })
    .on('stream', (s, c) => v.attachRemote(s, c))
    .on('data', onNetData)
    .on('close', (reason) => onDisconnect(reason))
    .on('error', (msg) => { lobby.error = msg; if (screenState === 'lobby') showLobby(); });
  net.host((code) => { lobby.code = code; if (screenState === 'lobby') showLobby(); });
  showLobby();
}

function showJoin() {
  teardown();
  screenState = 'join';
  UI.joinScreen({
    back: showMain,
    connect: (code) => {
      if (net) net.destroy();
      UI.setStatus('Connecting…');
      role = 'client'; lobby = { friend: null, set: 'classic' };
      const v = getVoice();
      net = new Net();
      net.voiceStream = () => v.ready();
      net.on('stream', (s, c) => v.attachRemote(s, c));
      net.on('open', () => { net.send({ t: 'hello', name: myName }); UI.setStatus('Connected!', 'ok'); })
        .on('data', onNetData)
        .on('close', (reason) => onDisconnect(reason))
        .on('error', (msg) => { if (screenState === 'join') UI.setStatus(msg, 'err'); else onDisconnect(msg); if (net) { net.destroy(); net = null; } });
      net.join(code);
    },
  });
}

function onNetData(msg) {
  switch (msg.t) {
    case 'hello':
      lobby.friend = msg.name;
      if (role === 'client') { showLobby(); }
      else if (screenState === 'lobby') showLobby();
      else if (game) hud.toast(`${msg.name} joined`, 'good');
      return;
    case 'lobby':
      if (role === 'client') { lobby.set = msg.set; lobby.friend = msg.name; if (screenState === 'lobby') showLobby(); }
      return;
    case 'start':
      if (role === 'client') startClientGame(msg);
      return;
    case 'end':
      if (role === 'client') onEpisodeEnd(msg.results);
      return;
    case 'voice': { // partner's voice recording arriving in pieces
      if (!incomingVoice || msg.i === 0) incomingVoice = { n: msg.n, type: msg.type, chunks: [] };
      incomingVoice.chunks[msg.i] = msg.c;
      if (incomingVoice.chunks.filter(Boolean).length === incomingVoice.n) {
        const url = chunksToUrl(incomingVoice.type, incomingVoice.chunks);
        incomingVoice = null;
        if (pending?.ready) pending.partnerVoiceUrl = url; else partnerVoiceStash = url;
        replay?.addVoice(url);
      }
      return;
    }
    case 'post':
      if (role === 'client') { pendingPost = msg; if (pending?.ready) playReplay(msg.timeline, msg.results); }
      return;
    case 'tolobby':
      if (role === 'client') {
        if (game) { game.dispose(); game = null; }
        if (replay) { replay.dispose(); replay = null; }
        if (pending && !pending.banked && pendingPost) bank(pendingPost.results);
        pending = null; pendingPost = null;
        hud.show(false); input.exitLock(); showLobby();
      }
      return;
  }
  if (game) game.onNet(msg);
}

function onDisconnect(reason) {
  const wasInGame = !!game || !!replay || !!pending;
  if (net) { net = null; }
  if (game) { game.dispose(); game = null; }
  if (replay) { replay.dispose(); replay = null; }
  pending = null;
  hud.show(false); input.exitLock();
  screenState = 'message';
  UI.messageScreen(wasInGame ? '📡 Signal lost!' : '📡 Disconnected', reason || 'Your friend disconnected.', { ok: showMain });
}

// ---------- episodes ----------
function startViewers() { return 40 + Math.min(500, Math.floor(save.fans * 0.15)); }

function startEpisode() {
  if (role === 'host' && !(net && net.connected)) role = 'solo';
  const names = [myName, lobby.friend || 'Chef 2'];
  const opts = { set: selectedSet, upgrades: { ...save.upgrades }, names, startViewers: startViewers() };
  if (role === 'host') net.send({ t: 'start', ...opts });
  launchGame(role, opts, 0);
}
function startClientGame(msg) {
  launchGame('client', { set: msg.set, upgrades: msg.upgrades, names: msg.names, startViewers: msg.startViewers }, 1);
}
function launchGame(r, opts, myId) {
  if (game) game.dispose();
  incomingVoice = null; partnerVoiceStash = null;
  audio.init();
  hud.show(true);
  if (r === 'solo' && save.settings.mic !== false) getVoice(); // solo: your commentary goes on the tape
  game = new Game({
    renderer, input, hud, net: r === 'solo' ? null : net, role: r, setId: opts.set, upgrades: opts.upgrades,
    names: opts.names, myId, startViewers: opts.startViewers, settings: save.settings, onEnd: onEpisodeEnd, voice,
  });
  screenState = 'game';
  showPause(true);
}

function showPause(first = false) {
  if (!game) return;
  if (game) game.paused = role === 'solo';
  UI.pauseScreen(first, role, {
    resume: () => { audio.init(); input.requestLock(); },
    leave: () => showMain(),
  });
}
input.onLockChange = (locked) => {
  if (!game || screenState !== 'game') return;
  if (locked) { UI.hideScreen(); game.paused = false; }
  else if (game.running) showPause(false);
};

// ---------- end of episode → post the tape → watch it on ChefTube → results ----------

function onEpisodeEnd(results) {
  if (!game) return;
  pending = { results, frames: game.recording, set: game.setId, names: game.players.filter(Boolean).map((p) => p.name), camLevel: game.upgrades.cam, episode: save.episodes + 1 };
  screenState = 'wrap';
  input.exitLock();
  hud.banner("📺 THAT'S A WRAP!", 'Time to post the video…');
  const p = pending;
  setTimeout(async () => {
    if (pending !== p) return;
    if (game) { game.dispose(); game = null; }
    hud.show(false);
    const blob = voice ? await voice.finishRec() : null;
    p.voiceUrl = blob ? URL.createObjectURL(blob) : null;
    // send MY voice recording to my partner so their replay has it too
    if (blob && net?.connected) {
      const { type, chunks } = await blobToChunks(blob);
      chunks.forEach((c, i) => net.send({ t: 'voice', i, n: chunks.length, type, c }));
    }
    if (partnerVoiceStash) { p.partnerVoiceUrl = partnerVoiceStash; partnerVoiceStash = null; }
    p.ready = true;
    if (pending !== p) return;
    if (role === 'client' && pendingPost) return playReplay(pendingPost.timeline, pendingPost.results);
    UI.postScreen({ footage: results.footage, clips: results.clips, friend: lobby.friend }, role, {
      post: hostPost,
      menu: () => showMain(),
    });
  }, 2200);
}

function finalize(results, timeline, hasTape) {
  const peak = hasTape ? timeline.peak : 0;
  const ad = Math.round(peak * 0.06);
  const stars = Math.max(1, Math.min(5, Math.round(results.perfect * 0.6 + peak / 500 + 0.5)));
  return { ...results, peak, ad, total: results.dishMoney + ad, stars, best: timeline.best };
}

function hostPost() {
  if (!pending) return;
  const hasTape = pending.frames.length > 5;
  const timeline = hasTape ? simulateViews(pending.frames, startViewers()) : { samples: [], chat: [], moments: [], peak: 0, best: null };
  const fin = finalize(pending.results, timeline, hasTape);
  if (net && role === 'host') net.send({ t: 'post', timeline, results: fin });
  playReplay(timeline, fin);
}

function playReplay(timeline, fin) {
  if (!pending) return;
  screenState = 'replay';
  UI.hideScreen();
  const p = pending;
  replay = new ReplayPlayer({
    renderer, frames: p.frames.length > 5 ? p.frames : [], timeline, setId: p.set, names: p.names, camLevel: p.camLevel,
    episode: p.episode, voiceUrls: [p.voiceUrl, p.partnerVoiceUrl].filter(Boolean),
    onDone: () => { if (replay) { replay.dispose(); replay = null; } showResultsScreen(fin); },
  });
}

function bank(fin) {
  if (pending) { if (pending.banked) return; pending.banked = true; }
  save.money += fin.total; save.totalEarned += fin.total;
  save.episodes += 1; save.fans += Math.round(fin.peak * 0.2);
  save.bestViewers = Math.max(save.bestViewers, fin.peak);
  persist();
}

function showResultsScreen(fin) {
  bank(fin);
  screenState = 'results';
  UI.resultsScreen(fin, role, {
    next: () => { if (net && role === 'host') net.send({ t: 'tolobby' }); pending = null; showLobby(); },
    shop: () => { if (net && role === 'host') net.send({ t: 'tolobby' }); pending = null; showShop(showLobby); },
    menu: () => showMain(),
  });
}

// ---------- loop ----------
// rAF while visible; a Web Worker timer keeps the game (and the host simulation) ticking when the tab is hidden.
let last = performance.now();
function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (replay) { replay.update(dt); input.endFrame(); }
  else if (game) game.update(dt);
  else { backdrop.render(dt); input.endFrame(); }
}
let lastRaf = 0;
function loop(now) {
  requestAnimationFrame(loop);
  lastRaf = performance.now();
  step(now);
}
try {
  const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' })));
  // if the browser stopped giving us animation frames (tab in background / minimized), keep ticking
  worker.onmessage = () => { const n = performance.now(); if (n - lastRaf > 120) step(n); };
} catch { /* no workers: fine, just pauses in background */ }
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  backdrop.resize(); game?.resize();
});
document.addEventListener('pointerdown', () => audio.init(), { once: true });

// Debug hook for testing in the browser console
window.__csc = { get game() { return game; }, get replay() { return replay; }, get voice() { return voice; }, save };

showMain();
requestAnimationFrame(loop);
