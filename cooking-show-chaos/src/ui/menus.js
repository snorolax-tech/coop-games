// Menu screens rendered into #screen. Each function takes handlers and wires up buttons.
import { UPGRADES, SETS, upgradePrice } from '../save.js';
import { RECIPES } from '../game/cooking.js';
import { audio } from '../audio.js';

const screen = () => document.getElementById('screen');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mount(html, overlay = false) {
  const s = screen();
  s.className = overlay ? 'overlay' : '';
  s.innerHTML = html;
  s.querySelectorAll('.btn, .set-card').forEach((b) => b.addEventListener('click', () => { audio.init(); audio.play('click'); }));
  return s;
}
const on = (sel, fn) => { const el = screen().querySelector(sel); if (el) el.addEventListener('click', fn); };

export function hideScreen() { const s = screen(); s.innerHTML = ''; s.className = ''; }

export function mainMenu(save, h) {
  mount(`
    <div class="panel">
      <div class="logo">COOKING<br>SHOW<br>CHAOS</div>
      <div class="tagline">🎥 Film a live cooking show with a friend. Everything will go wrong. 🔥</div>
      <div style="margin-bottom:10px">Chef name: <input class="name" id="name" maxlength="14" value="${esc(save.name)}"></div>
      <button class="btn pink" id="host">🎬 Host Game</button>
      <button class="btn blue" id="join">🔗 Join Game</button>
      <div class="row">
        <button class="btn teal" id="solo">🍳 Play Solo</button>
        <button class="btn" id="shop">🛒 Shop</button>
      </div>
      <button class="btn gray" id="help">❓ How to Play</button>
      <div class="wallet">💰 $${save.money} · 📺 Episodes: ${save.episodes} · ⭐ Fans: ${save.fans}</div>
      <div class="settings">
        <label>🖱 Sensitivity <input type="range" id="sens" min="0.3" max="2.5" step="0.1" value="${save.settings.sens}"></label>
        <label>🔊 Volume <input type="range" id="vol" min="0" max="1" step="0.05" value="${save.settings.volume}"></label>
      </div>
    </div>`);
  const nameEl = screen().querySelector('#name');
  const getName = () => (nameEl.value.trim() || save.name || 'Chef').slice(0, 14);
  nameEl.addEventListener('input', () => h.setName(nameEl.value.trim()));
  screen().querySelector('#sens').addEventListener('input', (e) => h.setSens(+e.target.value));
  screen().querySelector('#vol').addEventListener('input', (e) => h.setVolume(+e.target.value));
  on('#host', () => h.host(getName()));
  on('#join', () => h.join(getName()));
  on('#solo', () => h.solo(getName()));
  on('#shop', h.shop);
  on('#help', h.help);
}

export function helpScreen(back) {
  mount(`
    <div class="panel">
      <h1 style="margin:0 0 6px">❓ How to Play</h1>
      <table class="controls-table">
        <tr><td><b>WASD</b></td><td>Move · <b>Shift</b> sprint · <b>Space</b> jump · <b>Mouse</b> look</td></tr>
        <tr><td><b>Left click</b></td><td>Pick up / drop / put in / serve / grab from crates</td></tr>
        <tr><td><b>Right click</b></td><td>Throw what you're holding (you can throw dishes through the window!)</td></tr>
        <tr><td><b>E</b></td><td>Use: hold to chop, burners on/off, fill pot at sink, spray extinguisher</td></tr>
        <tr><td><b>Q</b></td><td>Pick up / put down the show camera</td></tr>
        <tr><td><b>R</b></td><td>Start / stop RECORDING (while holding the camera) — your tape is limited!</td></tr>
        <tr><td><b>V</b></td><td>Mute / unmute your mic (voice chat)</td></tr>
        <tr><td><b>TAB</b></td><td>Hold for the step-by-step recipe book</td></tr>
      </table>
      <p style="text-align:left;font-size:16px;line-height:1.5">
        📋 <b>Recipes:</b> ${Object.values(RECIPES).map((r) => `${r.emoji} ${r.name}: ${r.ings.join(' ')} → ${r.container}`).join('<br>')}<br>
        🎥 <b>Only what's ON TAPE counts.</b> Grab the camera, press R to record — but the tape runs out, so save it for the good stuff. One chef cooks, the other films. Set the camera down for a static shot (half hype).<br>
        📤 After the episode you <b>post the video to ChefTube</b> and watch it together: views climb and chat reacts to what you filmed. Your voice chat is on the tape too!<br>
        🔥 Perfect dishes on camera = big views. Disasters on camera = <b>even bigger</b> views.<br>
        💰 Earn money from dishes + ad revenue, then buy upgrades in the shop.
      </p>
      <button class="btn" id="back">⬅ Back</button>
    </div>`);
  on('#back', back);
}

