// Recipes, dish judging, stove / chopping / fire / orders. Runs only on the host (authoritative).
import * as THREE from 'three';
import { ITEM_DEFS } from './items.js';
import { BURNERS, BOARDS, WINDOW_POS } from './kitchen.js';

const has = (c, t, f = () => true) => (c || []).some((i) => i.t === t && f(i));
const soupOk = (s) => has(s.c, 'soup', (i) => i.ok && i.k >= 1 && i.k < 2);
// parts: what the ticket shows; test(itemState, itemType) → is this part already in the dish you're holding/looking at?
export const RECIPES = {
  burger: {
    name: 'Burger', emoji: '🍔', time: 110, ings: ['🍞', '🥩', '🥬', '🍅'], container: 'plate',
    parts: [
      { e: '🍞', l: 'Bun', test: (s) => has(s.c, 'bun') },
      { e: '🥩', l: 'Cooked patty', test: (s) => has(s.c, 'patty', (i) => i.k >= 1 && i.k < 2) },
      { e: '🥬', l: 'Lettuce', test: (s) => has(s.c, 'lettuce') },
      { e: '🍅', l: 'Tomato', test: (s) => has(s.c, 'tomato') },
    ],
    steps: [
      'Grab a 🥩 patty from the <b>fridge</b> (back-left) and click it into a 🍳 <b>pan</b> on the stove',
      'Press <b>E</b> on the burner to light it — wait for the bar to turn <b>green</b>',
      'Grab 🍞 bun, 🥬 lettuce, 🍅 tomato from the <b>crates</b> (left wall), click them onto a 🍽 <b>plate</b>',
      'Pick up the pan, click the plate to slide the patty on',
      'Bring the plate to 🛎 <b>SERVE HERE</b> (right wall) and click',
    ],
  },
  salad: {
    name: 'Salad', emoji: '🥗', time: 95, ings: ['🔪🥬', '🔪🍅', '🔪🥒'], container: 'bowl',
    parts: [
      { e: '🥬', l: 'Chopped lettuce', test: (s) => has(s.c, 'lettuce', (i) => i.ch) },
      { e: '🍅', l: 'Chopped tomato', test: (s) => has(s.c, 'tomato', (i) => i.ch) },
      { e: '🥒', l: 'Chopped cucumber', test: (s) => has(s.c, 'cucumber', (i) => i.ch) },
    ],
    steps: [
      'Grab 🥬 lettuce, 🍅 tomato and 🥒 cucumber from the <b>crates</b>',
      'Put each on a <b>cutting board</b> (middle island) and <b>HOLD E</b> to chop',
      'Click each chopped piece into a 🥣 <b>bowl</b> (bowl stack: right counter)',
      'Serve the bowl at 🛎 <b>SERVE HERE</b>',
    ],
  },
  soup: {
    name: 'Soup', emoji: '🍲', time: 130, ings: ['💧', '🔪🥕', '🔪🧅', '🔥'], container: 'bowl',
    parts: [
      { e: '💧', l: 'Water', test: (s) => !!s.w || soupOk(s) },
      { e: '🥕', l: 'Chopped carrot', test: (s) => has(s.c, 'carrot', (i) => i.ch) || soupOk(s) },
      { e: '🧅', l: 'Chopped onion', test: (s) => has(s.c, 'onion', (i) => i.ch) || soupOk(s) },
      { e: '🔥', l: 'Boiled', test: (s) => (s.k >= 1 && s.k < 2) || soupOk(s) },
      { e: '🥣', l: 'In a bowl', test: (s) => soupOk(s) },
    ],
    steps: [
      'Pick up a 🍲 <b>pot</b>, press <b>E at the sink</b> to fill it with water',
      'Chop 🥕 carrot + 🧅 onion on a board (<b>HOLD E</b>), click them into the pot',
      'Put the pot on a burner, press <b>E</b> to light it, wait for the <b>green</b> bar',
      'Pick up the pot and click an <b>empty</b> 🥣 bowl to pour',
      'Serve the bowl at 🛎 <b>SERVE HERE</b>',
    ],
  },
};

