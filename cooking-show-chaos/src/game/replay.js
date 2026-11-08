// "ChefTube": plays back the recorded tape from the show camera's point of view, with the simulated
// viewer count, chat reactions, sound effects, ragdolls and (if recorded) the players' voices.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildKitchen, BURNERS } from './kitchen.js';
import { Item, buildIngredient } from './items.js';
import { ChefAvatar } from './player.js';
import { Particles, FireVisuals, PuddleVisual, buildChicken } from './fx.js';
import { CAM_FOV } from './showcam.js';
import { audio } from '../audio.js';

const COLORS = [0xff006e, 0x3a86ff];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class ReplayPlayer {
  constructor({ renderer, frames, timeline, setId, names, camLevel = 0, episode = 1, voiceUrls = [], onDone }) {
    Object.assign(this, { renderer, frames, timeline, onDone });
    this.scene = new THREE.Scene();
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.kitchen = buildKitchen(this.scene, this.physics, setId);
    this.baseFov = CAM_FOV[camLevel] || 58;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 16 / 9, 0.12, 60);
    this.items = new Map();
    this.avatars = names.map((n, i) => { const a = new ChefAvatar(COLORS[i], n); this.scene.add(a.group); a.group.visible = false; return a; });
    this.particles = new Particles(this.scene);
    this.fireVis = new FireVisuals(this.scene);
    this.puddleVis = new PuddleVisual(this.scene, new THREE.Vector3(2.1, 0.012, -3.2));
    this.chicken = buildChicken(); this.chicken.visible = false; this.scene.add(this.chicken);
    this.t = 0; this.idx = -1; this.done = false;
    this.end = frames.length ? frames[frames.length - 1].rt : 0;
    this.chatI = 0; this.momentI = 0; this.sampleI = 0; this.views = timeline.samples[0]?.[1] || 0; this.likes = 0;
    this.shake = 0; this.dark = 1;
    this.qa = new THREE.Quaternion(); this.qb = new THREE.Quaternion();
    this.buildUI(names, episode);
    this.voices = [];
    for (const u of voiceUrls) this.addVoice(u);
    audio.play('fanfare', 0.6);
  }

  buildUI(names, episode) {
    const el = document.createElement('div');
    el.id = 'replay';
    el.innerHTML = `
      <div class="rp-top"><span class="rp-logo">▶ Chef<b>Tube</b></span><span class="rp-search">🔍 cooking show chaos</span></div>
      <div class="rp-main">
        <div class="rp-left">
          <div class="rp-video" id="rp-video"><div id="rp-pops"></div><div class="rp-progress"><div></div></div><div class="rp-time"></div></div>
          <div class="rp-title">🍳 Cooking Show Chaos — Episode ${episode}: ${esc(names.join(' & '))} vs. The Kitchen</div>
          <div class="rp-stats"><span id="rp-views" class="rp-views">👁 0 watching</span><span class="rp-like">👍 <b id="rp-likes">0</b></span><span class="rp-sub">🔔 SUBSCRIBED</span></div>
        </div>
        <div class="rp-chat"><div class="rp-chat-title">💬 Live chat replay</div><div id="rp-chat"></div></div>
      </div>
      <button class="btn rp-skip" id="rp-skip">Skip to results ⏭</button>`;
    document.body.appendChild(el);
    this.el = el;
    this.ui = {
      video: el.querySelector('#rp-video'), pops: el.querySelector('#rp-pops'), progress: el.querySelector('.rp-progress > div'),
      time: el.querySelector('.rp-time'), views: el.querySelector('#rp-views'), likes: el.querySelector('#rp-likes'), chat: el.querySelector('#rp-chat'),
    };
    el.querySelector('#rp-skip').addEventListener('click', () => this.finish());
    if (!this.frames.length) this.ui.pops.innerHTML = '<div class="rp-empty">📼 The tape is empty…<br>Nobody pressed record! 😭</div>';
  }

  // A voice track (yours, or your partner's arriving a moment later) — joins in sync with the video
  addVoice(url) {
    if (!url || this.done) return;
    const a = new Audio(url);
    const start = () => { try { a.currentTime = Math.max(0, this.t); } catch { /* */ } a.play().catch(() => {}); };
    if (this.t < 0.05) start(); else a.addEventListener('loadedmetadata', start, { once: true });
    this.voices.push(a);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.onDone?.();
  }

  dispose() {
    this.el?.remove();
    for (const a of this.voices || []) { a.pause(); a.src = ''; }
    for (const a of this.avatars) a.endRagdoll();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  // ---- apply one recorded frame (states, spawns/removals, one-shot effects) ----
  applyFrame(f) {
    const seen = new Set();
    for (const e of f.it) {
      seen.add(e[0]);
      let it = this.items.get(e[0]);
      if (!it) { it = new Item(e[0], e[1], e[11] || {}); this.items.set(e[0], it); this.scene.add(it.mesh); }
      else if (e[11]) it.s = e[11];
      it.holder = e[9]; it.slot = e[9] >= 0 ? (e[10] ? 'cam' : 'hand') : null;
      it.rebuildVisual();
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this.scene.remove(it.mesh); this.items.delete(id); }
    this.st = f.st;
    for (const [n, d] of f.fx || []) {
      if (n === 'sfx') audio.play(d.n, 0.7);
      else if (n === 'burst') this.particles.burst(d.k, new THREE.Vector3(...d.p), d.n || 10, d.s || 2);
      else if (n === 'ragdoll') this.avatars[d.to]?.startRagdoll(this.physics, this.scene, d.v);
      else if (n === 'banner') this.pop(`<div class="rp-banner">${esc(d.title)}</div>`, 2600);
    }
  }

  pop(html, ms = 2200) {
    const d = document.createElement('div'); d.className = 'rp-pop'; d.innerHTML = html;
    this.ui.pops.appendChild(d); setTimeout(() => d.remove(), ms);
    while (this.ui.pops.children.length > 3) this.ui.pops.firstChild.remove();
  }

  update(dt) {
    if (this.done) return;
    const F = this.frames;
    this.t += dt;
    if (!F.length) { if (this.t > 3.5) this.finish(); this.render(); return; }
    // advance through frames we've reached
    while (this.idx + 1 < F.length && F[this.idx + 1].rt <= this.t) { this.idx++; this.applyFrame(F[this.idx]); }
    if (this.idx < 0) { this.idx = 0; this.applyFrame(F[0]); }
    const a = F[this.idx], b = F[Math.min(F.length - 1, this.idx + 1)];
    const span = b.rt - a.rt;
    const al = span > 0 && span < 0.3 ? Math.max(0, Math.min(1, (this.t - a.rt) / span)) : 0; // no lerp across jump cuts
    const bMap = this._bMapFor(b);
    // items
    for (const e of a.it) {
      const it = this.items.get(e[0]); if (!it) continue;
      const eb = bMap.get(e[0]) || e;
      it.mesh.position.set(e[2] + (eb[2] - e[2]) * al, e[3] + (eb[3] - e[3]) * al, e[4] + (eb[4] - e[4]) * al);
      this.qa.set(e[5], e[6], e[7], e[8]); this.qb.set(eb[5], eb[6], eb[7], eb[8]);
      it.mesh.quaternion.slerpQuaternions(this.qa, this.qb, al);
    }
    // chefs
    a.pl.forEach((pa, i) => {
      const av = this.avatars[i]; if (!pa || !av) return;
      const pb = b.pl[i] || pa;
      av.group.visible = true;
      const pos = new THREE.Vector3(pa.pos[0] + (pb.pos[0] - pa.pos[0]) * al, pa.pos[1] + (pb.pos[1] - pa.pos[1]) * al, pa.pos[2] + (pb.pos[2] - pa.pos[2]) * al);
      av.update(pos, pa.yaw + (pb.yaw - pa.yaw) * al, pa.pitch, dt, Math.hypot(pa.vel[0], pa.vel[2]));
      av.updateRagdoll(dt);
      av.setOnFire(!!pa.fire);
      av.setGhost(pa.dead > 0 && !av.ragdolling);
      if (pa.fire && Math.random() < dt * 12) this.particles.spawn('ember', av.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(Math.random() - 0.5, 2, Math.random() - 0.5));
    });
    this.physics.step(1 / 60, dt, 3);
    this.updateWorld(dt, a, b, al);
    this.updateTimeline();
    this.render();
    if (this.t > this.end + 2.5) this.finish();
  }
  _bMapFor(f) {
    if (this._bFrame === f) return this._bMap;
    this._bFrame = f; this._bMap = new Map(f.it.map((e) => [e[0], e]));
    return this._bMap;
  }

  updateWorld(dt, a, b, al) {
    const st = this.st || a.st;
    this.kitchen.burnerMeshes.forEach((bm, i) => {
      const on = st.burners?.[i];
      bm.glowMat.emissive.setHex(on ? 0xff3300 : 0); bm.glowMat.emissiveIntensity = on ? 1.4 : 0;
    });
    this.fireVis.sync(st.fires || [], this.particles, dt);
    this.puddleVis.sync(st.flood?.r || 0, dt);
    this.kitchen.sinkWater.visible = !!st.flood?.on;
    const ch = st.chicken;
    this.chicken.visible = !!ch;
    if (ch) {
      const cb = b.st.chicken || ch;
      this.chicken.position.set(ch.x + (cb.x - ch.x) * al, ch.y + (cb.y - ch.y) * al, ch.z + (cb.z - ch.z) * al);
      this.chicken.rotation.y = ch.yaw;
      const tt = this.t * 18, u = this.chicken.userData;
      u.wingL.rotation.z = Math.sin(tt) * 0.6; u.wingR.rotation.z = -Math.sin(tt) * 0.6;
      u.legL.rotation.x = Math.sin(tt) * 0.7; u.legR.rotation.x = -Math.sin(tt) * 0.7;
      const key = ch.carry.join(',');
      if (key !== this.lootKey) { this.lootKey = key; u.loot.clear(); if (ch.carry.length) u.loot.add(buildIngredient(ch.carry[ch.carry.length - 1])); }
    }
    const targetDark = st.dark > 0 ? 0.07 : 1;
    this.dark += (targetDark - this.dark) * Math.min(1, dt * 6);
    const L = this.kitchen.lights;
    L.hemi.intensity = L.base.hemi * this.dark; L.dir.intensity = L.base.dir * this.dark; L.fill.intensity = L.base.fill * this.dark;
    if (st.quake > 0) this.shake = 0.25;
    this.shake = Math.max(0, this.shake - dt);
    // steam / smoke from cooking
    for (const it of this.items.values()) {
      const p = it.mesh.position;
      const burnt = it.def.cookware ? (it.s.k >= 2 || it.s.c?.some((c) => c.k >= 2)) : (it.type === 'patty' && it.s.k >= 2);
      if (burnt && Math.random() < dt * 4) this.particles.spawn('smoke', p.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3(0, 0.7, 0));
      if (it.type === 'pot' && it.s.w && BURNERS.some((bp) => Math.hypot(bp.x - p.x, bp.z - p.z) < 0.3) && Math.random() < dt * 8)
        this.particles.spawn('steam', p.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3(0, 0.9, 0));
    }
    this.particles.update(dt);
  }

  updateTimeline() {
    const tl = this.timeline, t = this.t;
    while (this.sampleI + 1 < tl.samples.length && tl.samples[this.sampleI + 1][0] <= t) this.sampleI++;
    const target = tl.samples[this.sampleI]?.[1] || 0;
    const prev = this.views;
    this.views += (target - this.views) * 0.15;
    const v = Math.round(this.views);
    this.ui.views.textContent = `👁 ${v.toLocaleString()} watching`;
    this.ui.views.classList.toggle('up', v > prev + 1);
    this.likes = Math.max(this.likes, Math.round(this.views * 0.12));
    this.ui.likes.textContent = this.likes.toLocaleString();
    while (this.chatI < tl.chat.length && tl.chat[this.chatI][0] <= t) {
      const [, u, c, m, h] = tl.chat[this.chatI++];
      const d = document.createElement('div');
      d.className = 'chat-line' + (h ? ' hype' : '');
      d.innerHTML = `<span class="u" style="color:${esc(c)}">${esc(u)}:</span> ${esc(m)}`;
      this.ui.chat.appendChild(d);
      while (this.ui.chat.children.length > 40) this.ui.chat.firstChild.remove();
    }
    while (this.momentI < tl.moments.length && tl.moments[this.momentI][0] <= t) {
      const [, label, gain] = tl.moments[this.momentI++];
      this.pop(`<div class="rp-moment">🔥 ${esc(label)}<span>+${gain.toLocaleString()} viewers</span></div>`);
      if (gain > 120) audio.play('cheer', 0.6);
    }
    this.ui.progress.style.width = `${Math.min(100, (t / Math.max(0.1, this.end)) * 100)}%`;
    this.ui.time.textContent = `${fmt(Math.min(t, this.end))} / ${fmt(this.end)}`;
  }

  render() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    r.setClearColor(0x0f0f14, 1); r.clear();
    const box = this.ui.video.getBoundingClientRect();
    const rect = { x: Math.round(box.left), y: Math.round(size.y - box.bottom), w: Math.round(box.width), h: Math.round(box.height) };
    // camera = the show camera item's pose on tape
    const camItem = [...this.items.values()].find((i) => i.type === 'showcam');
    if (camItem) {
      camItem.mesh.updateMatrixWorld();
      camItem.mesh.getWorldPosition(this.camera.position);
      camItem.mesh.getWorldQuaternion(this.camera.quaternion);
      this.camera.translateZ(-0.32);
      camItem.mesh.visible = false;
    }
    if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * 0.04; this.camera.position.y += (Math.random() - 0.5) * 0.04; }
    this.camera.fov = this.baseFov / ((this.st && this.st.zoom) || 1); // replay the cameraperson's zoom too
    this.camera.aspect = rect.w / Math.max(1, rect.h); this.camera.updateProjectionMatrix();
    r.setScissorTest(true);
    r.setScissor(rect.x, rect.y, rect.w, rect.h); r.setViewport(rect.x, rect.y, rect.w, rect.h);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
  }
}