export function joinScreen(h) {
  mount(`
    <div class="panel">
      <h1 style="margin:0">🔗 Join a Game</h1>
      <p>Ask your friend for their room code:</p>
      <input class="code" id="code" maxlength="5" placeholder="ABCDE" autocomplete="off">
      <div class="status" id="status"></div>
      <button class="btn blue" id="go">Join!</button>
      <button class="btn gray" id="back">⬅ Back</button>
    </div>`);
  const input = screen().querySelector('#code');
  input.focus();
  const go = () => { const c = input.value.trim().toUpperCase(); if (c.length >= 4) h.connect(c); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  on('#go', go); on('#back', h.back);
}
export function setStatus(text, cls = '') {
  const s = screen().querySelector('#status'); if (s) { s.textContent = text; s.className = 'status ' + cls; }
}

export function lobbyScreen(opts, h) {
  // opts: { role: 'solo'|'host'|'client', code, friend, save, set, hostSet }
  const { role, save } = opts;
  const setsHtml = SETS.map((s) => {
    const owned = role === 'client' ? true : save.sets[s.id];
    const dim = role === 'client' ? opts.set !== s.id : !owned;
    return `<div class="set-card ${opts.set === s.id ? 'sel' : ''} ${dim ? 'locked' : ''}" data-set="${s.id}">
      <div class="ic">${s.icon}</div><b>${s.name}</b><div class="small">${owned ? s.desc : '🔒 Buy in shop'}</div></div>`;
  }).join('');
  let top = '';
  if (role === 'host') {
    top = `<h1 style="margin:0">🎬 Hosting</h1><div>Tell your friend this room code:</div>
      <div class="code-display">${opts.code ? esc(opts.code) : '…'}</div>
      <div class="status ${opts.friend ? 'ok' : ''}">${opts.error ? `<span class="status err">${esc(opts.error)}</span>` : opts.friend ? `✅ ${esc(opts.friend)} joined!` : opts.code ? '⏳ Waiting for your friend to join…' : '⏳ Getting a room code…'}</div>`;
  } else if (role === 'client') {
    top = `<h1 style="margin:0">🔗 Connected!</h1><div class="status ok">✅ In ${esc(opts.friend || 'host')}'s kitchen</div><div class="status">⏳ Waiting for the host to start the episode…</div>`;
  } else top = `<h1 style="margin:0">🍳 Solo Episode</h1><div class="small">Cook AND film. Good luck, chef.</div>`;
  const canStart = role === 'solo' || (role === 'host' && opts.friend);
  mount(`
    <div class="panel">
      ${top}
      <div style="margin-top:10px"><b>Kitchen set${role === 'client' ? ' (host picks)' : ''}:</b></div>
      <div class="sets">${setsHtml}</div>
      ${role !== 'client' ? `
        <button class="btn pink" id="start" ${canStart ? '' : 'disabled'}>▶ ${save.episodes ? 'Continue: ' : ''}Start Episode ${save.episodes + 1}</button>
        ${save.episodes ? '<button class="btn gray" id="reset">🔄 New Game (start over at Episode 1)</button>' : ''}
        ${role === 'host' && !opts.friend ? '<button class="btn teal" id="startsolo">Start without a friend</button>' : ''}
        <button class="btn" id="shop">🛒 Shop ($${save.money})</button>` : ''}
      <div class="row">
        <button class="btn ${opts.mic ? 'teal' : 'gray'}" id="mic">${opts.mic ? '🎤 Voice: ON' : '🔇 Voice: OFF'}</button>
        <button class="btn ${opts.headphones ? 'teal' : 'gray'}" id="hp">🎧 Headphones: ${opts.headphones ? 'ON' : 'OFF'}</button>
      </div>
      <div class="small">${opts.micDenied ? '⚠ Mic blocked — allow it in the address bar. ' : ''}🎧 Wearing headphones? Turn it ON for much clearer voices (disables echo-cancel processing).
        ${opts.connType ? `<br>${opts.connType === 'direct' ? '✅ Direct connection to your friend' : '⚠ Relayed connection (your networks can\'t connect directly) — voice/lag may be worse. Try a different network or turn off VPNs.'}` : ''}</div>
      <button class="btn gray" id="leave">⬅ Leave</button>
    </div>`);
  on('#mic', h.toggleMic); on('#hp', h.toggleHeadphones);
  if (role !== 'client') {
    screen().querySelectorAll('.set-card').forEach((c) => c.addEventListener('click', () => { if (save.sets[c.dataset.set]) h.pickSet(c.dataset.set); }));
    on('#start', h.start); on('#startsolo', h.startSolo); on('#shop', h.shop); on('#reset', h.reset);
  }
  on('#leave', h.leave);
}

export function shopScreen(save, h) {
  const up = UPGRADES.map((u) => {
    const lvl = save.upgrades[u.id] || 0, price = upgradePrice(save, u);
    return `<div class="shop-item"><div class="ic">${u.icon}</div><div class="info"><b>${u.name}</b> <span class="lvl">Lv ${lvl}/${u.prices.length}</span><div class="small">${u.desc}</div></div>
      ${price == null ? '<b class="lvl">MAXED ✔</b>' : `<button class="btn ${save.money >= price ? 'teal' : ''}" data-up="${u.id}" ${save.money >= price ? '' : 'disabled'}>$${price}</button>`}</div>`;
  }).join('');
  const sets = SETS.filter((s) => s.price > 0).map((s) => `<div class="shop-item"><div class="ic">${s.icon}</div><div class="info"><b>${s.name}</b><div class="small">${s.desc}</div></div>
      ${save.sets[s.id] ? '<b class="lvl">OWNED ✔</b>' : `<button class="btn ${save.money >= s.price ? 'teal' : ''}" data-set="${s.id}" ${save.money >= s.price ? '' : 'disabled'}>$${s.price}</button>`}</div>`).join('');
  mount(`
    <div class="panel">
      <h1 style="margin:0">🛒 Chef Shop</h1>
      <div class="wallet">💰 $${save.money}</div>
      <h3 style="margin:10px 0 0">Upgrades</h3>${up}
      <h3 style="margin:10px 0 0">New Kitchen Sets</h3>${sets}
      <button class="btn" id="back">⬅ Back</button>
    </div>`);
  screen().querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => h.buyUpgrade(b.dataset.up)));
  screen().querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => h.buySet(b.dataset.set)));
  on('#back', h.back);
}

