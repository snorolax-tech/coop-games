// Tab panel (Inventory / Party / Creature Dex) and the pause menu.
import { ITEMS } from '../data/items.js';
import { SPECIES, SPECIES_BY_ID } from '../data/creatures.js';
import { TYPES, RARITY, PERSONALITIES, CHART, CREATURE_TYPES, COMBOS, effectiveness } from '../data/types.js';
import { MOVES } from '../data/moves.js';
import { ZONES } from '../world/zones.js';
import { portrait } from '../creatures/portraits.js';
import { xpToNext } from '../battle/rules.js';

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
      this.renderParty(body);
    } else {
      this.renderDex(body);
    }
  }

  renderDex(body) {
    const dex = this.game.dex;
    if (this.dexView === 'chart') { body.innerHTML = typeChartHTML(); this._wireDexBack(body); return; }
    if (this.dexSel && dex.seen.has(this.dexSel)) { body.innerHTML = dexDetailHTML(SPECIES_BY_ID[this.dexSel], dex); this._wireDexBack(body); return; }
    const cards = SPECIES.map((sp) => {
      const seen = dex.seen.has(sp.id), caught = dex.caught.has(sp.id);
      const t = TYPES[sp.type];
      return `<button class="dex-card ${seen ? '' : 'unseen'}" data-sp="${sp.id}">
        <div class="dex-num">#${String(sp.num).padStart(2, '0')}${caught ? ' <span title="Befriended">💞</span>' : ''}</div>
        <img src="${portrait(sp.id)}" alt="">
        <div class="dex-name">${seen ? sp.name : '???'}</div>
        ${seen ? `<div class="type-badge" style="background:${t.color}">${t.icon} ${t.name}</div>` : '<div class="type-badge unknown">?</div>'}
      </button>`;
    }).join('');
    body.innerHTML = `
      <div class="dex-head">
        <div><b>Seen</b> ${dex.seen.size}/${SPECIES.length} · <b>Befriended</b> ${dex.caught.size}/${SPECIES.length}</div>
        <button class="btn small" data-a="chart">📊 Type Chart</button>
      </div>
      <div class="dex-grid">${cards}</div>
      <p class="hint">Look at a creature (or get close) to log it. The Dex is shared by both ranchers.</p>`;
    body.querySelector('[data-a=chart]').onclick = () => { this.dexView = 'chart'; this.render(); };
    body.querySelectorAll('.dex-card').forEach((b) => b.onclick = () => {
      if (!dex.seen.has(b.dataset.sp)) { this.game.audio.play('locked'); return; }
      this.dexSel = b.dataset.sp; this.game.audio.play('ui'); this.render();
    });
  }

  renderParty(body) {
    const g = this.game;
    const party = g.party || [];
    if (!party.length) {
      body.innerHTML = `<div class="empty-state"><div class="big">🥚</div><h3>No creatures yet</h3><p>Choose a starter partner to begin!</p></div>`;
      return;
    }
    const ranch = g.isGuest ? (g.ranchCount || 0) : g.ranch.length;
    body.innerHTML = `<div class="party-list">${party.map((c, i) => {
      const sp = SPECIES_BY_ID[c.species], t = TYPES[sp.type], p = PERSONALITIES[c.personality];
      const hp = c.hp / c.stats.hp, col = hp > 0.5 ? '#06d6a0' : hp > 0.2 ? '#ffd166' : '#ef476f';
      const need = xpToNext(c.level);
      return `<div class="pcard ${i === 0 ? 'lead' : ''} ${c.hp <= 0 ? 'down' : ''}">
        <img src="${portrait(c.species, c.shiny)}" alt="">
        <div class="pinfo">
          <div class="pname">${g.creatureName(c)}${c.shiny ? ' ✨' : ''} <small>Lv ${c.level}</small> ${i === 0 ? '<span class="lead-tag">LEAD</span>' : ''}</div>
          <div class="badges"><span class="type-badge" style="background:${t.color}">${t.icon} ${t.name}</span><span class="pers">${p.icon} ${p.name}</span></div>
          <div class="hpbar"><i style="width:${hp * 100}%;background:${col}"></i></div>
          <div class="ptext">${c.hp}/${c.stats.hp} HP · ATK ${c.stats.atk} · DEF ${c.stats.def} · SPD ${c.stats.spd}</div>
          <div class="xpbar"><i style="width:${Math.min(100, (c.xp / need) * 100)}%"></i></div>
          <div class="ptext">XP ${c.xp}/${need} · ${c.moves.map((m) => MOVES[m].name).join(', ')}</div>
        </div>
        ${i > 0 ? `<button class="btn small" data-lead="${i}">Make lead</button>` : ''}
      </div>`;
    }).join('')}</div>
    <p class="hint">Your lead goes out first when you send out your partner (key 6, Q to cycle). Creatures heal slowly over time, and fully when someone rests at the Farmhouse.${ranch ? ` · 🏡 ${ranch} creature(s) waiting at the ranch (pens arrive in Stage 4).` : ''}</p>`;
    body.querySelectorAll('[data-lead]').forEach((b) => b.onclick = () => { g.setLead(+b.dataset.lead); g.audio.play('ui'); });
  }

  _wireDexBack(body) {
    body.querySelector('[data-a=back]').onclick = () => { this.dexSel = null; this.dexView = null; this.render(); };
  }
}

