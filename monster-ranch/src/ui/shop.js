// Ranch Shop (buy supplies / upgrades / zone passes, sell resources) and Notice Board panels.
import { ITEMS } from '../data/items.js';
import { SUPPLIES, UPGRADES, ZONE_PASSES } from '../data/shop.js';
import { ZONES } from '../world/zones.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

class Modal {
  constructor(root, game, title) {
    this.game = game;
    this.open = false;
    this.el = h(`<div class="panel-wrap hidden"><div class="panel shop">
      <div class="panel-tabs"></div>
      <div class="panel-body"></div>
      <div class="panel-foot">E, Tab or Esc to close</div></div></div>`);
    this.title = title;
    root.appendChild(this.el);
    this.body = this.el.querySelector('.panel-body');
  }
  toggle(v = !this.open) { this.open = v; this.el.classList.toggle('hidden', !v); if (v) this.render(); }
}

export class ShopPanel extends Modal {
  constructor(root, game) { super(root, game); this.tab = 'supplies'; }

  render() {
    const g = this.game, inv = g.inventory;
    const tabs = [['supplies', '🛒 Supplies'], ['upgrades', '⭐ Upgrades'], ['zones', '🗺️ Zone Passes'], ['sell', '💰 Sell']];
    this.el.querySelector('.panel-tabs').innerHTML = tabs.map(([id, l]) => `<button class="${id === this.tab ? 'active' : ''}" data-tab="${id}">${l}</button>`).join('');
    this.el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { this.tab = b.dataset.tab; this.render(); g.audio.play('ui'); });
    let html = `<div class="coins-big">🪙 ${inv.coins} coins</div>`;
    if (this.tab === 'supplies') {
      html += `<div class="shop-grid">${SUPPLIES.map((s) => `
        <div class="shop-item"><div class="item-icon">${ITEMS[s.item].icon}</div><div class="item-name">${s.label}</div>
          <button class="btn small" data-buy="${s.id}" ${inv.coins < s.price ? 'disabled' : ''}>🪙 ${s.price}</button></div>`).join('')}</div>
        <p class="hint">Buildings are bought in Build mode (press B on the ranch).</p>`;
    } else if (this.tab === 'upgrades') {
      const up = g.upgrades;
      html += `<div class="shop-list">${Object.entries(UPGRADES).map(([id, u]) => {
        const lvl = up[id] || 0, maxed = lvl >= u.max, price = u.price[lvl];
        return `<div class="shop-row"><div class="item-icon">${u.icon}</div><div class="shop-info"><b>${u.name}</b> ${u.max > 1 ? `<small>Lv ${lvl}/${u.max}</small>` : ''}<div class="hint">${u.desc}</div></div>
          ${maxed ? '<span class="owned">✓ Owned</span>' : `<button class="btn small" data-up="${id}" ${inv.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`}</div>`;
      }).join('')}</div><p class="hint">Upgrades are shared by both ranchers.</p>`;
    } else if (this.tab === 'zones') {
      html += `<div class="shop-list">${Object.entries(ZONE_PASSES).map(([id, price]) => {
        const z = ZONES[id], open = g.unlocked.has(id);
        return `<div class="shop-row"><div class="item-icon">🎫</div><div class="shop-info"><b>${z.name} Pass</b><div class="hint">Opens the zone now instead of at Ranch Rating ${z.rating}.</div></div>
          ${open ? '<span class="owned">🔓 Open</span>' : `<button class="btn small" data-zone="${id}" ${inv.coins < price ? 'disabled' : ''}>🪙 ${price}</button>`}</div>`;
      }).join('')}</div>`;
    } else {
      const sellable = Object.entries(ITEMS).filter(([id, it]) => it.sell && inv[id] > 0);
      const total = sellable.reduce((s, [id, it]) => s + it.sell * inv[id], 0);
      html += sellable.length ? `<div class="shop-list">${sellable.map(([id, it]) => `
        <div class="shop-row"><div class="item-icon">${it.icon}</div><div class="shop-info"><b>${it.name}</b> ×${inv[id]}<div class="hint">🪙 ${it.sell} each</div></div>
          <button class="btn small" data-sell="${id}">Sell 1</button><button class="btn small" data-sellall="${id}">All (🪙 ${it.sell * inv[id]})</button></div>`).join('')}</div>
        <button class="btn primary" data-sellevery="1">💰 Sell everything for 🪙 ${total}</button>`
        : '<p class="hint">Nothing to sell yet — gather resources or collect what your happy ranch creatures produce.</p>';
    }
    this.body.innerHTML = html;
    const q = (sel, fn) => this.body.querySelectorAll(sel).forEach((b) => b.onclick = () => { fn(b); g.audio.play('ui'); });
    q('[data-buy]', (b) => g.requestShop('buy', b.dataset.buy));
    q('[data-up]', (b) => g.requestShop('upgrade', b.dataset.up));
    q('[data-zone]', (b) => g.requestShop('zone', b.dataset.zone));
    q('[data-sell]', (b) => g.requestShop('sell', b.dataset.sell, 1));
    q('[data-sellall]', (b) => g.requestShop('sell', b.dataset.sellall, 9999));
    q('[data-sellevery]', () => g.requestShop('sellAll'));
  }
}

export class BoardPanel extends Modal {
  render() {
    const g = this.game;
    this.el.querySelector('.panel-tabs').innerHTML = '<button class="active">📋 Notice Board</button>';
    const reqs = g.requests || [];
    this.body.innerHTML = `<p class="hint">Neighbours post requests here. Finish them for coins and Ranch Rating (+2 each). Requests are shared — either rancher can complete them.</p>
      <div class="shop-list">${reqs.map((r, i) => `
        <div class="shop-row req"><div class="item-icon">📌</div><div class="shop-info"><b>${r.text}</b><div class="hint">— ${r.who} · reward 🪙 ${r.reward}</div></div>
          <button class="btn small primary" data-done="${i}">Deliver</button><button class="btn small" data-reroll="${i}" title="Swap for a different request">🔄 5</button></div>`).join('')}</div>
      <p class="hint">“Show me…” requests check the creatures in <b>your party</b>. Completed: ${g.stats.requests || 0}</p>`;
    this.body.querySelectorAll('[data-done]').forEach((b) => b.onclick = () => { g.requestBoard('done', +b.dataset.done); g.audio.play('ui'); });
    this.body.querySelectorAll('[data-reroll]').forEach((b) => b.onclick = () => { g.requestBoard('reroll', +b.dataset.reroll); g.audio.play('ui'); });
  }
}
