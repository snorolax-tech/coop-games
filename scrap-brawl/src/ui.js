// DOM menus + HUD.
import { PARTS, SLOTS, SLOT_NAMES, slotId, computeStats } from './parts.js';

export const COLORS = ['#ff8a3d', '#3dd6c6'];
export const NAMES = ['ORANGE', 'TEAL'];

const h = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };

export class UI {
  constructor(root, cb) {
    this.root = root;
    this.cb = cb;
    // ---- menu
    this.menu = h('div', 'menu', `
      <div class="title">SCRAP<span>BRAWL</span></div>
      <div class="sub">Grab junk. Bolt it on. Wreck your friend.</div>
      <div class="btns">
        <button data-a="host">Host Game</button>
        <div class="join"><input maxlength="5" placeholder="CODE" /><button data-a="join">Join</button></div>
        <button data-a="practice" class="alt">Practice vs Bot</button>
      </div>
      <div class="status"></div>
      <div class="help">
        <b>Build phase:</b> click parts on the conveyor. Arm parts: <b>left-click</b> = left arm, <b>right-click</b> = right arm.<br>
        <b>Fight:</b> WASD move · Mouse aim · <b>LMB / RMB</b> left / right arm · <b>Space</b> jump · <b>Shift</b> back part · <b>Q</b> dash · <b>E</b> bolt on a dropped part<br>
        Best of 5. Loser of each round gets first pick next round.
      </div>
      <div class="ver"></div>`);
    this.menu.querySelector('[data-a=host]').onclick = () => cb.onHost();
    this.menu.querySelector('[data-a=practice]').onclick = () => cb.onPractice();
    const inp = this.menu.querySelector('input');
    const join = () => { if (inp.value.trim().length >= 4) cb.onJoin(inp.value); };
    this.menu.querySelector('[data-a=join]').onclick = join;
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); };
    root.appendChild(this.menu);

    // ---- lobby
    this.lobby = h('div', 'panel lobby hidden', `<div>Your garage code</div><div class="code"></div><div class="small">Send it to your friend. Waiting for them to join…</div><button>Cancel</button>`);
    this.lobby.querySelector('button').onclick = () => cb.onLeave();
    root.appendChild(this.lobby);

    // ---- HUD
    this.hud = h('div', 'hud hidden');
    this.hud.innerHTML = `
      <div class="top"><div class="score"></div><div class="timer"></div><div class="round"></div></div>
      <div class="banner"></div>
      <div class="warn"></div>
      <div class="prompt"></div>
      <div class="build panel"></div>
      <div class="me"></div>
      <div class="foe"></div>
      <div class="cross">+</div>
      <div class="tip"></div>
      <div class="end panel hidden"><div class="endt"></div><button data-a="rematch">Rematch</button><button data-a="menu" class="alt">Main Menu</button><div class="small rm"></div></div>
      <div class="lock">Click to fight</div>
      <div class="floaters"></div>`;
    root.appendChild(this.hud);
    const q = (s) => this.hud.querySelector(s);
    this.el = { score: q('.score'), timer: q('.timer'), round: q('.round'), banner: q('.banner'), warn: q('.warn'), prompt: q('.prompt'),
      build: q('.build'), me: q('.me'), foe: q('.foe'), cross: q('.cross'), tip: q('.tip'), end: q('.end'), endt: q('.endt'), rm: q('.rm'),
      lock: q('.lock'), floaters: q('.floaters') };
    q('[data-a=rematch]').onclick = () => cb.onRematch();
    q('[data-a=menu]').onclick = () => cb.onLeave();
    this.floaters = [];
    this._cache = {};
  }

  set(el, html) { if (this._cache[el] !== html) { this._cache[el] = html; this.el[el].innerHTML = html; } }
  show(el, on) { this.el[el].style.display = on ? '' : 'none'; }

  showMenu(on, status = '', bad = false) {
    this.menu.classList.toggle('hidden', !on);
    this.hud.classList.toggle('hidden', on);
    if (on) this.lobby.classList.add('hidden');
    this.status(status, bad);
  }
  status(msg, bad) { const s = this.menu.querySelector('.status'); s.textContent = msg || ''; s.classList.toggle('bad', !!bad); }
  version(v) { this.menu.querySelector('.ver').textContent = 'build ' + v; }
  showLobby(code) { this.menu.classList.add('hidden'); this.lobby.classList.remove('hidden'); this.lobby.querySelector('.code').textContent = code; }
  hideLobby() { this.lobby.classList.add('hidden'); }

  tooltip(text, x, y) {
    const t = this.el.tip;
    if (!text) { t.style.display = 'none'; return; }
    t.style.display = 'block'; t.innerHTML = text; t.style.left = x + 16 + 'px'; t.style.top = y + 12 + 'px';
  }

  floater(text, color, world) { const e = h('div', 'float', text); e.style.color = color; this.el.floaters.appendChild(e); this.floaters.push({ e, world, t: 0 }); }
  updateFloaters(dt, project) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt;
      if (f.t > 0.9) { f.e.remove(); this.floaters.splice(i, 1); continue; }
      const p = project(f.world[0], f.world[1] + f.t * 2, f.world[2]);
      if (!p) { f.e.style.display = 'none'; continue; }
      f.e.style.display = ''; f.e.style.left = p.x + 'px'; f.e.style.top = p.y + 'px'; f.e.style.opacity = 1 - f.t / 0.9;
    }
  }

  /** everything that depends on state; called each frame */
  update(g) {
    const s = g.state; if (!s) return;
    const me = g.me, foe = 1 - me;
    const ph = s.phase;
    this.set('score', `<span style="color:${COLORS[0]}">${NAMES[0]}${me === 0 ? ' (you)' : ''}</span> ${s.score[0]} – ${s.score[1]} <span style="color:${COLORS[1]}">${NAMES[1]}${me === 1 ? ' (you)' : ''}</span>`);
    this.set('round', ph === 'lobby' ? '' : `Round ${s.round}`);
    this.set('timer', (ph === 'build' || ph === 'fight') ? fmt(s.timer) : '');

    let banner = '';
    if (ph === 'build') {
      if (s.firstPickT > 0) banner = s.firstPick === me ? `<b>FIRST PICK!</b> Only you can grab for ${Math.ceil(s.firstPickT)}s` : `<span style="color:${COLORS[foe]}">${NAMES[foe]}</span> gets first pick… ${Math.ceil(s.firstPickT)}`;
      else if (s.timer > BUILD_HINT_UNTIL(s)) banner = 'BUILD YOUR MECH!';
      else if (s.timer < 5) banner = `Fight in ${Math.ceil(s.timer)}`;
    } else if (ph === 'countdown') banner = `<span class="big">${Math.ceil(s.timer)}</span>`;
    else if (ph === 'fight' && s.timer > FIGHT_GO(s)) banner = '<span class="big">BRAWL!</span>';
    else if (ph === 'roundover') banner = s.roundWinner === me ? '<span class="big" style="color:#7f7">ROUND WON</span>' : '<span class="big" style="color:#f77">WRECKED</span>';
    this.set('banner', banner);

    let warn = '';
    if (ph === 'fight') {
      if (s.mg?.warn) warn = '🧲 MAGNET INCOMING!';
      else if (s.mg?.on) warn = '🧲 MAGNET!';
      else if (s.cr?.warn) warn = '⚠ CRUSHER!';
    }
    this.set('warn', warn);

    // build panel
    const building = ph === 'build';
    this.show('build', building);
    if (building) this.set('build', partsPanel(s.players[me].parts, true));

    const fighting = ph === 'fight' || ph === 'countdown' || ph === 'roundover';
    this.show('me', fighting); this.show('foe', fighting); this.show('cross', fighting && g.locked);
    if (fighting) {
      const P = s.players[me], F = s.players[foe];
      this.set('me', hpBar(P, COLORS[me], 'YOU') + chips(P.parts) + abilities(g));
      this.set('foe', hpBar(F, COLORS[foe], NAMES[foe] + (g.mode === 'practice' ? ' BOT' : '')) + chips(F.parts));
    }
    this.show('lock', fighting && !g.locked && ph !== 'roundover');
    this.set('prompt', g.pickupHint ? `<b>E</b> bolt on ${PARTS[g.pickupHint.part].name}` : '');

    // match over
    const over = ph === 'matchover';
    this.el.end.classList.toggle('hidden', !over);
    if (over) {
      this.set('endt', s.matchWinner === me ? '<span style="color:#7f7">YOU WIN THE MATCH!</span>' : `<span style="color:#f77">${NAMES[s.matchWinner]} WINS</span>`);
      const r = s.rematch || [false, false];
      this.set('rm', g.mode === 'practice' ? '' : r[me] ? 'Waiting for your friend…' : r[foe] ? 'Your friend wants a rematch!' : '');
    }
  }
}

