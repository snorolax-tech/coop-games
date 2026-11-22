// Menus, HUD, and the crafting bench screen.
import { analyze, formLabel, PROP_INFO, PROPS, MAX_PARTS, BASE } from './items.js';
import { HOTBAR } from './player.js';

const h = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export function propChips(P, max = 99) {
  return PROPS.filter((p) => P[p] > 0).sort((a, b) => P[b] - P[a]).slice(0, max)
    .map((p) => `<span class="chip" style="border-color:${PROP_INFO[p][1]}">${PROP_INFO[p][0]} ${p}${P[p] > 1 ? ' ×' + P[p] : ''}</span>`).join('');
}
function icon(P) { return PROPS.filter((p) => P[p] > 0).sort((a, b) => P[b] - P[a]).slice(0, 2).map((p) => PROP_INFO[p][0]).join(''); }

export class UI {
  constructor(root, cb) {
    this.root = root; this.cb = cb;
    this.menu = h('div', 'menu', `
      <div class="title">JUNKTOWN<span>NIGHTS</span></div>
      <div class="sub">Scavenge by day. Craft anything. Survive the night.</div>
      <div class="btns">
        <button data-a="host">Host Game</button>
        <div class="join"><input maxlength="5" placeholder="CODE" /><button data-a="join">Join</button></div>
        <button data-a="solo" class="alt">Play Solo</button>
      </div>
      <div class="status"></div>
      <div class="help">
        <b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>Mouse</b> look · <b>Click</b> use held item<br>
        <b>E</b> search / pick up / craft at the workbench / revive · <b>1–0</b> or <b>wheel</b> pick item · <b>G</b> drop · <b>N</b> ready for night<br>
        No recipes: every item has properties (🔪 sharp, 🔥 flammable, ⚡ electric…). Combine any 2–3 things and see what you get.
      </div>
      <div class="ver"></div>`);
    this.menu.querySelector('[data-a=host]').onclick = () => cb.onHost();
    this.menu.querySelector('[data-a=solo]').onclick = () => cb.onSolo();
    const inp = this.menu.querySelector('input');
    const join = () => { if (inp.value.trim().length >= 4) cb.onJoin(inp.value); };
    this.menu.querySelector('[data-a=join]').onclick = join;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); };
    root.appendChild(this.menu);

    this.hud = h('div', 'hud hidden', `
      <div class="top"><div class="phase"></div><div class="sub2"></div></div>
      <div class="code"></div>
      <div class="cross">+</div>
      <div class="hm"><i></i><i></i><i></i><i></i></div>
      <div class="prompt"></div>
      <div class="toasts"></div>
      <div class="held"></div>
      <div class="hp"><div></div><span></span></div>
      <div class="bar"></div>
      <div class="friend"></div>
      <div class="hurt"></div>
      <div class="downed hidden">YOU'RE DOWN<br><small>Your friend can revive you (hold E)</small></div>
      <div class="lock">Click to play</div>
      <div class="bossbar hidden"><div class="bn"></div><div class="bb"><div></div></div></div>
      <div class="count"></div>
      <div class="dusk"></div>
      <div class="stunfx"></div>
      <div class="scare"><svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="sk" cx="50%" cy="35%" r="65%"><stop offset="0" stop-color="#b9b8a6"/><stop offset=".6" stop-color="#6d6b5c"/><stop offset="1" stop-color="#1c1b16"/></radialGradient><filter id="gr"><feTurbulence baseFrequency=".9" numOctaves="2" result="n"/><feColorMatrix type="saturate" values="0"/><feBlend in="SourceGraphic" mode="multiply"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs><g filter="url(#gr)"><path d="M100 4 C150 4 182 50 178 110 C176 160 160 210 130 246 C118 258 82 258 70 246 C40 210 24 160 22 110 C18 50 50 4 100 4 Z" fill="url(#sk)"/><path d="M38 70 C50 52 82 54 92 78 C96 104 80 124 60 122 C40 118 30 92 38 70 Z" fill="#050505"/><path d="M162 70 C150 52 118 54 108 78 C104 104 120 124 140 122 C160 118 170 92 162 70 Z" fill="#050505"/><circle cx="66" cy="94" r="3.5" fill="#f4f1e0"/><circle cx="134" cy="92" r="3.5" fill="#f4f1e0"/><path d="M96 120 L92 150 L108 150 L104 120 Z" fill="#2a2820"/><path d="M60 170 C62 150 138 150 140 170 C146 214 124 248 100 248 C76 248 54 214 60 170 Z" fill="#0a0303"/><path d="M64 168 L70 184 L76 166 L82 186 L88 164 L94 188 L100 163 L106 188 L112 164 L118 186 L124 166 L130 184 L136 168" fill="#cfc9a8"/><path d="M70 236 L76 220 L82 238 L90 218 L96 240 L104 218 L110 240 L118 220 L124 238 L130 222" fill="#b8b291"/><path d="M58 128 L54 160 M146 126 L150 158" stroke="#3a3628" stroke-width="3"/><path d="M60 122 L58 140 M140 120 L141 136" stroke="#5a0a0a" stroke-width="2"/><path d="M110 8 L104 40 L116 58 M60 20 L72 44" stroke="#2a281e" stroke-width="2" fill="none"/></g></svg></div>
      <div class="over panel hidden"><div class="ot"></div><div class="os"></div><button>Play Again</button><button class="alt" data-a="menu">Main Menu</button><div class="small orr"></div></div>`);
    root.appendChild(this.hud);
    const q = (s) => this.hud.querySelector(s);
    this.el = { phase: q('.phase'), sub: q('.sub2'), code: q('.code'), prompt: q('.prompt'), toasts: q('.toasts'), held: q('.held'),
      hp: q('.hp div'), hpt: q('.hp span'), bar: q('.bar'), friend: q('.friend'), hurt: q('.hurt'), downed: q('.downed'), lock: q('.lock'),
      over: q('.over'), ot: q('.ot'), os: q('.os'), orr: q('.orr'), cross: q('.cross'),
      bossbar: q('.bossbar'), bn: q('.bn'), bb: q('.bb div'), count: q('.count'), dusk: q('.dusk'), stunfx: q('.stunfx'), scare: q('.scare') };
    q('.over button').onclick = () => cb.onRestart();
    q('.over [data-a=menu]').onclick = () => cb.onLeave();
    this.cache = {};

    // crafting screen
    this.craft = h('div', 'craft hidden', `
      <div class="ctitle">🔧 WORKBENCH <small>pick 2–3 things to combine (crafted items count too)</small></div>
      <div class="cgrid"></div>
      <div class="cmid"><div class="cslots"></div><div class="arrow">➜</div><div class="preview"></div></div>
      <div class="cbtns"><button data-a="craft">Craft it!</button><button class="alt" data-a="close">Close (E)</button></div>`);
    root.appendChild(this.craft);

    // inventory screen
    this.inv = h('div', 'invp hidden', `
      <div class="ctitle">🎒 INVENTORY <small>drag items to move them (or click one, then click where it goes) · right-click or drag off the window to drop · Tab / E to close</small></div>
      <div class="invcols">
        <div class="invleft">
          <div class="ilabel">Hotbar (1–0)</div><div class="igrid hot"></div>
          <div class="ilabel">Backpack</div><div class="igrid pack"></div>
          <div class="istore"><div class="ilabel">🔒 Base storage <span class="k">(shared with your friend, stays between nights)</span></div><div class="igrid store"></div></div>
          <div class="ilabel nostore k">Stand next to the blue locker at base to use shared storage.</div>
        </div>
        <div class="idetail"></div>
      </div>
      <div class="cbtns"><button class="alt" data-a="close">Close (Tab)</button></div>`);
    root.appendChild(this.inv);
    this.inv.querySelector('[data-a=close]').onclick = () => cb.onCloseInv();
    this.drag = null;
    this.craft.querySelector('[data-a=close]').onclick = () => cb.onCloseCraft();
    this.craft.querySelector('[data-a=craft]').onclick = () => cb.onCraft(this.picked);
    this.picked = [];
  }

  set(k, html) { if (this.cache[k] !== html) { this.cache[k] = html; this.el[k].innerHTML = html; } }
  showMenu(on, msg = '', bad = false) { this.menu.classList.toggle('hidden', !on); this.hud.classList.toggle('hidden', on); this.status(msg, bad); if (on) this.closeCraft(); }
  status(msg, bad) { const s = this.menu.querySelector('.status'); s.textContent = msg || ''; s.classList.toggle('bad', !!bad); }
  version(v) { this.menu.querySelector('.ver').textContent = 'build ' + v; }

  toast(msg, color = '#fff') {
    const t = h('div', 'toast', msg); t.style.color = color;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.classList.add('fade'), 2800);
    setTimeout(() => t.remove(), 3400);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
  }

  hitMarker(kill) {
    const e = this.hud.querySelector('.hm');
    e.classList.remove('on', 'kill'); void e.offsetWidth; e.classList.add(kill ? 'kill' : 'on');
  }

  jumpScare() {
    const e = this.el.scare;
    e.classList.remove('go'); void e.offsetWidth; e.classList.add('go');
  }

  update(g) {
    const s = g.state, p = g.player;
    if (!s || !p) return;
    // boss health bar
    this.el.bossbar.classList.toggle('hidden', !s.boss);
    if (s.boss) { this.set('bn', s.boss.name); this.el.bb.style.width = s.boss.hp + '%'; }
    // big countdown before night + red dusk
    const counting = s.ph === 'day' && s.t <= 10;
    this.set('count', counting ? `<div class="cl">NIGHT FALLS IN</div>${Math.ceil(s.t)}` : '');
    this.el.dusk.style.opacity = s.ph === 'day' && s.t < 30 ? (30 - s.t) / 30 * 0.55 : 0;
    this.el.stunfx.style.opacity = p.stunT > 0 ? Math.min(1, p.stunT) : 0;
    if (s.ph === 'day') {
      this.set('phase', s.t <= 30 ? `<span style="color:#ff6a4a">☀ DAY ${s.day}</span>` : `☀ DAY ${s.day}`);
      const ready = s.skip.filter(Boolean).length, need = g.director ? g.director.nPlayers : (g.mode === 'guest' ? 2 : 1);
      this.set('sub', `${fmt(s.t)} until nightfall · <span class="k">N</span> ready for night${need > 1 ? ` (${ready}/${need})` : ''}`);
    } else if (s.ph === 'night') { this.set('phase', `🌙 NIGHT ${s.day}`); this.set('sub', `${s.left} zombies left · ${s.kills} killed${s.blackout ? ' · <span style="color:#ff6a4a">⚡ POWER OUT</span>' : ''}`); }
    else { this.set('phase', ''); this.set('sub', ''); }
    this.set('code', g.mode === 'host' && g.net.code ? `Town code: <b>${g.net.code}</b>${g.net.connected ? ' · friend connected' : ' · waiting for friend'}` : '');
    const hp = Math.max(0, p.hp);
    this.el.hp.style.width = hp + '%';
    this.el.hp.style.background = hp > 50 ? '#5fd35f' : hp > 25 ? '#f2c230' : '#e63946';
    this.set('hpt', `❤ ${Math.ceil(hp)}`);
    this.el.hurt.style.opacity = Math.max(0, p.hurtT * 1.5);
    this.el.downed.classList.toggle('hidden', !p.down || s.ph === 'over');
    // hotbar
    this.set('bar', p.inv.slice(0, HOTBAR).map((it, i) => {
      if (!it) return `<div class="slot${i === p.sel ? ' sel' : ''}"><i>${(i + 1) % 10}</i></div>`;
      const a = analyze(it.parts);
      const u = a.maxUses > 1 ? `<b style="width:${Math.max(0, it.uses / a.maxUses * 100)}%"></b>` : '';
      return `<div class="slot${i === p.sel ? ' sel' : ''}"><i>${(i + 1) % 10}</i><div class="ic">${icon(a.P)}</div><div class="nm">${a.name}</div>${u}</div>`;
    }).join(''));
    const it = p.held;
    if (it) {
      const a = analyze(it.parts);
      this.set('held', `<b>${a.name}</b> <span class="k">${formLabel(a.form)}</span><br>${a.desc.replace('\n', '<br>')}`);
    } else this.set('held', '');
    this.set('prompt', g.prompt || '');
    const fr = g.friendPose;
    this.set('friend', fr ? `Friend ${fr.down ? '<span style="color:#f77">DOWN!</span>' : `❤ ${fr.hp}`} · ${Math.round(Math.hypot(fr.x - p.pos.x, fr.z - p.pos.z))}m` : '');
    this.el.lock.style.display = !g.locked && !g.crafting && s.ph !== 'over' ? '' : 'none';
    this.el.cross.style.display = g.locked ? '' : 'none';
    const over = s.ph === 'over';
    this.el.over.classList.toggle('hidden', !over);
    if (over) {
      this.set('ot', 'THE HORDE GOT YOU');
      this.set('os', `You survived <b>${s.day - 1}</b> night${s.day - 1 === 1 ? '' : 's'} · ${s.kills} zombies killed`);
      const r = s.restart || [];
      this.set('orr', g.mode === 'solo' ? '' : r[g.me] ? 'Waiting for your friend…' : r[1 - g.me] ? 'Your friend wants to go again!' : '');
    }
  }

  // ------------------------------------------------------------ inventory screen
  get invOpen() { return !this.inv.classList.contains('hidden'); }
  openInv(player, withStorage) {
    this.player = player; this.withStorage = withStorage; this.inv.classList.remove('hidden');
    this._invSig = null; this._shownDetail = null; this.pickedSlot = null; this.drag = null;
    if (!this._invHooked) {
      this._invHooked = true;
      addEventListener('mousemove', (e) => this.invOpen && this._invMouseMove(e));
      addEventListener('mouseup', (e) => this.invOpen && this._invMouseUp(e));
    }
  }
  closeInv() { this.inv.classList.add('hidden'); this.ghost?.remove(); this.ghost = null; this.drag = null; this.pickedSlot = null; }

  _slotHtml(it) {
    if (!it) return '';
    const a = analyze(it.parts);
    const u = a.maxUses > 1 && it.uses != null ? `<b style="width:${Math.max(0, it.uses / a.maxUses * 100)}%"></b>` : '';
    return `<div class="ic">${icon(a.P)}</div><div class="nm">${a.name}</div>${u}`;
  }

  /** called every frame while open; only rebuilds when something changed */
  renderInv(state) {
    const p = this.player;
    const storage = state?.storage || [];
    if (this.drag?.started) return; // don't rebuild under the mouse mid-drag
    const sig = JSON.stringify([p.inv.map((x) => x && [x.uid, x.uses]), this.withStorage && storage.map((x) => x && x.uid), p.sel, this.pickedSlot]);
    if (sig === this._invSig) return;
    this._invSig = sig;
    this.inv.querySelector('.istore').classList.toggle('hidden', !this.withStorage);
    this.inv.querySelector('.nostore').classList.toggle('hidden', !!this.withStorage);
    const fill = (sel, area, items, offset = 0) => {
      const grid = this.inv.querySelector(sel);
      grid.innerHTML = '';
      items.forEach((it, k) => {
        const idx = k + offset;
        const c = h('div', 'slot islot' + (area === 'inv' && idx === p.sel ? ' sel' : ''), (area === 'inv' && idx < HOTBAR ? `<i>${(idx + 1) % 10}</i>` : '') + this._slotHtml(it));
        c.dataset.area = area; c.dataset.idx = idx;
        if (this.pickedSlot && this.pickedSlot.area === area && this.pickedSlot.idx === idx) c.classList.add('picked');
        if (it) {
          c.onmouseenter = () => { if (!this.drag) this._detail(it); };
          c.oncontextmenu = (e) => { e.preventDefault(); if (area === 'inv') { this.cb.onDropItem(idx); this.pickedSlot = null; this._invSig = null; } };
          c.onmousedown = (e) => { if (e.button === 0) { e.preventDefault(); this.drag = { area, idx, sx: e.clientX, sy: e.clientY, started: false, html: c.innerHTML }; } };
        } else {
          c.onmousedown = (e) => { if (e.button === 0) { e.preventDefault(); this.drag = { area, idx, empty: true, sx: e.clientX, sy: e.clientY }; } };
        }
        grid.appendChild(c);
      });
    };
    fill('.hot', 'inv', p.inv.slice(0, HOTBAR));
    fill('.pack', 'inv', p.inv.slice(HOTBAR), HOTBAR);
    if (this.withStorage) fill('.store', 'store', storage);
    const pk = this.pickedSlot;
    const pkItem = pk ? (pk.area === 'inv' ? p.inv[pk.idx] : storage[pk.idx]) : null;
    if (pk && !pkItem) this.pickedSlot = null;
    if (pkItem) this._detail(pkItem); else if (!this._shownDetail) this._detail(null);
  }

  /** custom mouse drag (more reliable than the browser's drag-and-drop): also works as click-to-pick, click-to-place */
  _invMouseMove(e) {
    const d = this.drag;
    if (!d || d.empty) return;
    if (!d.started && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
      d.started = true;
      this.ghost = h('div', 'slot ghost', d.html); this.root.appendChild(this.ghost);
    }
    if (d.started) {
      this.ghost.style.left = e.clientX - 34 + 'px'; this.ghost.style.top = e.clientY - 32 + 'px';
      this.inv.querySelectorAll('.islot.over').forEach((x) => x.classList.remove('over'));
      document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.islot')?.classList.add('over');
    }
  }
  _invMouseUp(e) {
    const d = this.drag; this.drag = null;
    if (!d) return;
    this.ghost?.remove(); this.ghost = null;
    this.inv.querySelectorAll('.islot.over').forEach((x) => x.classList.remove('over'));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.islot');
    if (d.started) {
      if (target) this._dropOn(d.area, d.idx, target.dataset.area, +target.dataset.idx);
      else if (!document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.invp') && d.area === 'inv') this.cb.onDropItem(d.idx); // dragged off the window = drop it
      this.pickedSlot = null; this._invSig = null;
      return;
    }
    // a click: first click picks an item up, second click puts it down (or swaps)
    const pk = this.pickedSlot;
    if (pk && !(pk.area === d.area && pk.idx === d.idx)) { this._dropOn(pk.area, pk.idx, d.area, d.idx); this.pickedSlot = null; }
    else if (pk) this.pickedSlot = null;
    else if (!d.empty) {
      this.pickedSlot = { area: d.area, idx: d.idx };
      if (d.area === 'inv' && d.idx < HOTBAR) this.player.sel = d.idx;
    }
    this._invSig = null;
  }

  _dropOn(fromArea, fromIdx, area, idx) {
    const d = { area: fromArea, idx: fromIdx };
    const p = this.player;
    if (d.area === 'inv' && area === 'inv') { [p.inv[d.idx], p.inv[idx]] = [p.inv[idx], p.inv[d.idx]]; }
    else if (d.area === 'inv' && area === 'store') this.cb.onStore(d.idx, idx);
    else if (d.area === 'store' && area === 'inv') { if (!p.inv[idx]) this.cb.onWithdraw(d.idx, idx); else this.cb.onWithdraw(d.idx, null); }
    else if (d.area === 'store' && area === 'store') this.cb.onStorageMove(d.idx, idx);
    this._invSig = null;
  }

  _detail(it) {
    this._shownDetail = it;
    const el = this.inv.querySelector('.idetail');
    if (!it) { el.innerHTML = '<div class="k">Hover an item to see what it does.</div>'; return; }
    const a = analyze(it.parts);
    const uses = a.maxUses > 1 && it.uses != null ? `<div class="k">${a.form === 'flamer' ? `Fuel: ${(it.uses / 10).toFixed(1)}s` : a.form === 'gun' ? `Shots left: ${it.uses}` : `Durability: ${it.uses} / ${a.maxUses}`}</div>` : '';
    el.innerHTML = `<div class="pn">${a.name}</div><div class="pf">${formLabel(a.form)}</div><div class="chips">${propChips(a.P)}</div>
      <div class="pd">${a.desc.replace(/\n/g, '<br>')}</div>${uses}<div class="pp">Made from: ${it.parts.map((x) => BASE[x].name).join(', ')}</div>`;
  }

  // ------------------------------------------------------------ crafting screen
  openCraft(player) { this.player = player; this.picked = []; this.craft.classList.remove('hidden'); this.renderCraft(); }
  closeCraft() { this.craft.classList.add('hidden'); this.picked = []; }
  get crafting() { return !this.craft.classList.contains('hidden'); }

  renderCraft() {
    const p = this.player;
    const grid = this.craft.querySelector('.cgrid');
    grid.innerHTML = '';
    p.inv.forEach((it, i) => {
      const c = h('div', 'card' + (it ? '' : ' empty') + (this.picked.includes(i) ? ' picked' : ''));
      if (it) {
        const a = analyze(it.parts);
        c.innerHTML = `<div class="cn">${a.name}</div><div class="cf">${formLabel(a.form)}${it.parts.length > 1 ? ` · ${it.parts.length} parts` : ''}</div><div class="chips">${propChips(a.P, 4)}</div>`;
        c.onclick = () => {
          const k = this.picked.indexOf(i);
          if (k >= 0) this.picked.splice(k, 1);
          else if (this.picked.length < 3) this.picked.push(i);
          this.renderCraft();
        };
      } else c.innerHTML = '<div class="cf">empty</div>';
      grid.appendChild(c);
    });
    const slots = this.craft.querySelector('.cslots');
    slots.innerHTML = [0, 1, 2].map((k) => {
      const it = this.picked[k] != null ? p.inv[this.picked[k]] : null;
      return `<div class="cs">${it ? analyze(it.parts).name : '<span class="k">empty</span>'}</div>`;
    }).join('<div class="plus">+</div>');
    const pv = this.craft.querySelector('.preview');
    const btn = this.craft.querySelector('[data-a=craft]');
    const items = this.picked.map((i) => p.inv[i]);
    const parts = items.flatMap((x) => x.parts);
    if (items.length < 2) { pv.innerHTML = '<div class="k">Pick at least 2 items</div>'; btn.disabled = true; return; }
    const a = analyze(parts.slice(0, MAX_PARTS));
    const warn = parts.length > MAX_PARTS ? `<div class="warn2">Too many parts! Only the first ${MAX_PARTS} will be used.</div>` : '';
    pv.innerHTML = `<div class="pn">${a.name}</div><div class="pf">${formLabel(a.form)}</div><div class="chips">${propChips(a.P)}</div>
      <div class="pd">${a.desc.replace(/\n/g, '<br>')}</div><div class="pp">Made from: ${parts.slice(0, MAX_PARTS).map((x) => BASE[x].name).join(', ')}</div>${warn}`;
    btn.disabled = false;
  }
}
