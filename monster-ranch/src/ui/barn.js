// The Barn: move creatures between your party and the shared ranch.
import { SPECIES_BY_ID } from '../data/creatures.js';
import { TYPES } from '../data/types.js';
import { portrait } from '../creatures/portraits.js';
import { moodName } from '../ranch/ranch.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class BarnPanel {
  constructor(root, game) {
    this.game = game;
    this.open = false;
    this.el = h(`<div class="panel-wrap hidden"><div class="panel barn">
      <div class="panel-tabs"><button class="active">🏚️ Big Red Barn</button></div>
      <div class="panel-body"></div>
      <div class="panel-foot">E, Tab or Esc to close</div>
    </div></div>`);
    root.appendChild(this.el);
  }

  toggle(v = !this.open) {
    this.open = v;
    this.el.classList.toggle('hidden', !v);
    if (v) this.render();
  }

  card(c, action, label, extra = '') {
    const sp = SPECIES_BY_ID[c.species], t = TYPES[sp.type];
    const hap = Math.round(c.happiness ?? 70);
    return `<div class="barn-card">
      <img src="${portrait(c.species, c.shiny)}" alt="">
      <div class="barn-info"><b>${c.nickname || sp.name}${c.shiny ? ' ✨' : ''}</b> <small>Lv ${c.level}</small>
        <div><span class="type-badge" style="background:${t.color}">${t.icon} ${t.name}</span> ${hap >= 60 ? '♥' : hap < 35 ? '☁' : '•'} ${moodName(hap)}${extra}</div></div>
      ${action ? `<button class="btn small" data-act="${action}" data-uid="${c.uid}">${label}</button>` : ''}
    </div>`;
  }

  render() {
    const g = this.game;
    const party = g.party || [];
    const ranch = g.ranchList();
    const cap = g.ranchCapacity();
    const body = this.el.querySelector('.panel-body');
    body.innerHTML = `
      <div class="barn-cols">
        <div><h3>🐾 Your party (${party.length}/6)</h3>
          ${party.map((c) => this.card(c, party.length > 1 ? 'toRanch' : '', 'Send to ranch →')).join('') || '<p class="hint">Empty</p>'}
          ${party.length <= 1 ? '<p class="hint">Keep at least one partner with you.</p>' : ''}</div>
        <div><h3>🏡 Ranch (${ranch.length}) <small>· ${cap} can roam outside</small></h3>
          ${ranch.map((c, i) => this.card(c, party.length < 6 ? 'toParty' : '', '← Take to party', i >= cap ? ' · <i>resting in barn</i>' : '')).join('') || '<p class="hint">No creatures on the ranch yet. Send some here so they can live, play and produce resources!</p>'}
        </div>
      </div>
      <p class="hint">Ranch creatures are shared by both ranchers. Build Pens (B) so more of them can roam (6 + 4 per pen) — happy creatures produce berries, batteries, water buckets and more.</p>`;
    body.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => { g.requestRanchMove(b.dataset.uid, b.dataset.act); g.audio.play('ui'); });
  }
}
