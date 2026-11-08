// Gatherable resource nodes: berry bushes, glowberry bushes, flowers, rocks, logs,
// shells, mushrooms and emberstones. They deplete when gathered and regrow over time.
import * as THREE from 'three';
import { G } from './props.js';

const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });

const MATS = {
  bush: M('#3fae4f'), bushDark: M('#2f8f43'),
  berry: M('#e63946', { emissive: 0x330000 }),
  glow: M('#7ff9ff', { emissive: 0x2ad4ff, emissiveIntensity: 0.3 }),
  stem: M('#3f9b4a'),
  rock: M('#a2a2ad'), rockDark: M('#7d7d88'),
  log: M('#9a6334'), logEnd: M('#e3b779'),
  shell: M('#ffd6e8', { emissive: 0x221018 }),
  capRed: M('#ff6b6b'), capPurple: M('#b388ff'), capStem: M('#f6eedd'),
  ember: M('#ff7b2e', { emissive: 0xff4d00, emissiveIntensity: 0.6 }),
  emberRock: M('#4e3b36'),
};
const FLOWER_COLS = ['#ff70a6', '#ffd670', '#70d6ff', '#e9ff70', '#c77dff', '#ffffff'].map((c) => M(c));
const CENTER = M('#fff3b0');

// type -> definition
export const NODE_TYPES = {
  berry: { name: 'Sweetberry Bush', verb: 'E  Pick berries', item: 'berry', amount: [2, 3], regrow: 120, method: 'hand' },
  glow: { name: 'Glowberry Bush', verb: 'E  Pick glowberries', item: 'glowberry', amount: [1, 2], regrow: 240, method: 'hand' },
  flower: { name: 'Wildflowers', verb: 'E  Pick flowers', item: 'flower', amount: [1, 2], regrow: 90, method: 'hand' },
  rock: { name: 'Stone Rock', verb: 'Hammer (5) + Click to mine', item: 'stone', amount: [2, 3], regrow: 150, method: 'hammer', hits: 3 },
  log: { name: 'Fallen Log', verb: 'Hammer (5) + Click to chop', item: 'wood', amount: [2, 3], regrow: 150, method: 'hammer', hits: 3 },
  shell: { name: 'Shimmer Shell', verb: 'E  Pick up', item: 'shell', amount: [1, 1], regrow: 200, method: 'hand' },
  mushroom: { name: 'Puffcap Patch', verb: 'E  Pick mushrooms', item: 'mushroom', amount: [1, 2], regrow: 160, method: 'hand' },
  ember: { name: 'Emberstone Vein', verb: 'Hammer (5) + Click to mine', item: 'ember', amount: [1, 2], regrow: 220, method: 'hammer', hits: 4 },
};

function mesh(geo, mat, x, y, z, sx, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildNode(type, rand) {
  const g = new THREE.Group();
  const yield_ = new THREE.Group(); // the part that disappears when gathered
  g.add(yield_);
  let collider = null; // [radius, height]
  switch (type) {
    case 'berry':
    case 'glow': {
      g.add(mesh(G.ico1, MATS.bush, 0, 0.75, 0, 1.7, 1.4, 1.7));
      g.add(mesh(G.ico1, MATS.bushDark, 0.6, 0.55, 0.3, 1.0));
      const mat = type === 'glow' ? MATS.glow : MATS.berry;
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2, e = rand() * 0.9 + 0.1;
        const b = mesh(G.sphere, mat, Math.cos(a) * 0.8 * Math.cos(e), 0.75 + Math.sin(e) * 0.65, Math.sin(a) * 0.8 * Math.cos(e), 0.2);
        b.userData.noHighlight = type === 'glow';
        yield_.add(b);
      }
      collider = [0.8, 1.4];
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const x = (rand() - 0.5) * 1.4, z = (rand() - 0.5) * 1.4;
        g.add(mesh(G.cylLow, MATS.stem, x, 0.22, z, 0.06, 0.45, 0.06));
        const f = new THREE.Group();
        f.position.set(x, 0.48, z);
        const col = FLOWER_COLS[Math.floor(rand() * FLOWER_COLS.length)];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          f.add(mesh(G.sphere, col, Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13, 0.16, 0.06, 0.16));
        }
        f.add(mesh(G.sphere, CENTER, 0, 0.02, 0, 0.1));
        yield_.add(f);
      }
      break;
    }
    case 'rock': {
      yield_.add(mesh(G.dodec, MATS.rock, 0, 0.55, 0, 1.8, 1.3, 1.6));
      yield_.add(mesh(G.dodec, MATS.rockDark, 0.7, 0.3, 0.4, 0.8));
      yield_.children[0].rotation.set(rand() * 3, rand() * 3, rand() * 3);
      collider = [1.0, 1.2];
      break;
    }
    case 'ember': {
      yield_.add(mesh(G.dodec, MATS.emberRock, 0, 0.55, 0, 1.8, 1.3, 1.6));
      for (let i = 0; i < 4; i++) {
        const c = mesh(G.cone, MATS.ember, (rand() - 0.5) * 1, 1.0 + rand() * 0.3, (rand() - 0.5) * 1, 0.35, 0.9, 0.35);
        c.rotation.set((rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.9);
        c.userData.noHighlight = true;
        yield_.add(c);
      }
      collider = [1.0, 1.2];
      break;
    }
    case 'log': {
      const l = mesh(G.cyl, MATS.log, 0, 0.45, 0, 0.9, 3.4, 0.9);
      l.rotation.z = Math.PI / 2;
      yield_.add(l);
      for (const x of [-1.71, 1.71]) {
        const e = mesh(G.cyl, MATS.logEnd, x, 0.45, 0, 0.75, 0.04, 0.75);
        e.rotation.z = Math.PI / 2;
        yield_.add(e);
      }
      collider = [1.0, 0.9];
      break;
    }
    case 'shell': {
      const s = mesh(G.cone, MATS.shell, 0, 0.15, 0, 0.5, 0.35, 0.5);
      s.rotation.x = 0.5;
      yield_.add(s);
      yield_.add(mesh(G.sphere, MATS.shell, 0.4, 0.08, 0.2, 0.25, 0.12, 0.2));
      break;
    }
    case 'mushroom': {
      for (let i = 0; i < 4; i++) {
        const s = 0.5 + rand() * 0.6, x = (rand() - 0.5) * 1.3, z = (rand() - 0.5) * 1.3;
        const cap = rand() < 0.5 ? MATS.capRed : MATS.capPurple;
        yield_.add(mesh(G.cyl, MATS.capStem, x, 0.25 * s, z, 0.2 * s, 0.5 * s, 0.2 * s));
        yield_.add(mesh(G.sphere, cap, x, 0.55 * s, z, 0.75 * s, 0.4 * s, 0.75 * s));
      }
      break;
    }
  }
  return { group: g, yieldGroup: yield_, collider };
}

