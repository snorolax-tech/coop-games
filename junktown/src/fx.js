// Particles + missiles.
import * as THREE from 'three';

const MAX = 500;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.pool = [];
    this.live = [];
    this.missiles = [];
    this.debris = [];
    this.mats = {};
  }
  _mat(color) {
    if (!this.mats[color]) this.mats[color] = new THREE.MeshBasicMaterial({ color, transparent: true });
    return this.mats[color];
  }
  _spawn(pos, vel, color, size, life, grav = -20, grow = 0) {
    if (this.live.length >= MAX) return;
    const m = this.pool.pop() || new THREE.Mesh(this.geo);
    m.material = this._mat(color);
    m.position.copy(pos);
    m.scale.setScalar(size);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.userData = { vel: vel.clone(), life, max: life, grav, size, grow };
    this.scene.add(m);
    this.live.push(m);
  }
  sparks(pos, n = 12, color = 0xffdd55) {
    for (let i = 0; i < n; i++) {
      _v.set((Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14);
      this._spawn(pos, _v, Math.random() < 0.3 ? 0xffffff : color, 0.15 + Math.random() * 0.15, 0.3 + Math.random() * 0.4);
    }
  }
  flame(pos, dir) {
    for (let i = 0; i < 2; i++) {
      _v.copy(dir).multiplyScalar(14 + Math.random() * 4).add(_w.set((Math.random() - 0.5) * 5, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 5));
      this._spawn(pos, _v, [0xffcc33, 0xff7722, 0xff4411][i + (Math.random() < 0.5 ? 0 : 1)], 0.12, 0.4, 2, 2.2);
    }
  }
  explosion(pos, big = 1) {
    for (let i = 0; i < 24 * big; i++) {
      _v.set((Math.random() - 0.5) * 16, Math.random() * 12, (Math.random() - 0.5) * 16).multiplyScalar(big);
      this._spawn(pos, _v, [0xffcc33, 0xff7722, 0x555555, 0xffffff][i % 4], 0.15 + Math.random() * 0.25 * big, 0.5 + Math.random() * 0.5, -10, 1);
    }
  }
  dust(pos, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      _v.set(Math.cos(a) * 10, 1 + Math.random() * 2, Math.sin(a) * 10);
      this._spawn(pos, _v, 0x9a8a78, 0.4, 0.6, -2, 1.5);
    }
  }
  thrust(pos) { _v.set((Math.random() - 0.5) * 2, -8, (Math.random() - 0.5) * 2); this._spawn(pos, _v, 0x66ccff, 0.25, 0.3, 0, -0.5); }

  trail(pos) { if (Math.random() < 0.7) this._spawn(pos, _w.set(0, 0.3, 0), 0xffcc66, 0.12, 0.25, 0, 0.5); }
  blood(pos, n = 8) {
    for (let i = 0; i < n; i++) { _v.set((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6); this._spawn(pos, _v, Math.random() < 0.5 ? 0x5a7a2a : 0x3d5a1a, 0.14, 0.5); }
  }
  gas(pos) { _v.set((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2); this._spawn(pos, _v, 0x9acd32, 0.35, 1.2, 0, 1.5); }
  fire(pos) { _v.set((Math.random() - 0.5) * 1, 2 + Math.random() * 2, (Math.random() - 0.5) * 1); this._spawn(pos, _v, Math.random() < 0.5 ? 0xff7a1a : 0xffcc33, 0.18, 0.6, 1, 1); }
  zap(a, b) {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      _v.copy(a).lerp(b, i / n).add(_w.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      this._spawn(_v, _w.set(0, 0, 0), 0xaeeaff, 0.18, 0.25, 0, 0);
    }
  }

  /** throw a real mesh (e.g. a zombie arm) into the world with physics; it lies there a while then sinks */
  piece(mesh, vel, spin = 8) {
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(wp, wq, ws);
    mesh.removeFromParent();
    mesh.position.copy(wp); mesh.quaternion.copy(wq); mesh.scale.copy(ws);
    this.scene.add(mesh);
    this.debris.push({ m: mesh, v: vel.clone(), w: new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin), life: 6 });
    if (this.debris.length > 40) { const d = this.debris.shift(); this.scene.remove(d.m); }
  }

  update(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.v.y -= 20 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      if (d.m.position.y < 0.12) { d.m.position.y = 0.12; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6); }
      if (d.life < 1) d.m.position.y -= dt * 0.4;
      if (d.life <= 0) { this.scene.remove(d.m); this.debris.splice(i, 1); }
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { this.scene.remove(m); this.live.splice(i, 1); this.pool.push(m); continue; }
      u.vel.y += u.grav * dt;
      m.position.addScaledVector(u.vel, dt);
      const k = u.life / u.max;
      m.scale.setScalar(Math.max(0.01, u.size * (1 + u.grow * (1 - k)) * (u.grow ? 1 : k)));
    }
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
