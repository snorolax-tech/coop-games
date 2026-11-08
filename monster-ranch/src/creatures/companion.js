// Your partner creature walking with you outside of battle. The local companion follows
// the player; the friend's companion is mirrored from their pose packets.
import * as THREE from 'three';
import { SPECIES, SPECIES_BY_ID } from '../data/creatures.js';
import { WATER_Y } from '../world/terrain.js';
import { angDiff } from '../core/noise.js';
import { buildCreatureModel } from './model.js';
import { Emote } from './emote.js';

export class Companion {
  constructor(game, { local }) {
    this.game = game;
    this.local = local;
    this.view = null;
    this.key = '';
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0; this.netYaw = 0;
    this.speed = 0;
    this.excited = 0;
    this.idleT = 3 + Math.random() * 4;
    this.visible = false;
  }

  /** Rebuild the model when the creature (or its evolution / shiny) changes. */
  setCreature(speciesId, shiny) {
    const key = speciesId ? `${speciesId}${shiny ? '*' : ''}` : '';
    if (key === this.key) return;
    this.key = key;
    this._dispose();
    if (!speciesId) return;
    const sp = SPECIES_BY_ID[speciesId];
    this.sp = sp;
    this.view = buildCreatureModel(sp, { shiny });
    this.root = this.view.root;
    this.emote = new Emote(this.root, this.view.height);
    this.game.scene.add(this.root);
    this.root.visible = this.visible;
    if (this.local) {
      this.def = this.game.interactions.add({
        id: 'mycomp', root: this.root, name: `${sp.name} (your partner)`, range: 6,
        sub: () => 'E  Pet  ·  F  Call back  ·  Partner (6) + click a wild creature to battle',
        localUse: () => this.game.petCompanion(),
      });
    } else {
      this.def = this.game.interactions.add({
        id: 'friendcomp', root: this.root, name: `${sp.name} (${this.game.remote?.name || 'friend'}'s partner)`, range: 30,
        sub: () => 'Partner (6) + click: challenge to a friendly battle',
      });
    }
  }

  _dispose() {
    if (this.root) this.game.scene.remove(this.root);
    if (this.def) this.game.interactions.remove(this.def);
    this.root = null; this.view = null; this.def = null;
  }

  show(v, near) {
    if (v && !this.visible && near) {
      // pop out next to the player with a puff
      this.pos.copy(near);
      this.game.fx.puff(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffffff, 14);
    }
    if (!v && this.visible && this.root) this.game.fx.puff(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffffff, 10);
    this.visible = v;
    if (this.root) this.root.visible = v;
  }

  say(sym, d = 1.4) { this.emote?.show(sym, d); }

  /** Local: follow the player. */
  follow(dt, player) {
    if (!this.root || !this.visible) return;
    const w = this.game.world;
    const yaw = player.yaw;
    // stand a little behind and to the right of the player
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    this.target.set(player.pos.x - fx * 2.2 + rx * 1.4, 0, player.pos.z - fz * 2.2 + rz * 1.4);
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 25) { this.pos.set(this.target.x, 0, this.target.z); }
    // only start walking once the player has moved away (so you can turn around and look at it)
    const fromPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (!this.moving && (fromPlayer > 4.5 || fromPlayer < 1.1)) this.moving = true;
    if (this.moving && d < 0.6) this.moving = false;
    let speed = 0;
    if (this.moving) {
      speed = Math.min(12, 2 + d * 1.6);
      const want = Math.atan2(dx, dz);
      this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * 8);
      const step = Math.min(d, speed * dt);
      this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
    } else {
      // idle: look at the player, sometimes emote
      this.yaw += angDiff(Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), this.yaw) * Math.min(1, dt * 3);
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 5 + Math.random() * 8;
        const inst = this.game.party[0];
        const happy = (inst?.happiness ?? 70) >= 70;
        if (Math.random() < 0.6) this.say(happy ? '♥' : '♪', 1.4);
        this.excited = 1;
      }
    }
    let y = w.groundY(this.pos.x, this.pos.z);
    if (y < WATER_Y && !this.view.hover) y = WATER_Y - 0.2;
    this.pos.y = y;
    this.speed = speed;
    this.excited = Math.max(0, this.excited - dt);
    this._render(dt);
  }

  /** Remote: mirror a network state [num, shiny, x, y, z, yaw, speed10, exc10] or null. */
  apply(s) {
    if (!s) { this.show(false); return; }
    const sp = SPECIES[s[0] - 1];
    this.setCreature(sp?.id, !!s[1]);
    this.target.set(s[2], s[3], s[4]);
    this.netYaw = s[5]; this.netSpeed = s[6] / 10; this.excited = s[7] / 10;
    if (!this.visible) { this.pos.copy(this.target); this.show(true); }
  }

  updateRemote(dt) {
    if (!this.root || !this.visible) return;
    this.pos.lerp(this.target, 1 - Math.exp(-12 * dt));
    if (this.pos.distanceTo(this.target) > 15) this.pos.copy(this.target);
    this.yaw += angDiff(this.netYaw, this.yaw) * Math.min(1, dt * 10);
    this.speed = this.netSpeed || 0;
    this._render(dt);
  }

  _render(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.view.update(dt, { speed: this.speed, excited: Math.min(1, this.excited) });
    this.emote.update(dt);
  }

  /** Compact state for the network. */
  state() {
    if (!this.visible || !this.sp) return null;
    const inst = this.game.party.find((c) => c.species === this.sp.id) || this.game.party[0];
    return [this.sp.num, inst?.shiny ? 1 : 0, +this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(2), Math.round(this.speed * 10), Math.round(this.excited * 10)];
  }

  clear() { this.show(false); this._dispose(); this.key = ''; }
}