export class ResourceNodes {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.nodes = [];
    this.authoritative = true; // false on a guest: the host decides regrowth
  }

  spawn(type, x, z, rand, zone) {
    const y = this.world.groundY(x, z);
    const { group, yieldGroup, collider } = buildNode(type, rand);
    group.position.set(x, y, z);
    group.rotation.y = rand() * Math.PI * 2;
    this.world.scene.add(group);
    const def = NODE_TYPES[type];
    const index = this.nodes.length;
    const node = { index, type, def, group, yieldGroup, depleted: false, timer: 0, hits: 0, zone, x, z };
    if (collider) node.collider = this.world.colliders.circle(x, z, collider[0], y + collider[1]);
    node.interact = this.game.interactions.add({
      id: 'node:' + index,
      root: group,
      name: def.name,
      sub: () => (node.depleted ? 'Regrowing…' : def.verb),
      use: (actor) => this.gather(node, 'hand', actor),
      hit: (actor, tool) => this.gather(node, tool, actor),
    });
    this.nodes.push(node);
    return node;
  }

  /** Host-side: an actor (local player or guest) gathers from a node. */
  gather(node, method, actor) {
    if (node.depleted) { actor.toast(`${node.def.name} is regrowing`, 'muted'); return false; }
    const def = node.def;
    if (def.method === 'hammer') {
      if (method !== 'hammer') { actor.toast('Use the Hammer (5) on this', 'muted'); return false; }
      node.hits++;
      this.game.worldFx('puff', node.group.position.clone().add(new THREE.Vector3(0, 1, 0)), type2color(node.type));
      this.game.worldSound('knock', node.group.position);
      this.game.worldEvent({ t: 'wobble', i: node.index });
      node.wobble = 0.25;
      if (node.hits < def.hits) return true;
    } else if (method !== 'hand') {
      return false;
    }
    const n = def.amount[0] + Math.floor(Math.random() * (def.amount[1] - def.amount[0] + 1));
    actor.give(def.item, n);
    node.hits = 0;
    node.timer = def.regrow;
    this.setDepleted(node.index, true);
    return true;
  }

  /** Apply depleted/regrown state (also used by the guest when the host says so). */
  setDepleted(i, depleted) {
    const n = this.nodes[i];
    if (!n) return;
    n.depleted = depleted;
    if (depleted) {
      if (n.def.method === 'hammer') { n.group.visible = false; if (n.collider) n.collider.active = false; }
      else n.yieldGroup.visible = false;
    } else {
      n.yieldGroup.visible = true;
      if (n.collider) n.collider.active = true;
    }
    this.game.onNodeChange?.(i, depleted);
  }

  /** Compact depleted-flags string for network sync. */
  flags() { return this.nodes.map((n) => (n.depleted ? '1' : '0')).join(''); }
  wobble(i) { const n = this.nodes[i]; if (n) n.wobble = 0.25; }
  applyFlags(s) { for (let i = 0; i < s.length && i < this.nodes.length; i++) if ((s[i] === '1') !== this.nodes[i].depleted) this.setDepleted(i, s[i] === '1'); }

  update(dt, night, focus) {
    MATS.glow.emissiveIntensity = 0.3 + night * 1.4;
    for (const n of this.nodes) {
      // distance culling keeps draw calls low (nodes are lots of small meshes)
      const near = !focus || (n.x - focus.x) ** 2 + (n.z - focus.z) ** 2 < 120 * 120;
      n.group.visible = near && !(n.depleted && n.def.method === 'hammer');
      if (n.wobble > 0) {
        n.wobble -= dt;
        const k = Math.max(0, n.wobble) * 4;
        n.group.scale.set(1 + Math.sin(n.wobble * 60) * 0.06 * k, 1 - Math.sin(n.wobble * 60) * 0.06 * k, 1 + Math.sin(n.wobble * 60) * 0.06 * k);
      } else if (n.group.scale.x !== 1) n.group.scale.set(1, 1, 1);
      if (!n.depleted || !this.authoritative) continue;
      n.timer -= dt;
      if (n.timer <= 0) this.setDepleted(n.index, false);
    }
  }

  serialize() {
    return this.nodes.map((n) => (n.depleted ? Math.round(n.timer) : 0));
  }

  restore(arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach((t, i) => {
      const n = this.nodes[i];
      if (!n) return;
      if (t) { n.timer = t; this.setDepleted(i, true); } else if (n.depleted) this.setDepleted(i, false);
    });
  }
}

function type2color(t) {
  return { rock: 0xbbbbcc, log: 0xc98d4b, ember: 0xff7b2e }[t] || 0xffffff;
}