const BUILD_HINT_UNTIL = () => 41;
const FIGHT_GO = () => 118.5;
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function hpBar(P, color, label) {
  const k = Math.max(0, P.hp / P.maxHp);
  return `<div class="hpl">${label} <span>${Math.ceil(P.hp)}/${P.maxHp}</span></div><div class="hp"><div style="width:${k * 100}%;background:${color}"></div></div>`;
}
function chips(parts) {
  return '<div class="chips">' + SLOTS.map((s) => {
    const p = parts[s];
    if (!p) return '';
    const k = Math.max(0, p.hp / p.max);
    return `<div class="chip"><span>${PARTS[p.id].name}</span><i style="width:${k * 100}%"></i></div>`;
  }).join('') + '</div>';
}
function abilities(g) {
  const p = g.pilot; if (!p) return '';
  const backId = slotId(p.parts, 'back');
  const out = [`<div class="ab ${p.dashCd <= 0 ? 'ready' : ''}">Q Dash${p.dashCd > 0 ? ' ' + p.dashCd.toFixed(1) : ''}</div>`];
  if (backId) {
    const b = PARTS[backId];
    if (b.back.type === 'jet') out.push(`<div class="ab ready">Shift Jet ${'▮'.repeat(Math.ceil(p.fuel / b.back.fuel * 5))}</div>`);
    else out.push(`<div class="ab ${p.backCd <= 0 ? 'ready' : ''}">Shift ${b.name}${p.backCd > 0 ? ' ' + p.backCd.toFixed(1) : ''}</div>`);
  }
  return `<div class="abs">${out.join('')}</div>`;
}
function partsPanel(parts, help) {
  const st = computeStats(parts);
  const rows = SLOTS.map((s) => {
    const id = slotId(parts, s);
    const name = id ? PARTS[id].name : '<i>empty</i>';
    return `<div class="row"><span>${SLOT_NAMES[s]}</span><b class="${parts[s] ? 'got' : ''}">${name}</b></div>`;
  }).join('');
  const bar = (label, v, max) => `<div class="stat"><span>${label}</span><div class="sb"><div style="width:${Math.min(100, v / max * 100)}%"></div></div></div>`;
  return `<div class="pt">YOUR MECH</div>${rows}
    ${bar('Speed', st.speed, 16)}${bar('Power', st.dmgMult, 1.6)}${bar('HP', st.maxHp, 175)}${bar('Weight', st.weight, 28)}
    ${help ? '<div class="small">Click parts on the belt.<br>Arms: <b>left-click</b> = left arm, <b>right-click</b> = right arm.<br>Heavier = slower but hits harder.</div>' : ''}`;
}
export function partTooltip(id) {
  const p = PARTS[id];
  const slot = p.kind === 'arm' ? 'Arm' : SLOT_NAMES[p.kind];
  return `<b>${p.name}</b> <span class="k">${slot}</span><br>${p.desc}<br><span class="k">weight ${p.weight}</span>`;
}
