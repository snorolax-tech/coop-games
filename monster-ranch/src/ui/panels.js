// Tab panel (Inventory / Party / Creature Dex) and the pause menu.
import { ITEMS } from '../data/items.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class TabPanel {
  constructor(root, game) {
    this.game = game;
    this.open = false;
    this.tab = 'items';
    this.el = h(`
      <div class="panel-wrap hidden">
        <div class="panel">
          <div class="panel-tabs">
            <button data-tab="items">🎒 Inventory</button>
            <button data-tab="party">🐾 Party</button>
            <button data-tab="dex">📖 Creature Dex</button>
          </div>
          <div class="panel-body"></div>
          <div class="panel-foot">Tab or Esc to close</div>
        </div>
      </div>`);
    root.appendChild(this.el);
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); game.audio.play('ui'); }));
  }

  toggle(v = !this.open) {
    this.open = v;
    this.el.classList.toggle('hidden', !v);
    if (v) this.render();
  }

  render() {
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    const body = this.el.querySelector('.panel-body');
    const inv = this.game.inventory;
    if (this.tab === 'items') {
      const cells = Object.entries(ITEMS).map(([id, it]) => `
        <div class="item ${inv[id] ? '' : 'none'}" title="${it.desc}">
          <div class="item-icon">${it.icon}</div>
          <div class="item-name">${it.name}</div>
          <div class="item-count">×${inv[id] || 0}</div>
        </div>`).join('');
      body.innerHTML = `<div class="coins-big">🪙 ${inv.coins} coins</div><div class="item-grid">${cells}</div>
        <p class="hint">Sell resources at the Ranch Shop stall. Hover an item for details.</p>`;
    } else if (this.tab === 'party') {
      body.innerHTML = `<div class="empty-state"><div class="big">🥚</div><h3>No creatures yet</h3>
        <p>Creatures roam the wilds in <b>Stage 2</b>, and you can befriend them with Bond Orbs in <b>Stage 3</b>.</p></div>`;
    } else {
      body.innerHTML = `<div class="empty-state"><div class="big">📖</div><h3>Creature Dex</h3>
        <p>30 original creatures across 6 types are coming in <b>Stage 2</b>. Every creature you see or befriend will be logged here.</p></div>`;
    }
  }
}

export class PauseMenu {
  constructor(root, game) {
    this.game = game;
    this.el = h(`
      <div class="pause hidden">
        <div class="pause-card">
          <h2>Paused</h2>
          <div class="room-box hidden">Room code <b class="pause-code"></b> <button class="btn small" data-a="copy">📋 Copy</button></div>
          <button class="btn primary" data-a="resume">▶ Resume</button>
          <button class="btn host-only" data-a="save">💾 Save Ranch</button>
          <button class="btn host-only" data-a="export">⬇ Export Save</button>
          <label class="btn file host-only">⬆ Import Save<input type="file" accept=".json,application/json" hidden></label>
          <p class="hint guest-only">The host keeps the save file for your shared ranch.</p>
          <div class="slider"><span>🔊 Volume</span><input type="range" min="0" max="1" step="0.05" data-a="vol"></div>
          <div class="slider"><span>🖱 Sensitivity</span><input type="range" min="0.0008" max="0.005" step="0.0001" data-a="sens"></div>
          <button class="btn danger" data-a="quit">⏏ Save & Quit to Menu</button>
          <p class="hint">Click the game to keep playing.</p>
        </div>
      </div>`);
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    q('[data-a=resume]').onclick = () => game.resume();
    q('[data-a=save]').onclick = () => { game.save(); game.toast('Ranch saved!', 'good'); };
    q('[data-a=export]').onclick = () => game.exportSave();
    q('input[type=file]').onchange = (e) => { const f = e.target.files[0]; if (f) game.importSave(f); e.target.value = ''; };
    q('[data-a=quit]').onclick = () => game.quitToMenu();
    q('[data-a=copy]').onclick = () => {
      navigator.clipboard?.writeText(game.net.code || '').then(() => game.toast('Room code copied!', 'good'), () => {});
    };
    const vol = q('[data-a=vol]'); vol.value = game.audio.volume;
    vol.oninput = () => { game.audio.volume = +vol.value; if (game.audio.master) game.audio.master.gain.value = +vol.value; };
    const sens = q('[data-a=sens]');
    sens.oninput = () => { game.player.sensitivity = +sens.value; };
    this.sens = sens;
  }

  setRole(role) {
    const guest = role === 'guest';
    this.el.querySelectorAll('.host-only').forEach((e) => e.classList.toggle('hidden', guest));
    this.el.querySelectorAll('.guest-only').forEach((e) => e.classList.toggle('hidden', !guest));
    this.el.querySelector('[data-a=quit]').textContent = guest ? '⏏ Leave Ranch' : '⏏ Save & Quit to Menu';
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
    if (!v) return;
    if (this.game.player) this.sens.value = this.game.player.sensitivity;
    const code = this.game.net.code;
    this.el.querySelector('.room-box').classList.toggle('hidden', !code);
    if (code) this.el.querySelector('.pause-code').textContent = code;
    this.setRole(this.game.net.role);
  }
}
