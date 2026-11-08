// First-person building mode (B, only on the ranch). A ghost preview follows where you look.
//   Z / C        previous / next category      1-9 / wheel   pick a piece
//   R            rotate 45°  (Shift+R: 15°)     P / Shift+P   paint colour
//   G            toggle grid snapping           Click         place
//   T            copy the piece you're aiming at (type, rotation, colour)
//   V            move the piece you're aiming at (picks it up, full refund)
//   X            demolish the piece you're aiming at
//   B            exit
import * as THREE from 'three';
import { BUILDINGS, CATEGORIES, PAINTS } from '../data/buildings.js';
import { buildModel, costText } from '../ranch/buildings.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x06d6a0, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xef476f, transparent: true, opacity: 0.45, depthWrite: false });

export class BuildMode {
  constructor(root, game) {
    this.game = game;
    this.active = false;
    this.cat = 0;
    this.sel = 0;
    this.rot = 0;
    this.paint = 0;
    this.grid = true;
    this.ghost = null;
    this.ghostKey = '';
    this.reason = '';
    this.el = h(`<div class="build-ui hidden">
      <div class="build-title">🔨 Build Mode <span class="build-why"></span></div>
      <div class="build-cats"></div>
      <div class="build-list"></div>
      <div class="build-status"></div>
      <div class="build-hint"><b>Z/C</b> category · <b>1-9</b>/wheel piece · <b>R</b> rotate (<b>Shift+R</b> fine) · <b>P</b> paint · <b>G</b> grid · <b>Click</b> place · <b>T</b> copy · <b>V</b> move · <b>X</b> demolish · <b>B</b> exit</div>
    </div>`);
    root.appendChild(this.el);
    this.list = this.el.querySelector('.build-list');
  }

