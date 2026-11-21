// Menus, HUD, and the crafting bench screen.
import { analyze, formLabel, PROP_INFO, PROPS, MAX_PARTS, BASE } from './items.js';

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
      <div class="prompt"></div>
      <div class="toasts"></div>
      <div class="held"></div>
      <div class="hp"><div></div><span></span></div>
      <div class="bar"></div>
      <div class="friend"></div>
      <div class="hurt"></div>
      <div class="downed hidden">YOU'RE DOWN<br><small>Your friend can revive you (hold E)</small></div>
      <div class="lock">Click to play</div>
      <div class="over panel hidden"><div class="ot"></div><div class="os"></div><button>Play Again</button><button class="alt" data-a="menu">Main Menu</button><div class="small orr"></div></div>`);
    root.appendChild(this.hud);
    const q = (s) => this.hud.querySelector(s);
    this.el = { phase: q('.phase'), sub: q('.sub2'), code: q('.code'), prompt: q('.prompt'), toasts: q('.toasts'), held: q('.held'),
      hp: q('.hp div'), hpt: q('.hp span'), bar: q('.bar'), friend: q('.friend'), hurt: q('.hurt'), downed: q('.downed'), lock: q('.lock'),
      over: q('.over'), ot: q('.ot'), os: q('.os'), orr: q('.orr'), cross: q('.cross') };
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

  update(g) {
    const s = g.state, p = g.player;
    if (!s || !p) return;
    if (s.ph === 'day') {
      this.set('phase', `☀ DAY ${s.day}`);
      const ready = s.skip.filter(Boolean).length, need = g.director ? g.director.nPlayers : (g.mode === 'guest' ? 2 : 1);
      this.set('sub', `${fmt(s.t)} until nightfall · <span class="k">N</span> ready for night${need > 1 ? ` (${ready}/${need})` : ''}`);
    } else if (s.ph === 'night') { this.set('phase', `🌙 NIGHT ${s.day}`); this.set('sub', `${s.left} zombies left · ${s.kills} killed`); }
    else { this.set('phase', ''); this.set('sub', ''); }
    this.set('code', g.mode === 'host' && g.net.code ? `Town code: <b>${g.net.code}</b>${g.net.connected ? ' · friend connected' : ' · waiting for friend'}` : '');
    const hp = Math.max(0, p.hp);
    this.el.hp.style.width = hp + '%';
    this.el.hp.style.background = hp > 50 ? '#5fd35f' : hp > 25 ? '#f2c230' : '#e63946';
    this.set('hpt', `❤ ${Math.ceil(hp)}`);
    this.el.hurt.style.opacity = Math.max(0, p.hurtT * 1.5);
    this.el.downed.classList.toggle('hidden', !p.down || s.ph === 'over');
    // hotbar
    this.set('bar', p.inv.map((it, i) => {
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
