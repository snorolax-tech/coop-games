// First-person building mode (key B, only on the ranch): a ghost preview follows where
// you look, R rotates, left click places, X demolishes the building you're aiming at.
// 1-8 / mouse wheel picks what to build.
import * as THREE from 'three';
import { BUILDINGS, BUILD_ORDER } from '../data/buildings.js';
import { buildModel, costText } from '../ranch/buildings.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x06d6a0, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xef476f, transparent: true, opacity: 0.45, depthWrite: false });

export class BuildMode {
  constructor(root, game) {
    this.game = game;
    this.active = false;
    this.sel = 0;
    this.rot = 0;
    this.ghost = null;
    this.ghostType = null;
    this.spot = null;
    this.reason = '';
    this.el = h(`<div class="build-ui hidden">
      <div class="build-title">🔨 Build Mode <span class="build-why"></span></div>
      <div class="build-list"></div>
      <div class="build-hint"><b>1-0</b>/wheel choose · <b>R</b> rotate · <b>Click</b> place · <b>X</b> demolish (aim at it) · <b>B</b> exit</div>
    </div>`);
    root.appendChild(this.el);
    this.list = this.el.querySelector('.build-list');
  }

  toggle(v = !this.active) {
    const g = this.game;
    if (v && g.player.zone !== 'ranch') { g.toast('You can only build on your ranch (inside the fence).', 'muted'); return; }
    if (v && g.inBattle) return;
    this.active = v;
    this.el.classList.toggle('hidden', !v);
    g.items.holder.visible = !v;
    if (!v) this._clearGhost();
    else { this.render(); g.audio.play('open'); }
  }

  render() {
    const inv = this.game.inventory;
    this.list.innerHTML = BUILD_ORDER.map((id, i) => {
      const b = BUILDINGS[id];
      const afford = Object.entries(b.cost).every(([k, n]) => (inv[k] || 0) >= n);
      return `<div class="build-item ${i === this.sel ? 'sel' : ''} ${afford ? '' : 'poor'}" title="${b.desc}">
        <div class="bi-key">${i < 10 ? (i + 1) % 10 : ''}</div><div class="bi-icon">${b.icon}</div><div class="bi-name">${b.name}</div><div class="bi-cost">${costText(b.cost)}</div></div>`;
    }).join('');
  }

  _clearGhost() {
    if (this.ghost) this.game.scene.remove(this.ghost);
    this.ghost = null; this.ghostType = null;
  }

  _makeGhost(type) {
    this._clearGhost();
    this.ghost = buildModel(type);
    this.ghost.traverse((o) => { if (o.isMesh) { o.material = ghostOk; o.castShadow = false; o.raycast = () => {}; } });
    this.ghostType = type;
    this.game.scene.add(this.ghost);
  }

  /** Where the camera ray meets the ground (within 16 m). */
  _aimPoint() {
    const cam = this.game.camera;
    const o = cam.getWorldPosition(new THREE.Vector3());
    const d = cam.getWorldDirection(new THREE.Vector3());
    const p = o.clone();
    for (let t = 0; t < 18; t += 0.25) {
      p.copy(o).addScaledVector(d, t);
      if (p.y <= this.game.world.groundY(p.x, p.z)) return p;
    }
    // looking too high: project onto the ground at max distance
    p.copy(o).addScaledVector(d.setY(0).normalize(), 10);
    p.y = this.game.world.groundY(p.x, p.z);
    return p;
  }

  update(dt, input) {
    if (!this.active) return;
    const g = this.game;
    if (g.player.zone !== 'ranch' || g.inBattle) { this.toggle(false); return; }
    for (let i = 0; i < Math.min(10, BUILD_ORDER.length); i++) if (input.wasPressed('Digit' + ((i + 1) % 10))) { this.sel = i; this.render(); g.audio.play('ui'); }
    if (input.wheel) { this.sel = (this.sel + input.wheel + BUILD_ORDER.length) % BUILD_ORDER.length; this.render(); g.audio.play('ui'); }
    if (input.wasPressed('KeyR')) { this.rot = (this.rot + Math.PI / 4) % (Math.PI * 2); g.audio.play('ui'); }
    const type = BUILD_ORDER[this.sel];
    if (this.ghostType !== type) this._makeGhost(type);

    const p = this._aimPoint();
    const snap = 0.5;
    p.x = Math.round(p.x / snap) * snap; p.z = Math.round(p.z / snap) * snap;
    this.reason = g.buildings.check(type, p.x, p.z);
    const def = BUILDINGS[type];
    const afford = Object.entries(def.cost).every(([k, n]) => (g.inventory[k] || 0) >= n);
    if (!this.reason && !afford) this.reason = `Need ${costText(def.cost)}`;
    this.ghost.position.set(p.x, g.world.groundY(p.x, p.z) + 0.02, p.z);
    this.ghost.rotation.y = this.rot;
    const mat = this.reason ? ghostBad : ghostOk;
    this.ghost.traverse((o) => { if (o.isMesh) o.material = mat; });
    this.el.querySelector('.build-why').textContent = this.reason ? `— ${this.reason}` : `— ${def.name}: click to place`;
    this.el.querySelector('.build-why').className = `build-why ${this.reason ? 'bad' : 'ok'}`;

    if (input.clicked(0)) {
      if (this.reason) { g.toast(this.reason, 'bad'); g.audio.play('locked'); }
      else { g.requestBuild(type, p.x, p.z, this.rot); setTimeout(() => this.render(), 300); }
    }
    if (input.wasPressed('KeyX')) {
      const t = g.interactions.target;
      if (t?.id?.startsWith('bd:')) g.requestDemolish(+t.id.slice(3));
      else g.toast('Aim at one of your buildings to demolish it.', 'muted');
    }
  }
}
