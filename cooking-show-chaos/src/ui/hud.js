// DOM heads-up display: tape/REC, timer, orders, banners, toasts, prompts, progress bars, PIP frame, recipe book.
import { RECIPES } from '../game/cooking.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      timer: $('timer'), money: $('money'), orders: $('orders'), recipes: $('recipes'), rec: $('rec-badge'), tape: $('tape'),
      pip: $('pip-frame'), pipLive: document.querySelector('.pip-live'), crosshair: $('crosshair'), prompt: $('prompt'), book: $('recipe-book'),
      bars: $('bars'), banner: $('banner'), toasts: $('toasts'), moments: $('moments'), foam: $('foam-overlay'), camStatus: $('cam-status'), voice: $('voice'),
    };
    this.lastMoney = 0; this.ordersKey = '';
    this.barPool = [];
    this.el.recipes.innerHTML = '<div><b>⌨ Hold TAB</b> for the step-by-step recipe book</div>' +
      '<div style="opacity:.8">🎥 Q grab camera · <b>R</b> record · only what\'s ON TAPE gets views</div>';
    this.el.book.innerHTML = `<h2>📖 How to cook</h2><div class="book-cols">${Object.values(RECIPES).map((r) => `
      <div class="book-col"><h3>${r.emoji} ${r.name}</h3><div class="book-needs">${r.parts.map((p) => `${p.e} ${p.l}`).join(' · ')}</div>
      <ol>${r.steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>`).join('')}</div>
      <div class="book-tip">💡 Burnt food 🔥 and disasters make GREAT footage — as long as you're recording!</div>`;
  }
  show(v) { this.root.classList.toggle('hidden', !v); if (!v) this.clear(); }
  clear() {
    this.el.toasts.innerHTML = ''; this.el.moments.innerHTML = ''; this.el.orders.innerHTML = '';
    this.ordersKey = ''; this.el.banner.classList.remove('show'); this.el.book.classList.add('hidden');
    this.ghost(0); this.onFire(false); this._hp = null;
  }
  health(hp, partner) {
    hp = Math.round(hp);
    if (this._hp !== hp) {
      this._hp = hp;
      const h = document.getElementById('health');
      h.querySelector('.hp-bar > div').style.width = hp + '%';
      h.querySelector('.hp-num').textContent = hp;
      h.classList.toggle('low', hp <= 30);
    }
    const pt = partner ? (partner.dead > 0 ? `👻 ${partner.name} is a ghost` : `${partner.fire > 0 ? '🔥' : '❤'} ${partner.name}: ${Math.round(partner.hp ?? 100)}`) : '';
    if (this._pt !== pt) { this._pt = pt; document.querySelector('#health .hp-partner').textContent = pt; }
  }
  hurt(a) {
    const o = document.getElementById('hurt-overlay');
    o.style.transition = 'none'; o.style.opacity = String(0.35 + a * 0.5);
    requestAnimationFrame(() => { o.style.transition = 'opacity .6s'; o.style.opacity = '0'; });
  }
  onFire(on) { if (this._fire !== on) { this._fire = on; document.getElementById('fire-overlay').classList.toggle('hidden', !on); } }
  ghost(secs) {
    const on = secs > 0;
    const el = document.getElementById('ghost-msg');
    if (this._ghost !== on) {
      this._ghost = on;
      el.classList.toggle('hidden', !on);
      document.getElementById('game-container').style.filter = on ? 'grayscale(1) brightness(.85) contrast(1.1)' : '';
    }
    if (on) { const txt = `👻 WIPED OUT 👻\nback in ${Math.ceil(secs)}…`; if (el._t !== txt) { el._t = txt; el.textContent = txt; } }
  }
  recipeBook(open) { this.el.book.classList.toggle('hidden', !open); }
  voiceStatus(text) { const v = this.el.voice; if (v._t === text) return; v._t = text; v.textContent = text; v.classList.toggle('hidden', !text); }
  // check = { type, s } of the dish you're holding / looking at, so tickets can tick off what's done
  update(st, check) {
    const rec = !!st.rec;
    if (this._rec !== rec) {
      this._rec = rec;
      this.el.rec.innerHTML = rec ? '<span class="dot"></span> REC' : '⏸ REC OFF';
      this.el.rec.classList.toggle('on', rec);
      this.el.pipLive.innerHTML = rec ? '<span class="dot"></span> REC' : '⏸ STANDBY — press R';
      this.el.pip.classList.toggle('standby', !rec);
    }
    const z = st.zoom > 1.01 ? `🔍 ${st.zoom.toFixed(1)}x` : '🔍 scroll to zoom';
    if (this._zoom !== z) { this._zoom = z; document.querySelector('.pip-rec').textContent = z; }
    const tapeTxt = `📼 ${fmt(st.rt || 0)} / ${fmt(st.tape || 90)}`;
    if (this._tape !== tapeTxt) {
      this._tape = tapeTxt;
      this.el.tape.firstChild.textContent = tapeTxt;
      this.el.tape.querySelector('.tape-bar > div').style.width = `${Math.min(100, ((st.rt || 0) / (st.tape || 90)) * 100)}%`;
    }
    const t = Math.max(0, Math.ceil(st.time));
    this.el.timer.textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.el.timer.classList.toggle('urgent', t <= 30);
    if (st.money !== this.lastMoney) {
      this.el.money.textContent = `$${st.money}`;
      this.el.money.classList.remove('bump'); void this.el.money.offsetWidth; this.el.money.classList.add('bump');
      this.lastMoney = st.money;
    }
    // orders
    const done = (r) => r.parts.map((p) => !!(check && (check.type === r.container || (r.name === 'Soup' && check.type === 'pot')) && p.test(check.s)));
    const key = st.orders.map((o) => o.id + ':' + done(RECIPES[o.r]).join('')).join(',');
    if (key !== this.ordersKey) {
      this.ordersKey = key;
      this.el.orders.innerHTML = st.orders.map((o) => {
        const r = RECIPES[o.r], d = done(r);
        const chips = r.parts.map((p, i) => `<span class="chip ${d[i] ? 'ok' : ''}">${d[i] ? '✓' : p.e} ${p.l}</span>`).join('');
        return `<div class="order" data-id="${o.id}"><div class="name">${r.emoji} ${r.name} <span class="in">→ ${r.container === 'plate' ? '🍽 plate' : '🥣 bowl'}</span></div>
          <div class="chips">${chips}</div><div class="tbar"><div></div></div></div>`;
      }).join('');
    }
    st.orders.forEach((o, i) => {
      const node = this.el.orders.children[i]; if (!node) return;
      node.querySelector('.tbar > div').style.width = `${(o.t / o.max) * 100}%`;
      node.classList.toggle('late', o.t / o.max < 0.25);
    });
  }
  chat() { /* chat only exists in the posted video now (see replay.js) */ }
  banner(title, sub) {
    const b = this.el.banner;
    b.querySelector('.title').textContent = title; b.querySelector('.sub').textContent = sub || '';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  toast(text, kind = '') {
    const d = document.createElement('div'); d.className = `toast ${kind}`; d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 2700);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }
  moment(label, gain) {
    const d = document.createElement('div'); d.className = 'moment';
    d.innerHTML = gain ? `🎥 ${esc(label)}! <span class="gain">+${gain.toLocaleString()} viewers</span>`
      : `🎬 ${esc(label)}! <span class="gain">CAPTURED ON TAPE</span>`;
    this.el.moments.appendChild(d);
    setTimeout(() => d.remove(), 2300);
    while (this.el.moments.children.length > 3) this.el.moments.firstChild.remove();
  }
  foam() {
    this.el.foam.classList.add('on');
    clearTimeout(this._foamT); this._foamT = setTimeout(() => this.el.foam.classList.remove('on'), 1800);
  }
  prompt(html, active) {
    if (this._lastPrompt !== html) { this.el.prompt.innerHTML = html; this._lastPrompt = html; }
    this.el.crosshair.classList.toggle('active', !!active);
  }
  camStatus(text) { if (this._cs !== text) { this.el.camStatus.textContent = text; this._cs = text; } }
  setPIP(rect, isStatic) {
    const p = this.el.pip;
    if (!rect) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden'); p.classList.toggle('static', !!isStatic);
    Object.assign(p.style, { left: rect.x - 4 + 'px', top: rect.y - 4 + 'px', width: rect.w + 8 + 'px', height: rect.h + 8 + 'px' });
  }
  // bars: [{x, y, frac, cls, icon}] in screen px
  bars(list) {
    while (this.barPool.length < list.length) {
      const d = document.createElement('div'); d.className = 'wbar'; d.innerHTML = '<div></div>';
      this.el.bars.appendChild(d); this.barPool.push(d);
    }
    this.barPool.forEach((d, i) => {
      const b = list[i];
      if (!b) { d.style.display = 'none'; return; }
      d.style.display = '';
      d.style.left = b.x + 'px'; d.style.top = b.y + 'px';
      d.className = 'wbar ' + (b.cls || '');
      d.firstChild.style.width = Math.max(0, Math.min(1, b.frac)) * 100 + '%';
    });
  }
}