export function resultsScreen(r, role, h) {
  const counts = {};
  r.served.filter((s) => s.q === 'perfect').forEach((s) => { counts[s.r] = (counts[s.r] || 0) + 1; });
  const dishes = Object.entries(counts).map(([k, n]) => `${RECIPES[k].emoji}×${n}`).join(' ') || '😬 none';
  const fails = r.served.filter((s) => s.q !== 'perfect').length;
  const stars = '⭐'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
  const verdicts = ['', 'The network is "reviewing" the show.', 'A cult classic in the making.', 'Solid TV. Mom is proud.', 'The internet is talking about you!', 'LEGENDARY EPISODE. Clip it!'];
  mount(`
    <div class="panel">
      <h1 style="margin:0">📺 That's a Wrap!</h1>
      <div class="stars">${stars}</div>
      <div class="small">${verdicts[r.stars]}</div>
      <div class="results-grid">
        <div class="stat"><div class="v">${r.perfect}</div><div class="l">Dishes served ${dishes}${fails ? `<br>+${fails} questionable ones 🤢` : ''}</div></div>
        <div class="stat"><div class="v">👁 ${r.peak.toLocaleString()}</div><div class="l">Peak viewers</div></div>
        <div class="stat" style="grid-column: span 2"><div class="v" style="font-size:22px">🏆 ${esc(r.best ? r.best.label : 'Nothing made it on camera…')}</div><div class="l">Best moment${r.best ? ` (+${r.best.gain.toLocaleString()} viewers)` : ''}</div></div>
        <div class="stat"><div class="v">$${r.dishMoney}</div><div class="l">Dish payments & tips</div></div>
        <div class="stat"><div class="v">$${r.ad}</div><div class="l">Ad revenue</div></div>
      </div>
      <div class="wallet">💰 Earned $${r.total}!</div>
      <div class="small">${r.expired} order${r.expired === 1 ? '' : 's'} expired · ${r.events} chaos events survived · 💀 ${r.wipeouts || 0} wipeout${r.wipeouts === 1 ? '' : 's'}</div>
      ${role === 'client' ? '<div class="status">⏳ Waiting for the host…</div>' : `
        <div class="row"><button class="btn pink" id="next">▶ Next Episode</button><button class="btn" id="shop">🛒 Shop</button></div>`}
      <button class="btn gray" id="menu">🏠 Main Menu</button>
    </div>`);
  on('#next', h.next); on('#shop', h.shop); on('#menu', h.menu);
}