const count = (c, t, pred = () => true) => c.filter((i) => i.t === t && pred(i)).length;

// Returns { recipe, quality: 'perfect'|'burnt'|'wrong'|'empty'|'raw', label }
export function evaluateDish(item) {
  const c = item.s.c || [];
  if (!c.length) return { recipe: null, quality: 'empty', label: `an empty ${item.def.name.toLowerCase()}` };
  if (item.type === 'plate' && count(c, 'bun') && count(c, 'patty')) {
    const p = c.find((i) => i.t === 'patty');
    const exact = c.length === 4 && count(c, 'bun') === 1 && count(c, 'patty') === 1 && count(c, 'lettuce') === 1 && count(c, 'tomato') === 1;
    if (p.k >= 2) return { recipe: 'burger', quality: 'burnt', label: 'a BURNT burger' };
    if (p.k < 1) return { recipe: 'burger', quality: 'raw', label: 'a RAW burger' };
    if (exact) return { recipe: 'burger', quality: 'perfect', label: 'a perfect burger' };
    return { recipe: 'burger', quality: 'wrong', label: 'a very creative burger' };
  }
  if (item.type === 'bowl' && count(c, 'soup')) {
    const s = c.find((i) => i.t === 'soup');
    if (c.length > 1 || !s.ok) return { recipe: 'soup', quality: 'wrong', label: 'mystery soup' };
    if (s.k >= 2) return { recipe: 'soup', quality: 'burnt', label: 'BURNT soup' };
    return { recipe: 'soup', quality: 'perfect', label: 'a perfect soup' };
  }
  if (count(c, 'lettuce') && count(c, 'tomato') && count(c, 'cucumber')) {
    const allChopped = c.every((i) => i.ch);
    const exact = c.length === 3 && item.type === 'bowl';
    if (exact && allChopped) return { recipe: 'salad', quality: 'perfect', label: 'a perfect salad' };
    return { recipe: 'salad', quality: 'wrong', label: allChopped ? 'a weird salad' : 'an UNCHOPPED salad' };
  }
  if (c.some((i) => (i.k || 0) >= 2)) return { recipe: null, quality: 'burnt', label: 'a plate of charcoal' };
  return { recipe: null, quality: 'wrong', label: 'a pile of random food' };
}

export function canAddToContainer(container, food) {
  const t = container.type;
  if (t === 'pan') return food.type === 'patty' ? true : 'Only patties go in the pan!';
  if (t === 'pot') {
    if (food.type === 'patty' || food.type === 'bun') return "That doesn't belong in soup!";
    if (!food.s.ch) return 'Chop it first!';
    if (container.s.k >= 1) return 'The soup is already done!';
    return true;
  }
  if ((container.s.c || []).length >= 6) return "It's full!";
  return true;
}

export class CookingSystem {
  constructor(game) {
    this.game = game;
    this.fireId = 1; this.orderId = 1;
    this.newOrderT = 4;
    this.sizzle = 0; this.boil = 0;
  }

