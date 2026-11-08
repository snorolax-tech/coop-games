// In-game HUD: crosshair, look-at label, hotbar, clock/zone, coins, toasts, zone banner.
import { HOTBAR, ITEMS } from '../data/items.js';
import { ZONES } from '../world/zones.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.el = h(`
      <div class="hud hidden">
        <div class="crosshair"><span></span></div>
        <div class="hold-ring"><i></i></div>
        <div class="look"><div class="look-name"></div><div class="look-sub"></div></div>
        <div class="topleft">
          <div class="zone-pill"><span class="zone-dot"></span><span class="zone-name"></span></div>
          <div class="clock"><span class="clock-icon"></span><span class="clock-time"></span></div>
          <div class="rating-pill" title="Ranch Rating — open Tab for details">⭐ <span class="rating-text">Ranch Rating 0</span>
            <div class="rating-bar"><i></i></div></div>
        </div>
        <div class="topright">
          <div class="coins">🪙 <span class="coin-count">0</span></div>
          <div class="room hidden">🏠 Room <b class="room-code"></b> · <span class="room-players">1/2</span></div>
          <div class="keys">Tab Inventory · E Interact · 1-6 Items · F Partner · B Build · M Map · Enter Chat</div>
        </div>
        <div class="hotbar"></div>
        <div class="toasts"></div>
        <div class="banner"><div class="banner-title"></div><div class="banner-sub"></div></div>
      </div>`);
    root.appendChild(this.el);
    this.$ = (s) => this.el.querySelector(s);
    this.hotbar = this.$('.hotbar');
    this.slots = HOTBAR.map((it, i) => {
      const s = h(`<div class="slot"><div class="slot-key">${i + 1}</div><div class="slot-icon">${it.icon}</div><div class="slot-count"></div><div class="slot-name">${it.name}</div></div>`);
      this.hotbar.appendChild(s);
      return s;
    });
    this._lastLook = null;
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setHotbar(i) {
    this.slots.forEach((s, k) => s.classList.toggle('active', k === i));
    this.refreshCounts();
  }

  refreshCounts() {
    const inv = this.game.inventory;
    HOTBAR.forEach((it, i) => {
      const c = this.slots[i].querySelector('.slot-count');
      if (it.item) { c.textContent = inv[it.item] ?? 0; this.slots[i].classList.toggle('empty', !(inv[it.item] > 0)); }
      else if (it.kind === 'partner') {
        const party = this.game.party || [];
        const lead = party[0];
        c.textContent = party.length ? `${party.filter((p) => p.hp > 0).length}/${party.length}` : '';
        this.slots[i].classList.toggle('empty', !party.some((p) => p.hp > 0));
        this.slots[i].querySelector('.slot-name').textContent = lead ? `${this.game.creatureName(lead)} Lv ${lead.level}  (Q: next)` : 'Partner';
      } else c.textContent = '';
    });
    const eggs = this.game.eggs?.length || 0;
    this.$('.coin-count').textContent = inv.coins + (eggs ? `   🥚 ×${eggs}` : '');
  }

  setLook(def, sub) {
    const look = this.$('.look');
    if (!def) { look.classList.remove('on'); this.$('.crosshair').classList.remove('on'); this._lastLook = null; return; }
    if (this._lastLook !== def) {
      const n = this.$('.look-name');
      n.textContent = def.name;
      n.style.color = def.color || '';
      this._lastLook = def;
    }
    this.$('.look-sub').textContent = sub;
    look.classList.add('on');
    this.$('.crosshair').classList.add('on');
  }

  /** Progress ring for hold-E petting (0..1). */
  setHold(p) {
    const r = this.$('.hold-ring');
    r.style.opacity = p > 0.05 ? 1 : 0;
    r.querySelector('i').style.setProperty('--p', `${Math.round(p * 100)}%`);
  }

  setRating(r) {
    const next = r.next;
    this.$('.rating-text').textContent = next ? `Ranch Rating ${r.level}  ·  ${r.points}/${next}` : `Ranch Rating ${r.level} (max!)`;
    const pct = next ? ((r.points - r.prev) / (next - r.prev)) * 100 : 100;
    this.$('.rating-bar i').style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  setRoom(code) {
    this.$('.room').classList.toggle('hidden', !code);
    if (code) this.$('.room-code').textContent = code;
  }

  setPlayers(n) { this.$('.room-players').textContent = `${n}/2 ranchers`; }

  setZone(id) {
    const z = ZONES[id];
    this.$('.zone-name').textContent = z.name;
    this.$('.zone-dot').style.background = z.color;
  }

  setClock(text, night) {
    this.$('.clock-time').textContent = text;
    this.$('.clock-icon').textContent = night ? '🌙' : '☀️';
  }

  banner(title, sub, color = '#fff') {
    const b = this.$('.banner');
    this.$('.banner-title').textContent = title;
    this.$('.banner-title').style.color = color;
    this.$('.banner-sub').textContent = sub;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  }

  toast(msg, kind = '') {
    const box = this.$('.toasts');
    const t = h(`<div class="toast ${kind}"></div>`);
    t.textContent = msg;
    box.appendChild(t);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  itemToast(id, n) {
    const it = ITEMS[id];
    this.toast(`+${n} ${it.icon} ${it.name}`, 'good');
  }
}
