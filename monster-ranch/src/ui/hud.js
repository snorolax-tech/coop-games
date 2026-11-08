// In-game HUD: crosshair, look-at label, hotbar, clock/zone, coins, toasts, zone banner.
import { HOTBAR, ITEMS } from '../data/items.js';
import { ZONES, zoneTitle } from '../world/zones.js';
import { portrait } from '../creatures/portraits.js';
import { xpToNext } from '../battle/rules.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class HUD {
  constructor(root, game) {
    this.game = game;
    this.el = h(`
      <div class="hud hidden">
        <div class="crosshair"><span></span></div>
        <div class="hold-ring"><i></i></div>
        <div class="click-hint hidden">🖱️ Click (or press any key) to keep playing</div>
        <div class="xp-gain hidden"><div class="xp-title"></div><div class="xp-rows"></div></div>
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
        this.slots[i].querySelector('.slot-name').textContent = lead ? `${this.game.creatureName(lead)} Lv ${lead.level} · XP ${lead.xp}/${xpToNext(lead.level)}  (Q: next)` : 'Partner';
        let xb = this.slots[i].querySelector('.slot-xp');
        if (!xb) { xb = document.createElement('div'); xb.className = 'slot-xp'; xb.innerHTML = '<i></i>'; this.slots[i].appendChild(xb); }
        xb.style.display = lead ? '' : 'none';
        if (lead) xb.querySelector('i').style.width = `${Math.min(100, (lead.xp / xpToNext(lead.level)) * 100)}%`;
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

  setClickHint(v) { this.$('.click-hint').classList.toggle('hidden', !v); }

  /**
   * "XP gained" popup: one row per creature with an animated XP bar.
   * gains: [{ sp, shiny, name, gain, ups, fromPct, lvl, xp, next }]
   */
  showXp(gains, title) {
    const box = this.$('.xp-gain');
    this.$('.xp-title').textContent = title || '✨ Experience gained';
    const rows = this.$('.xp-rows');
    rows.innerHTML = gains.map((g, i) => `
      <div class="xp-row">
        <img src="${portrait(g.sp, g.shiny)}" alt="">
        <div class="xp-info">
          <div class="xp-name"><b>${g.name}</b> <span class="xp-lv">Lv ${g.ups ? g.lvl - g.ups : g.lvl}</span>
            <span class="xp-plus">+${g.gain} XP</span>${g.ups ? `<span class="xp-up hidden" data-up="${i}">⬆ LEVEL UP! Lv ${g.lvl}</span>` : ''}</div>
          <div class="xp-bar"><i data-bar="${i}" style="width:${Math.min(100, g.fromPct * 100)}%"></i></div>
          <div class="xp-text">${g.xp} / ${g.next} XP to Lv ${g.lvl + 1}</div>
        </div>
      </div>`).join('');
    box.classList.remove('hidden', 'out');
    void box.offsetWidth;
    // animate each bar: fill up (wrapping around on level-ups), then settle on the new amount
    gains.forEach((g, i) => {
      const bar = rows.querySelector(`[data-bar="${i}"]`);
      const final = `${Math.min(100, (g.xp / g.next) * 100)}%`;
      if (g.ups) {
        setTimeout(() => { bar.style.width = '100%'; }, 80);
        setTimeout(() => {
          bar.style.transition = 'none'; bar.style.width = '0%';
          rows.querySelector(`[data-up="${i}"]`)?.classList.remove('hidden');
          const lv = bar.closest('.xp-row').querySelector('.xp-lv'); if (lv) lv.textContent = `Lv ${g.lvl}`;
          void bar.offsetWidth;
          bar.style.transition = ''; bar.style.width = final;
        }, 750);
      } else {
        setTimeout(() => { bar.style.width = final; }, 80);
      }
    });
    clearTimeout(this._xpHide);
    const long = gains.some((g) => g.ups) ? 5200 : gains.length > 1 ? 4200 : 2600;
    this._xpHide = setTimeout(() => { box.classList.add('out'); setTimeout(() => box.classList.add('hidden'), 400); }, long);
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
    this.$('.zone-name').textContent = zoneTitle(id);
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
