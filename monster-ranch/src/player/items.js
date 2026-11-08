// Held items: hotbar selection (1-5 / wheel), first-person viewmodels, throwing with an
// aim arc (right mouse), and tool swings (brush, watering can, hammer).
import * as THREE from 'three';
import { HOTBAR } from '../data/items.js';
import { makeOrbMesh, makeTreatMesh } from '../physics/projectiles.js';

const M = (c, e) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...(e || {}) });

export function makeViewModel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'orb': g.add(makeOrbMesh(0.7)); break;
    case 'treat': g.add(makeTreatMesh(0.85)); break;
    case 'brush': {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.32), M('#c98d4b')); handle.position.z = 0.1;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), M('#8b5a2b')); head.position.z = -0.1;
      const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.11), M('#fff3b0')); bristles.position.set(0, -0.05, -0.1);
      g.add(handle, head, bristles); g.rotation.set(-0.3, 0.3, 0);
      break;
    }
    case 'can': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 10), M('#4cc9f0'));
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.25, 6), M('#4cc9f0'));
      spout.rotation.x = -Math.PI / 2 + 0.6; spout.position.set(0, 0.03, -0.17);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 10, Math.PI), M('#3a9cc2'));
      handle.position.set(0, 0.1, 0.03); handle.rotation.y = Math.PI / 2;
      g.add(body, spout, handle);
      break;
    }
    case 'partner': {
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#06d6a0'));
      const bot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M('#fff6e0'));
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 18), M('#2b2d42'));
      band.rotation.x = Math.PI / 2;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), M('#ffffff', { emissive: 0x335544 }));
      paw.position.z = 0.1;
      g.add(top, bot, band, paw);
      break;
    }
    case 'hammer': {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), M('#c98d4b')); handle.position.y = -0.05;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.1), M('#8d99ae')); head.position.y = 0.17;
      g.add(handle, head); g.rotation.set(0.2, 0, -0.3);
      break;
    }
  }
  return g;
}

export class HeldItems {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.index = 0;
    this.holder = new THREE.Group();
    this.holder.position.set(0.32, -0.3, -0.55);
    camera.add(this.holder);
    this.models = HOTBAR.map((h) => { const m = makeViewModel(h.id); m.visible = false; m.traverse((o) => { o.castShadow = false; }); this.holder.add(m); return m; });
    this.swing = 0;   // swing animation timer (counts down)
    this.cooldown = 0;
    this.switchAnim = 0;
    this.time = 0;