  cookwareOnBurner(i) {
    const b = BURNERS[i];
    for (const it of this.game.items.values()) {
      if (!it.def.cookware || it.holder !== -1 || !it.body) continue;
      const p = it.body.position;
      if (Math.hypot(p.x - b.x, p.z - b.z) < 0.3 && p.y > 0.85 && p.y < 1.3) return it;
    }
    return null;
  }
  itemOnBoard(i) {
    const b = BOARDS[i];
    let best = null, bd = 0.34;
    for (const it of this.game.items.values()) {
      if (!it.def.food || it.holder !== -1 || !it.body) continue;
      const p = it.body.position;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < bd && p.y > 0.9 && p.y < 1.25) { best = it; bd = d; }
    }
    return best;
  }
  boardIndexOf(item) {
    for (let i = 0; i < BOARDS.length; i++) if (this.itemOnBoard(i) === item) return i;
    return -1;
  }

  fireAt(i) { return this.game.state.fires.find((f) => f.b === i); }
  startFire(i, hp = 0.35, reason = 'fire') {
    const st = this.game.state;
    if (this.fireAt(i)) return null;
    const p = BURNERS[i];
    const f = { id: this.fireId++, b: i, hp, p: [p.x, p.y + 0.05, p.z], spread: 0 };
    st.fires.push(f);
    this.game.fx('sfx', { n: 'fire', p: f.p });
    this.game.fx('burst', { k: 'ember', p: f.p, n: 20, s: 3 });
    this.game.moment('fire', new THREE.Vector3(...f.p), reason === 'event' ? 55 : 80, reason === 'event' ? 'GREASE FIRE!' : 'The food caught FIRE');
    return f;
  }

  tick(dt) {
    const g = this.game, st = g.state, up = g.upgrades;
    this.sizzle = 0; this.boil = 0;

    // --- Stove ---
    for (let i = 0; i < BURNERS.length; i++) {
      const fire = this.fireAt(i);
      const heat = fire ? 2.5 : st.burners[i] ? 1 : 0;
      const cw = this.cookwareOnBurner(i);
      if (!cw || heat === 0) continue;
      const s = cw.s;
      let maxK = 0;
      if (cw.type === 'pan') {
        for (const c of s.c) { c.k = (c.k || 0) + dt * heat / (c.t === 'patty' ? 7 : 5); maxK = Math.max(maxK, c.k); }
        if (s.c.length) { cw.touch(); this.sizzle += 1; }
      } else if (cw.type === 'pot') {
        const okIngs = s.c.some((c) => c.t === 'carrot') && s.c.some((c) => c.t === 'onion');
        if (s.w) {
          this.boil += 1;
          if (okIngs || s.k > 0) { s.k += dt * heat / 11; cw.touch(); }
          if (s.k >= 2) { s.w = 0; cw.touch(); }
          maxK = s.k;
        } else if (s.c.length || s.k > 0) {
          if (s.k > 0) s.k += dt * heat / 6; else for (const c of s.c) c.k = (c.k || 0) + dt * heat / 4;
          maxK = Math.max(s.k, ...s.c.map((c) => c.k || 0)); cw.touch();
          this.sizzle += 0.5;
        }
      }
      if (maxK >= 2.7 && !fire && !up.pan) this.startFire(i);
    }

    // --- Fires: grow, spread, get extinguished ---
    for (const f of [...st.fires]) {
      f.hp = Math.min(1, f.hp + dt * 0.07);
      if (f.hp >= 1) {
        f.spread += dt;
        if (f.spread > 14) {
          f.spread = 0;
          const n = [f.b - 1, f.b + 1].filter((b) => b >= 0 && b < BURNERS.length && !this.fireAt(b));
          if (n.length) this.startFire(n[(Math.random() * n.length) | 0], 0.3);
        }
      }
    }
    // sprays
    const rate = [0.75, 1.05, 1.4][up.ext] || 0.75, range = [4.2, 5.5, 7][up.ext] || 4.2;
    for (const pl of g.players) {
      if (!pl || pl.act !== 'spray') continue;
      const { origin, dir } = g.lookRay(pl);
      for (const f of [...st.fires]) {
        const to = new THREE.Vector3(f.p[0], f.p[1] + 0.25, f.p[2]).sub(origin);
        const d = to.length();
        if (d < range && to.normalize().dot(dir) > 0.9) {
          f.hp -= dt * rate;
          if (f.hp <= 0) {
            st.fires.splice(st.fires.indexOf(f), 1);
            g.fx('sfx', { n: 'extinguish', p: f.p });
            g.fx('burst', { k: 'smoke', p: f.p, n: 25, s: 1.5 });
            g.moment('extinguish', new THREE.Vector3(...f.p), 40, `${pl.name} put out the fire`);
          }
        }
      }
      // foam the other chef in the face
      for (const other of g.players) {
        if (!other || other === pl) continue;
        const to = new THREE.Vector3(other.pos[0], other.pos[1] + 1.1, other.pos[2]).sub(origin);
        const d = to.length();
        const aimed = d < range * 0.8 && to.normalize().dot(dir) > 0.9;
        if (aimed && other.fire > 0) { // put out your burning partner
          other.fire = 0; other.foamCd = 3;
          g.fx('sfx', { n: 'extinguish', p: other.pos });
          g.fx('burst', { k: 'smoke', p: [other.pos[0], other.pos[1] + 1, other.pos[2]], n: 18, s: 1.5 });
          g.fx('toast', { to: other.id, text: `🧯 ${pl.name} put you out!`, kind: 'good' });
          g.moment('saved', new THREE.Vector3(...other.pos), 55, `${pl.name} saved ${other.name} from the flames`);
          continue;
        }
        if (aimed && (other.foamCd || 0) <= 0) {
          other.foamCd = 3;
          g.fx('foamface', { to: other.id });
          g.fx('sfx', { n: 'splash', p: other.pos });
          g.moment('foamed', new THREE.Vector3(...other.pos), 45, `${pl.name} foamed ${other.name}`);
        }
      }
      // spray the chicken away
      if (g.chaos.chicken) {
        const ch = g.chaos.chicken;
        const to = new THREE.Vector3(ch.x, ch.y + 0.3, ch.z).sub(origin);
        if (to.length() < range && to.normalize().dot(dir) > 0.9) g.chaos.scareChicken();
      }
    }
    for (const pl of g.players) if (pl && pl.foamCd > 0) pl.foamCd -= dt;

    // --- Chopping (E held while looking at a board / item on a board) ---
    const chopTime = [2.4, 1.5, 0.9][up.knife] || 2.4;
    for (const pl of g.players) {
      if (!pl) continue;
      if (pl.act === 'chop') pl.act = null;
      if (!pl.int || pl.act === 'spray') continue;
      const tgt = g.findTarget(pl);
      let food = null;
      if (tgt?.kind === 'station' && tgt.station.type === 'board') food = this.itemOnBoard(tgt.station.index);
      else if (tgt?.kind === 'item' && tgt.item.def.food && this.boardIndexOf(tgt.item) >= 0) food = tgt.item;
      if (!food || !food.def.choppable || food.s.ch) continue;
      pl.act = 'chop';
      food.s.cp += dt / chopTime; food.touch();
      if (food.s.cp >= 1) {
        food.s.ch = 1; food.s.cp = 0; food.touch();
        const p = food.body.position;
        g.fx('sfx', { n: 'chopped', p: [p.x, p.y, p.z] });
        g.fx('burst', { k: 'crumbs', p: [p.x, p.y + 0.1, p.z], n: 10, s: 1.5 });
        g.moment('chop', p.clone ? new THREE.Vector3(p.x, p.y, p.z) : null, 8, `${pl.name}'s knife skills`);
      }
    }

    // --- Orders ---
    this.newOrderT -= dt;
    const maxOrders = st.time < 150 ? 4 : 3;
    if ((this.newOrderT <= 0 && st.orders.length < maxOrders) || st.orders.length === 0) {
      this.addOrder();
      this.newOrderT = 22 + Math.random() * 10;
    }
    for (const o of [...st.orders]) {
      o.t -= dt;
      if (o.t <= 0) {
        st.orders.splice(st.orders.indexOf(o), 1);
        st.expired++;
        g.fx('toast', { text: `⌛ ${RECIPES[o.r].name} order expired!`, kind: 'bad' });
        g.fx('sfx', { n: 'sad' });
      }
    }
  }

  addOrder() {
    const st = this.game.state;
    const keys = Object.keys(RECIPES);
    // early game: avoid stacking the same dish too much
    let r = keys[(Math.random() * keys.length) | 0];
    if (st.orders.filter((o) => o.r === r).length >= 2) r = keys.find((k) => !st.orders.some((o) => o.r === k)) || r;
    const max = RECIPES[r].time;
    st.orders.push({ id: this.orderId++, r, t: max, max });
    this.game.fx('sfx', { n: 'tick' });
  }

  // Serve an item at the window. Returns true if the item was consumed.
  serve(item, pl, viaThrow = false) {
    const g = this.game, st = g.state;
    if (item.def.cookware) { g.fx('toast', { to: pl?.id, text: item.type === 'pot' ? 'Pour it into a bowl first! 🥣' : 'Put it on a plate first! 🍽', kind: 'bad' }); return false; }
    if (!item.def.container) {
      g.fx('toast', { text: `The judges received a single ${item.label().toLowerCase()}... 🤨`, kind: 'bad' });
      g.moment('serve_wrong', WINDOW_POS, 30, `Served a lone ${item.def.name.toLowerCase()}`);
      g.fx('sfx', { n: 'buzzer' });
      st.served.push({ r: null, q: 'wrong', pay: 0, label: item.label() });
      return true;
    }
    const res = evaluateDish(item);
    const who = pl ? pl.name : 'Someone';
    const yeet = viaThrow ? ' (YEET SERVE!)' : '';
    let pay = 0;
    if (res.quality === 'perfect') {
      const order = st.orders.find((o) => o.r === res.recipe);
      if (order) {
        st.orders.splice(st.orders.indexOf(order), 1);
        pay = 20 + Math.round(15 * order.t / order.max) + (viaThrow ? 10 : 0);
        g.fx('toast', { text: `${RECIPES[res.recipe].emoji} ${RECIPES[res.recipe].name} served! +$${pay}${yeet}`, kind: 'money' });
        g.moment(viaThrow ? 'yeet' : 'serve_good', WINDOW_POS, viaThrow ? 110 : 70, `${who} served ${res.label}${yeet}`);
      } else {
        pay = 8;
        g.fx('toast', { text: `Nobody ordered that... but OK. +$${pay}`, kind: 'money' });
        g.moment('serve_good', WINDOW_POS, 30, `${who} served an unordered ${RECIPES[res.recipe].name.toLowerCase()}`);
      }
      g.fx('sfx', { n: 'ding' }); g.fx('sfx', { n: 'cash' });
      g.fx('burst', { k: 'confetti', p: [WINDOW_POS.x - 0.3, WINDOW_POS.y, WINDOW_POS.z], n: 40, s: 4 });
    } else if (res.quality === 'burnt') {
      g.fx('toast', { text: `🔥 Served ${res.label}. The judges are coughing.`, kind: 'bad' });
      g.moment('serve_burnt', WINDOW_POS, 100, `${who} served ${res.label}`);
      g.fx('sfx', { n: 'buzzer' }); g.fx('sfx', { n: 'laugh' });
      g.fx('burst', { k: 'smoke', p: [WINDOW_POS.x, WINDOW_POS.y, WINDOW_POS.z], n: 25, s: 1.5 });
    } else if (res.quality === 'empty') {
      g.fx('toast', { text: '🍽 Served an empty plate. Bold.', kind: 'bad' });
      g.moment('serve_empty', WINDOW_POS, 35, `${who} served ${res.label}`);
      g.fx('sfx', { n: 'buzzer' });
    } else {
      g.fx('toast', { text: `🤢 Served ${res.label}`, kind: 'bad' });
      g.moment('serve_wrong', WINDOW_POS, 50, `${who} served ${res.label}`);
      g.fx('sfx', { n: 'buzzer' }); g.fx('sfx', { n: 'laugh' });
    }
    st.money += pay;
    st.served.push({ r: res.recipe, q: res.quality, pay, label: res.label });
    return true;
  }
}

export function ingredientLabel(t) { return ITEM_DEFS[t]?.name || t; }
