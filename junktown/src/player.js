// First-person player: movement, inventory, and using whatever junk you're holding.
import * as THREE from 'three';
import { analyze, itemMesh, makeItem } from './items.js';
import { collide, MAP, LAYOUT } from './town.js';
import { wallBox } from './director.js';
import { sfx } from './audio.js';

export const INV_SIZE = 10;
const EYE = 1.65, R = 0.4, GRAV = 24;
const BUILD_H = new Map(); // collider index -> height (for projectiles)
LAYOUT.B.forEach((b, i) => BUILD_H.set(i, b.h));

export class Player {
  /** game provides: zombies() -> [{id,x,z,scale}], walls() -> [box], send(type,msg) ... */
  constructor(game, camera) {
    this.g = game;
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 0, 6);
    this.vy = 0; this.grounded = true;
    this.yaw = Math.PI; this.pitch = 0;
    this.hp = 100; this.down = false;
    this.inv = new Array(INV_SIZE).fill(null);
    this.sel = 0;
    this.cd = 0; this.swing = 0; this.hitAt = 0; this.flaming = false; this.flameTick = 0;
    this.projectiles = [];
    this.hurtT = 0; this.bob = 0;
    // viewmodel
    this.hand = new THREE.Group();
    this.hand.position.set(0.38, -0.42, -0.7);
    camera.add(this.hand);
    this.heldSig = null;
    // flashlight
    this.light = new THREE.SpotLight(0xfff4d6, 0, 40, 0.45, 0.5, 1.2);
    this.light.position.set(0.2, -0.1, 0);
    camera.add(this.light); camera.add(this.light.target);
    this.light.target.position.set(0, 0, -10);
    // placement ghost
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.visible = false;
    game.scene.add(this.ghost);
    this.reset();
  }

  reset() {
    this.pos.set((Math.random() - 0.5) * 4, 0, 6 + Math.random() * 2);
    this.hp = 100; this.down = false; this.vy = 0;
    this.inv.fill(null);
    this.inv[0] = makeItem(['pipe']);
    this.inv[1] = makeItem(['bandage']);
    this.sel = 0;
  }

  get held() { return this.inv[this.sel]; }
  get stats() { return this.held ? analyze(this.held.parts) : null; }

  addItem(item) {
    const i = this.inv.indexOf(null);
    if (i < 0) return false;
    this.inv[i] = item;
    return true;
  }
  removeHeld() { this.inv[this.sel] = null; }

  hurt(dmg) {
    if (this.down || this.g.state?.ph === 'over') return;
    this.hp -= dmg;
    this.hurtT = 0.4;
    sfx('hurt', 80);
    if (this.hp <= 0) { this.hp = 0; this.down = true; sfx('down'); }
  }
  revive() { if (this.down) { this.down = false; this.hp = 40; sfx('revive'); } }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt, inp, walls, canAct) {
    // ---- movement (yaw: 0 looks towards -z)
    const fwd = _a.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = _b.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = _c.set(0, 0, 0).addScaledVector(fwd, inp.mz).addScaledVector(right, inp.mx);
    if (wish.lengthSq() > 1) wish.normalize();
    const speed = this.down ? 1.1 : inp.sprint ? 8.5 : 5.2;
    this.pos.addScaledVector(wish, speed * dt);
    if (!this.down && inp.jump && this.grounded) { this.vy = 7.5; this.grounded = false; }
    this.vy -= GRAV * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    collide(this.pos, R, walls);
    this.pos.x = Math.max(-MAP, Math.min(MAP, this.pos.x));
    this.pos.z = Math.max(-MAP, Math.min(MAP, this.pos.z));
    const moving = wish.lengthSq() > 0.01 && this.grounded;
    this.bob += dt * (moving ? (inp.sprint ? 13 : 9) : 0);
    if (this.g.state?.ph === 'day' && !this.down) this.hp = Math.min(100, this.hp + dt * 1.5);

    // ---- camera
    const eye = this.down ? 0.5 : EYE;
    this.cam.position.set(this.pos.x, this.pos.y + eye + Math.sin(this.bob) * 0.05, this.pos.z);
    this.cam.rotation.set(0, 0, 0);
    this.cam.rotateY(this.yaw); this.cam.rotateX(this.pitch);
    if (this.hurtT > 0) { this.hurtT -= dt; this.cam.rotateZ(Math.sin(this.hurtT * 60) * this.hurtT * 0.08); }
    if (this.down) this.cam.rotateZ(0.3);

    // ---- held item
    const it = this.held, s = this.stats;
    const sig = it ? it.parts.join(',') : '';
    if (sig !== this.heldSig) {
      this.heldSig = sig;
      this.hand.clear();
      if (it) {
        const m = itemMesh(it.parts, 1.1);
        m.rotation.set(s.form === 'melee' ? -2.3 : -Math.PI + 0.1, 0.15, 0);
        if (s.form !== 'melee') m.position.set(0, 0, 0.2);
        this.hand.add(m);
      }
      this.swing = 0; this.flaming = false;
    }
    this.hand.visible = !this.down;
    this.cd -= dt;
    const night = this.g.town.night;
    this.light.intensity = (s?.light ? 40 + s.light * 25 : 0) + night * 18;
    this.light.distance = s?.light ? 45 : 22;

    // swing animation
    const swingK = this.swing > 0 ? Math.sin((1 - this.swing / 0.3) * Math.PI) : 0;
    this.hand.rotation.set(-swingK * 1.4, swingK * 0.8, 0);
    this.hand.position.set(0.38 - swingK * 0.25, -0.42 + Math.sin(this.bob) * 0.025, -0.7);
    if (this.swing > 0) {
      this.swing -= dt;
      if (this.hitAt > 0) { this.hitAt -= dt; if (this.hitAt <= 0) this._meleeHit(s); }
    }

    this.ghost.visible = false;
    this.flaming = false;
    if (!it || this.down || !canAct) { this._updateProjectiles(dt, walls); return; }

    switch (s.form) {
      case 'melee':
        if (inp.fire && this.cd <= 0) { this.cd = s.cd; this.swing = 0.3; this.hitAt = 0.12; sfx('swing'); }
        break;
      case 'gun':
        if (inp.firePressed && this.cd <= 0) { this.cd = s.cd; this._shoot(it, s); }
        break;
      case 'flamer':
        if (inp.fire) {
          this.flaming = true;
          this.flameTick -= dt;
          if (this.flameTick <= 0) {
            this.flameTick = 0.1;
            it.uses--;
            this._cone(s.reach, 0.55, (z, dx, dz) => this.g.hitZ({ id: z.id, parts: it.parts, k: 'flame', dx, dz }));
            sfx('flame', 120);
            if (it.uses <= 0) this._break();
          }
          const f = this.forward(_d);
          const p = _e.copy(this.cam.position).addScaledVector(f, 1.6).add(_f.set(0, -0.35, 0));
          this.g.fx.flame(p, f);
        }
        break;
      case 'throw':
        if (inp.firePressed) { this._throw(it, s); this.removeHeld(); }
        break;
      case 'heal':
        if (inp.firePressed && this.hp < 100) { this.hp = Math.min(100, this.hp + s.amount); sfx('heal'); this.removeHeld(); }
        break;
      case 'wall': case 'trap': case 'magnet': case 'mine': {
        const f = _d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const px = this.pos.x + f.x * 3, pz = this.pos.z + f.z * 3;
        const rot = ((Math.round(this.yaw / (Math.PI / 2)) % 4) + 4) % 4;
        const w = s.form === 'wall' ? s.width : s.form === 'trap' ? s.radius * 2 : 1.4;
        const h = s.form === 'wall' ? 1.6 : 0.5;
        const ok = !collide({ x: px, z: pz }, 0.6) && Math.abs(px) < MAP && Math.abs(pz) < MAP;
        this.ghost.visible = true;
        this.ghost.position.set(px, h / 2, pz);
        this.ghost.scale.set(s.form === 'wall' ? (rot % 2 ? 0.7 : w) : w, h, s.form === 'wall' ? (rot % 2 ? w : 0.7) : w);
        this.ghost.material.color.setHex(ok ? 0x66ff88 : 0xff5555);
        if (inp.firePressed && ok) { this.g.place(it, px, pz, rot); this.removeHeld(); sfx('build'); }
        break;
      }
    }
    this._updateProjectiles(dt, walls);
  }

  _cone(range, halfAngle, fn) {
    const f = this.forward(_d); f.y = 0; f.normalize();
    for (const z of this.g.zombieList()) {
      const dx = z.x - this.pos.x, dz = z.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > range + 0.4 * z.scale) continue;
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      if (d > 1.2 && dot < Math.cos(halfAngle)) continue;
      fn(z, dx / (d || 1), dz / (d || 1));
    }
  }

  _meleeHit(s) {
    const it = this.held;
    if (!it) return;
    let hits = 0;
    this._cone(s.reach, (s.arc * Math.PI / 180) / 2, (z, dx, dz) => { if (hits < 3) { hits++; this.g.hitZ({ id: z.id, parts: it.parts, k: 'melee', dx, dz }); } });
    if (hits) {
      sfx('hit');
      it.uses -= 1;
      if (it.uses <= 0) this._break();
    }
  }

  _break() { sfx('break'); this.g.toast(`Your ${analyze(this.held.parts).name} broke!`); this.removeHeld(); }

  _shoot(it, s) {
    const f = this.forward(_d);
    const p = _e.copy(this.cam.position).addScaledVector(f, 0.8);
    this._spawnProjectile('gun', it.parts, p, f.clone().multiplyScalar(s.speed), 3, true);
    this.g.send({ t: 'fx', k: 'proj', kind: 'gun', parts: it.parts, p: p.toArray(), v: f.clone().multiplyScalar(s.speed).toArray() });
    sfx(s.P.explosive ? 'rocket' : 'shoot');
    it.uses--;
    if (it.uses <= 0) this._break();
  }

  _throw(it, s) {
    const f = this.forward(_d);
    const v = f.clone().multiplyScalar(17).add(_f.set(0, 4.5, 0));
    const p = _e.copy(this.cam.position).addScaledVector(f, 0.6);
    this._spawnProjectile('throw', it.parts, p, v, GRAV * 0.75, true);
    this.g.send({ t: 'fx', k: 'proj', kind: 'throw', parts: it.parts, p: p.toArray(), v: v.toArray() });
    sfx('throw');
  }

  /** also used for the friend's projectiles (real=false: visual only) */
  _spawnProjectile(kind, parts, p, v, grav, real) {
    const mesh = kind === 'throw' ? itemMesh(parts, 0.7) : new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    mesh.position.copy(p);
    this.g.scene.add(mesh);
    this.projectiles.push({ kind, parts, mesh, v: v.clone(), grav, life: 4, real });
  }

  _updateProjectiles(dt, walls) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const P = this.projectiles[i];
      P.life -= dt;
      P.v.y -= P.grav * dt;
      P.mesh.position.addScaledVector(P.v, dt);
      if (P.kind === 'throw') { P.mesh.rotation.x += dt * 10; P.mesh.rotation.z += dt * 4; }
      else this.g.fx.trail(P.mesh.position);
      const pos = P.mesh.position;
      let hitZ = null;
      for (const z of this.g.zombieList()) {
        if (pos.y < 2.3 * z.scale && Math.hypot(z.x - pos.x, z.z - pos.z) < 0.7 * z.scale) { hitZ = z; break; }
      }
      const inWall = pos.y < 6 && collide({ x: pos.x, z: pos.z }, 0.05, walls);
      if (hitZ || pos.y <= 0.05 || inWall || P.life <= 0) {
        this.g.scene.remove(P.mesh);
        this.projectiles.splice(i, 1);
        if (P.real) {
          const n = P.v.clone().setY(0).normalize();
          this.g.land({ k: P.kind, parts: P.parts, x: pos.x, z: pos.z, hitId: hitZ?.id || null, dx: n.x, dz: n.z });
        }
        if (P.kind === 'gun' && !analyze(P.parts).radius) this.g.fx.sparks(pos, 6);
      }
    }
  }

  pose() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, down: this.down, hp: Math.round(this.hp),
      held: this.held ? this.held.parts.join(',') : '', sw: this.swing > 0 ? 1 : 0, fl: this.flaming ? 1 : 0 };
  }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
export { wallBox };
