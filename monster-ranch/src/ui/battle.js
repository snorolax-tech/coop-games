// Battle HUD: HP cards for both sides, a short battle log and the move menu (keys 1-4, R to run).
import { MOVES } from '../data/moves.js';
import { TYPES } from '../data/types.js';
import { SPECIES_BY_ID } from '../data/creatures.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const STATUS = { burn: '🔥BRN', sleep: '💤SLP', paralyze: '⚡PAR' };

function card(b, mine) {
  const pct = Math.max(0, b.hp / b.max);
  const col = pct > 0.5 ? '#06d6a0' : pct > 0.2 ? '#ffd166' : '#ef476f';
  const t = TYPES[SPECIES_BY_ID[b.sp].type];
  return `<div class="bcard ${mine ? 'mine' : ''} ${b.hp <= 0 ? 'down' : ''}">
    <div class="bname"><span class="type-dot" style="background:${t.color}"></span>${b.name} <small>Lv ${b.lvl}</small>
      ${b.status ? `<span class="bstatus">${STATUS[b.status]}</span>` : ''}${b.ownerName ? `<span class="bowner">${b.ownerName}</span>` : ''}</div>
    <div class="hpbar"><i style="width:${pct * 100}%;background:${col}"></i></div>
    <div class="hptext">${b.hp}/${b.max} HP</div>
  </div>`;
}

export class BattleHUD {
  constructor(root, game) {
    this.game = game;
    this.el = h(`<div class="battle-hud hidden">
      <div class="bsides"><div class="ballies"></div><div class="bvs">VS</div><div class="bfoes"></div></div>
      <div class="blog"></div>
      <div class="bmoves"></div>
      <div class="bhint">Weaken it, then scroll to a 🔵 Bond Orb and throw it to befriend! · <b>R</b> Run</div>
    </div>`);
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-move]');
      if (btn) game.requestMove(+btn.dataset.move);
    });
    this.sig = '';
  }

  update(battle, myId) {
    if (!battle) { this.el.classList.add('hidden'); this.sig = ''; return; }
    const sig = JSON.stringify(battle) + myId;
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.classList.remove('hidden');
    this.el.querySelector('.ballies').innerHTML = battle.allies.map((a) => card(a, a.owner === myId)).join('');
    this.el.querySelector('.bfoes').innerHTML = battle.foes.map((f) => card(f, false)).join('');
    this.el.querySelector('.blog').innerHTML = battle.log.map((l, i) => `<div class="${i === battle.log.length - 1 ? 'last' : ''}">${l}</div>`).join('');
    const me = battle.allies.find((a) => a.owner === myId && a.hp > 0);
    const moves = this.el.querySelector('.bmoves');
    if (battle.phase === 'choose' && me && !me.chose) {
      moves.innerHTML = me.moves.map((id, i) => {
        const m = MOVES[id], t = TYPES[m.type];
        return `<button class="bmove" data-move="${i}" style="--tc:${t.color}"><b>${i + 1}</b> ${m.name}<small>${t.icon} ${m.power ? m.power : 'status'}</small></button>`;
      }).join('');
    } else if (battle.phase === 'choose') {
      const waiting = battle.allies.filter((a) => !a.chose && a.hp > 0).map((a) => a.ownerName);
      moves.innerHTML = `<div class="bwait">Waiting for ${waiting.join(' & ') || '…'}…</div>`;
    } else {
      moves.innerHTML = '<div class="bwait">⚔️ Turn in progress…</div>';
    }
  }
}