function statBar(label, v) {
  return `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, (v / 130) * 100)}%"></i></div><b>${v}</b></div>`;
}

function dexDetailHTML(sp, dex) {
  const t = TYPES[sp.type];
  const r = RARITY[sp.rarity];
  const p = PERSONALITIES[sp.personality];
  const ch = CHART[sp.type];
  const weakTo = Object.entries(CHART).filter(([, c]) => c.strong.includes(sp.type)).map(([k]) => TYPES[k]);
  const moves = sp.moves.map((id) => {
    const m = MOVES[id]; const mt = TYPES[m.type];
    return `<div class="move"><span class="type-dot" style="background:${mt.color}"></span><b>${m.name}</b><span class="move-pow">${m.power ? 'Pow ' + m.power : 'Status'}</span><span class="move-desc">${m.desc}</span></div>`;
  }).join('');
  let evo = '';
  if (sp.evolve) {
    const to = SPECIES_BY_ID[sp.evolve.to];
    evo = `Evolves into <b>${dex.seen.has(to.id) ? to.name : '???'}</b> ${sp.evolve.level ? `at level ${sp.evolve.level}` : 'when very happy'}.`;
  } else if (sp.evolvesFrom) evo = `Evolves from <b>${SPECIES_BY_ID[sp.evolvesFrom].name}</b>.`;
  const where = sp.habitat.length ? sp.habitat.map((z) => ZONES[z].name).join(', ') : 'Unknown… only the most beloved ranches';
  const when = { day: '☀️ Daytime (naps at night)', night: '🌙 Night only', any: '🌗 Day and night' }[sp.time];
  return `
    <button class="btn small" data-a="back">← Back</button>
    <div class="dex-detail">
      <div class="dex-portrait" style="--tc:${t.color}"><img src="${portrait(sp.id)}" alt=""><img class="shiny" src="${portrait(sp.id, true)}" alt="" title="Shiny colours"></div>
      <div class="dex-info">
        <div class="dex-num">#${String(sp.num).padStart(2, '0')} ${dex.caught.has(sp.id) ? '💞 Befriended' : ''}</div>
        <h2>${sp.name}</h2>
        <div class="badges">
          <span class="type-badge" style="background:${t.color}">${t.icon} ${t.name}</span>
          <span class="rarity" style="color:${r.color}">${'★'.repeat(r.stars)} ${r.name}</span>
          <span class="pers">${p.icon} Usually ${p.name}</span>
        </div>
        <p class="desc">${sp.desc}</p>
        <div class="stats">${statBar('HP', sp.base.hp)}${statBar('ATK', sp.base.atk)}${statBar('DEF', sp.base.def)}${statBar('SPD', sp.base.spd)}</div>
        <p class="small-line">📍 ${where} · ${when}</p>
        ${evo ? `<p class="small-line">🧬 ${evo}</p>` : ''}
        <p class="small-line">💪 Strong vs ${ch.strong.map((k) => TYPES[k].icon + ' ' + TYPES[k].name).join(', ')} · 😣 Weak to ${weakTo.map((x) => x.icon + ' ' + x.name).join(', ')}</p>
      </div>
    </div>
    <h3>Moves</h3><div class="moves">${moves}</div>`;
}

function typeChartHTML() {
  const ids = CREATURE_TYPES;
  const head = ids.map((d) => `<th title="${TYPES[d].name}">${TYPES[d].icon}</th>`).join('');
  const rows = ids.map((a) => `<tr><th>${TYPES[a].icon} ${TYPES[a].name}</th>${ids.map((d) => {
    const e = effectiveness(a, d);
    return `<td class="${e > 1 ? 'good' : e < 1 ? 'bad' : ''}">${e > 1 ? '2×' : e < 1 ? '½' : ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<button class="btn small" data-a="back">← Back</button>
    <h3>Type Chart</h3><p class="hint">Rows attack, columns defend. 2× = super effective, ½ = not very effective.</p>
    <table class="type-chart"><tr><th>Attacker ↓ / Defender →</th>${head}</tr>${rows}</table>
    <h3>Co-op Combos</h3><p class="hint">Use these two types in the same turn with your friend (Stage 6).</p>
    <div class="combos">${COMBOS.map((c) => `<span>${TYPES[c.types[0]].icon}+${TYPES[c.types[1]].icon} <b>${c.name}</b></span>`).join('')}</div>`;
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