export function postScreen(info, role, h) {
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const empty = (info.footage || 0) < 1;
  mount(`
    <div class="panel">
      <h1 style="margin:0">🎬 That's a Wrap!</h1>
      <div class="results-grid">
        <div class="stat"><div class="v">📼 ${fmt(info.footage || 0)}</div><div class="l">Footage on tape</div></div>
        <div class="stat"><div class="v">🎥 ${info.clips || 0}</div><div class="l">Moments captured</div></div>
      </div>
      ${empty ? '<p style="font-size:18px">😱 You didn\'t record anything! Next time grab the camera (<b>Q</b>) and press <b>R</b>.</p>'
        : '<p style="font-size:18px">Upload it and see what the internet thinks… 👀</p>'}
      ${role === 'client' ? `<div class="status">⏳ Waiting for ${esc(info.friend || 'the host')} to post the video…</div>`
        : `<button class="btn pink" id="post">${empty ? '📊 See results' : '📤 Post to ChefTube!'}</button>`}
      <button class="btn gray" id="menu">🏠 Main Menu</button>
    </div>`);
  on('#post', h.post); on('#menu', h.menu);
}

export function pauseScreen(first, role, h) {
  mount(`
    <div class="panel">
      <h1 style="margin:0">${first ? "🎬 You're on in 3… 2… 1…" : '⏸ Paused'}</h1>
      ${role !== 'solo' && !first ? '<div class="small">(The show keeps going in multiplayer!)</div>' : ''}
      <table class="controls-table" style="margin:12px auto">
        <tr><td><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump</td></tr>
        <tr><td><b>LMB</b> pick up / drop / put in · <b>RMB</b> throw</td></tr>
        <tr><td><b>E</b> use (hold to chop / spray) · <b>Q</b> show camera</td></tr>
      </table>
      <button class="btn pink" id="resume">${first ? '▶ Click to jump in!' : '▶ Resume'}</button>
      <button class="btn gray" id="leave">🏠 Leave to Main Menu</button>
    </div>`, true);
  on('#resume', h.resume); on('#leave', h.leave);
}

export function confirmScreen(title, text, yesLabel, h) {
  mount(`<div class="panel"><h1 style="margin:0">${esc(title)}</h1><p style="font-size:18px">${esc(text)}</p>
    <div class="row"><button class="btn gray" id="no">⬅ Cancel</button><button class="btn pink" id="yes">${esc(yesLabel)}</button></div></div>`);
  on('#yes', h.yes); on('#no', h.no);
}

export function messageScreen(title, text, h) {
  mount(`<div class="panel"><h1 style="margin:0">${esc(title)}</h1><p style="font-size:18px">${esc(text)}</p><button class="btn" id="ok">OK</button></div>`);
  on('#ok', h.ok);
}