    // aim arc
    const n = 36;
    this.arcPts = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.arcPts, 3));
    this.arc = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    game.scene.add(this.arc);
    this.select(0);
  }

  get current() { return HOTBAR[this.index]; }

  select(i) {
    i = ((i % HOTBAR.length) + HOTBAR.length) % HOTBAR.length;
    this.index = i;
    this.models.forEach((m, k) => { m.visible = k === i; });
    this.switchAnim = 0.25;
    this.game.hud?.setHotbar(i);
  }

  _throwVelocity(out, aiming) {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    if (!aiming) {
      // hip throws are a little wild
      dir.x += (Math.random() - 0.5) * 0.08; dir.y += (Math.random() - 0.5) * 0.06; dir.z += (Math.random() - 0.5) * 0.08;
      dir.normalize();
    }
    const speed = this.current.id === 'orb' ? 19 : 15;
    return out.copy(dir).multiplyScalar(speed).add(new THREE.Vector3(0, 2.6, 0));
  }

  _origin(out) {
    return out.set(0.25, -0.15, -0.6).applyMatrix4(this.camera.matrixWorld);
  }

  update(dt, input, player, canAct) {
    this.time += dt;
    // switching
    // in battle, 1-4 pick moves instead of items (the wheel still switches items)
    const inBattle = this.game.inBattle;
    const building = this.game.buildMode?.active;
    for (let k = 0; k < HOTBAR.length && !building; k++) {
      if (inBattle && k < 4) continue;
      if (input.wasPressed('Digit' + (k + 1))) this.select(k);
    }
    if (input.wheel && !building) this.select(this.index + input.wheel);
    if (canAct && input.wasPressed('KeyQ') && !inBattle) this.game.cycleLead();

    const cur = this.current;
    const isThrow = cur.kind === 'throw';
    player.aiming = canAct && isThrow && input.held(2);
    this.cooldown -= dt;

    if (canAct && input.clicked(0) && this.cooldown <= 0) {
      if (isThrow) this._throw(player);
      else if (cur.kind === 'partner') this._sendPartner();
      else this._useTool(cur.id);
    }

    // aim arc preview
    this.arc.visible = player.aiming && (this.game.inventory[cur.item] || 0) > 0;
    if (this.arc.visible) this._updateArc();

    // viewmodel animation
    const vm = this.models[this.index];
    const hs = Math.hypot(player.vel.x, player.vel.z);
    const sway = Math.sin(player.bob) * 0.012 * Math.min(1, hs / 6);
    this.switchAnim = Math.max(0, this.switchAnim - dt);
    let ox = sway, oy = Math.abs(Math.cos(player.bob)) * 0.01 - this.switchAnim * 0.8, oz = 0, rx = 0, rz = 0;
    if (player.aiming) { ox -= 0.12; oy += 0.04; }
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt);
      const t = 1 - this.swing / this.swingLen;
      const k = Math.sin(t * Math.PI);
      if (isThrow) { oz -= k * 0.25; oy += k * 0.12; rx -= k * 0.9; }
      else if (cur.id === 'hammer') { rx -= Math.sin(t * Math.PI) * 1.4; oz -= k * 0.15; }
      else if (cur.id === 'brush') { ox -= Math.sin(t * Math.PI * 4) * 0.08; rz += k * 0.4; }
      else { rz += k * 0.9; ox -= k * 0.05; }
    }
    // empty hands for throwables we're out of
    vm.visible = !isThrow || (this.game.inventory[cur.item] || 0) > 0 || this.swing > 0;
    this.holder.position.set(0.32 + ox, -0.3 + oy, -0.55 + oz);
    this.holder.rotation.set(rx, 0, rz);
  }

  _updateArc() {
    const pos = this._origin(new THREE.Vector3());
    const vel = this._throwVelocity(new THREE.Vector3(), true);
    const pts = this.arcPts;
    const n = pts.length / 3;
    let landed = false;
    for (let i = 0; i < n; i++) {
      if (!landed) {
        for (let s = 0; s < 3; s++) {
          vel.y -= 22 * 0.02;
          pos.addScaledVector(vel, 0.02);
        }
        if (pos.y < this.game.world.groundY(pos.x, pos.z)) landed = true;
      }
      pts[i * 3] = pos.x; pts[i * 3 + 1] = pos.y; pts[i * 3 + 2] = pos.z;
    }
    this.arc.geometry.attributes.position.needsUpdate = true;
  }

  _throw(player) {
    const cur = this.current;
    const inv = this.game.inventory;
    if ((inv[cur.item] || 0) <= 0) { this.game.toast(`Out of ${cur.name}s!`, 'muted'); this.cooldown = 0.4; return; }
    const origin = this._origin(new THREE.Vector3());
    const vel = this._throwVelocity(new THREE.Vector3(), player.aiming);
    vel.x += player.vel.x * 0.5; vel.z += player.vel.z * 0.5;
    this.game.requestThrow(cur.item, origin, vel);
    this.swingLen = this.swing = 0.35;
    this.cooldown = 0.45;
    this.swings = (this.swings || 0) + 1;
  }

  _sendPartner() {
    this.swingLen = this.swing = 0.35;
    this.cooldown = 0.6;
    this.swings = (this.swings || 0) + 1;
    const g = this.game;
    if (!g.party.length) { g.toast('You don\'t have a partner yet!', 'muted'); return; }
    const t = g.interactions.target;
    // aiming at your friend (or their partner): challenge them to a friendly battle
    if (t && (t.id === 'player' || t.id === 'friendcomp')) { g.challengeFriend(); return; }
    // aiming at nothing wild: send your partner out to walk with you / call it back
    if (!t?.speciesId) { g.toggleCompanion(); return; }
    if (g.interactions.hitDist > 30) { g.toast('Too far — get within 30 m.', 'muted'); return; }
    g.audio.play('throw');
    g.requestBattle(t);
  }

  _useTool(id) {
    this.swingLen = this.swing = id === 'hammer' ? 0.4 : 0.5;
    this.cooldown = id === 'hammer' ? 0.45 : 0.5;
    this.swings = (this.swings || 0) + 1;
    const target = this.game.interactions.inUseRange() ? this.game.interactions.target : null;
    if (id === 'can') {
      this.game.audio.play('water');
      this.game.fx?.water(this._origin(new THREE.Vector3()), this.camera.getWorldDirection(new THREE.Vector3()));
    } else if (id === 'brush') {
      this.game.audio.play('brush');
    } else {
      this.game.audio.play('swing');
    }
    if (target?.hit) {
      // delay the hit to the impact point of the swing
      setTimeout(() => { if (this.game.interactions.target === target) this.game.requestHit(target, id); }, 150);
    }
  }
}