  get items() { return CATEGORIES[this.cat].items; }
  get type() { return this.items[Math.min(this.sel, this.items.length - 1)]; }
  get color() { return BUILDINGS[this.type].paint ? PAINTS[this.paint] : null; }

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
    this.el.querySelector('.build-cats').innerHTML = CATEGORIES.map((c, i) =>
      `<span class="build-cat ${i === this.cat ? 'sel' : ''}">${c.icon} ${c.name}</span>`).join('');
    this.list.innerHTML = this.items.map((id, i) => {
      const b = BUILDINGS[id];
      const afford = Object.entries(b.cost).every(([k, n]) => (inv[k] || 0) >= n);
      return `<div class="build-item ${i === this.sel ? 'sel' : ''} ${afford ? '' : 'poor'}" title="${b.desc}">
        <div class="bi-key">${i + 1}</div><div class="bi-icon">${b.icon}</div><div class="bi-name">${b.name}</div><div class="bi-cost">${costText(b.cost)}</div></div>`;
    }).join('');
    const def = BUILDINGS[this.type];
    const paint = this.color;
    this.el.querySelector('.build-status').innerHTML = `
      <span>🎨 Paint: ${def.paint ? (paint ? `<i class="swatch-dot" style="background:${paint}"></i>` : 'natural') : '<small>(not paintable)</small>'}</span>
      <span>🔄 ${Math.round((this.rot * 180) / Math.PI)}°</span>
      <span>📐 Grid: ${this.grid ? `on (${def.grid || 0.5} m)` : 'off'}</span>
      <span class="build-desc">${def.desc}</span>`;
  }

  _clearGhost() {
    if (this.ghost) this.game.scene.remove(this.ghost);
    this.ghost = null; this.ghostKey = '';
  }

  _makeGhost() {
    this._clearGhost();
    this.ghost = buildModel(this.type, this.color, '');
    this.ghost.traverse((o) => { if (o.isMesh || o.isSprite) { o.material = ghostOk; o.castShadow = false; o.raycast = () => {}; } });
    this.ghostKey = this.type + (this.color || '');
    this.game.scene.add(this.ghost);
  }

  /** Where the camera ray meets the ground (within 18 m). */
  _aimPoint() {
    const cam = this.game.camera;
    const o = cam.getWorldPosition(new THREE.Vector3());
    const d = cam.getWorldDirection(new THREE.Vector3());
    const p = o.clone();
    for (let t = 0; t < 18; t += 0.25) {
      p.copy(o).addScaledVector(d, t);
      if (p.y <= this.game.world.groundY(p.x, p.z)) return p;
    }
    p.copy(o).addScaledVector(d.setY(0).normalize(), 10);
    p.y = this.game.world.groundY(p.x, p.z);
    return p;
  }

  _target() {
    const t = this.game.interactions.target;
    return t?.id?.startsWith('bd:') ? this.game.buildings.map.get(+t.id.slice(3)) : null;
  }

  /** Pick type / rotation / colour from an existing piece. */
  _copyFrom(e) {
    const ci = CATEGORIES.findIndex((c) => c.items.includes(e.type));
    if (ci < 0) return;
    this.cat = ci; this.sel = CATEGORIES[ci].items.indexOf(e.type);
    this.rot = e.rot || 0;
    const pi = PAINTS.indexOf(e.color || null);
    this.paint = pi >= 0 ? pi : 0;
    this.render();
  }

  update(dt, input) {
    if (!this.active) return;
    const g = this.game;
    if (g.player.zone !== 'ranch' || g.inBattle) { this.toggle(false); return; }
    const shift = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let changed = false;
    if (input.wasPressed('KeyZ')) { this.cat = (this.cat + CATEGORIES.length - 1) % CATEGORIES.length; this.sel = 0; changed = true; }
    if (input.wasPressed('KeyC')) { this.cat = (this.cat + 1) % CATEGORIES.length; this.sel = 0; changed = true; }
    for (let i = 0; i < Math.min(9, this.items.length); i++) if (input.wasPressed('Digit' + (i + 1))) { this.sel = i; changed = true; }
    if (input.wheel) { this.sel = (this.sel + input.wheel + this.items.length) % this.items.length; changed = true; }
    if (input.wasPressed('KeyR')) { this.rot = (this.rot + (shift ? Math.PI / 12 : Math.PI / 4)) % (Math.PI * 2); changed = true; }
    if (input.wasPressed('KeyP')) { this.paint = (this.paint + (shift ? PAINTS.length - 1 : 1)) % PAINTS.length; changed = true; }
    if (input.wasPressed('KeyG')) { this.grid = !this.grid; changed = true; g.toast(`Grid snapping ${this.grid ? 'on' : 'off'}`, 'muted'); }
    if (input.wasPressed('KeyT')) { const e = this._target(); if (e) { this._copyFrom(e); g.toast(`Copied ${BUILDINGS[e.type].name}`, 'good'); } else g.toast('Aim at a piece to copy it.', 'muted'); }
    if (input.wasPressed('KeyV')) {
      const e = this._target();
      if (e) { this._copyFrom(e); g.requestDemolish(e.id, true); } else g.toast('Aim at a piece to move it.', 'muted');
    }
    if (input.wasPressed('KeyX')) {
      const e = this._target();
      if (e) g.requestDemolish(e.id); else g.toast('Aim at one of your buildings to demolish it.', 'muted');
    }
    if (changed) { this.render(); g.audio.play('ui'); }

    const type = this.type;
    const def = BUILDINGS[type];
    if (this.ghostKey !== type + (this.color || '')) this._makeGhost();

    const p = this._aimPoint();
    const snap = this.grid ? (def.grid || 0.5) : 0.1;
    p.x = Math.round(p.x / snap) * snap; p.z = Math.round(p.z / snap) * snap;
    this.reason = g.buildings.check(type, p.x, p.z, null, this.rot);
    const afford = Object.entries(def.cost).every(([k, n]) => (g.inventory[k] || 0) >= n);
    if (!this.reason && !afford) this.reason = `Need ${costText(def.cost)}`;
    this.ghost.position.set(p.x, g.world.groundY(p.x, p.z) + 0.02, p.z);
    this.ghost.rotation.y = this.rot;
    const mat = this.reason ? ghostBad : ghostOk;
    this.ghost.traverse((o) => { if (o.isMesh) o.material = mat; });
    const why = this.el.querySelector('.build-why');
    why.textContent = this.reason ? `— ${this.reason}` : `— ${def.name}: click to place`;
    why.className = `build-why ${this.reason ? 'bad' : 'ok'}`;

    if (input.clicked(0)) {
      if (this.reason) { g.toast(this.reason, 'bad'); g.audio.play('locked'); }
      else { g.requestBuild(type, p.x, p.z, this.rot, this.color); setTimeout(() => this.render(), 300); }
    }
  }
}
