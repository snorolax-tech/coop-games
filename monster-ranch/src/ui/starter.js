// "Choose your partner" picker shown the first time a rancher has no creatures.
import { SPECIES_BY_ID } from '../data/creatures.js';
import { TYPES } from '../data/types.js';
import { portrait } from '../creatures/portraits.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const STARTERS = ['emberpup', 'puddlop', 'sproutle'];

export class StarterPicker {
  constructor(root, game) {
    this.game = game;
    this.el = h(`<div class="starter hidden"><div class="starter-card">
      <h2>Choose your first partner!</h2>
      <p>Every rancher needs a buddy. Your partner battles by your side and helps you befriend wild creatures.</p>
      <div class="starter-row"></div>
    </div></div>`);
    root.appendChild(this.el);
    this.open = false;
  }

  show() {
    const row = this.el.querySelector('.starter-row');
    row.innerHTML = STARTERS.map((id) => {
      const sp = SPECIES_BY_ID[id], t = TYPES[sp.type];
      return `<button class="starter-pick" data-id="${id}" style="--tc:${t.color}">
        <img src="${portrait(id)}" alt=""><h3>${sp.name}</h3>
        <span class="type-badge" style="background:${t.color}">${t.icon} ${t.name}</span>
        <p>${sp.desc}</p></button>`;
    }).join('');
    row.querySelectorAll('.starter-pick').forEach((b) => b.onclick = () => {
      this.hide();
      this.game.chooseStarter(b.dataset.id);
    });
    this.el.classList.remove('hidden');
    this.open = true;
    this.game.input.exitLock();
  }

  hide() {
    this.el.classList.add('hidden');
    this.open = false;
  }
}
