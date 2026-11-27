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
      this._spawn(pos, _v, [0xffcc33, 0xff7722, 0xff4411][i + (Math.random() < 0.5 ? 0 : 1)], 0.3, 0.4, 2, 2.5);
    }
  }
  explosion(pos, big = 1) {
    for (let i = 0; i < 24 * big; i++) {
      _v.set((Math.random() - 0.5) * 16, Math.random() * 12, (Math.random() - 0.5) * 16).multiplyScalar(big);
      this._spawn(pos, _v, [0xffcc33, 0xff7722, 0x555555, 0xffffff][i % 4], 0.3 + Math.random() * 0.4 * big, 0.5 + Math.random() * 0.5, -10, 1);
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

  /**
   * owner: player index, target: fn() -> {x,y,z} of the victim,
   * onHit: called when it connects (null = visual only, e.g. the other player's missiles)
   */
  missile(pos, dir, target, onHit) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    body.rotation.x = Math.PI / 2; g.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xd8312b }));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.6; g.add(tip);
    g.position.copy(pos);
    this.scene.add(g);
    this.missiles.push({ g, vel: dir.clone().multiplyScalar(14), target, onHit, life: 4, arm: 0.25 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { this.scene.remove(m); this.live.splice(i, 1); this.pool.push(m); continue; }
      u.vel.y += u.grav * dt;
      m.position.addScaledVector(u.vel, dt);
      const k = u.life / u.max;
      m.scale.setScalar(Math.max(0.01, u.size * (1 + u.grow * (1 - k)) * (u.grow ? 1 : k)));
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const M = this.missiles[i];
      M.life -= dt; M.arm -= dt;
      const t = M.target();
      if (t && M.arm <= 0) {
        _v.set(t.x, t.y + 2, t.z).sub(M.g.position);
        const d = _v.length();
        _v.normalize().multiplyScalar(22);
        M.vel.lerp(_v, Math.min(1, dt * 2.8));
        if (d < 1.7) { this.explosion(M.g.position, 0.6); M.onHit?.(); this._kill(i); continue; }
      } else {
        M.vel.y -= dt * 4;
      }
      M.g.position.addScaledVector(M.vel, dt);
      M.g.lookAt(_w.copy(M.g.position).add(M.vel));
      if (Math.random() < 0.6) this._spawn(M.g.position, _w.set(0, 0.5, 0), 0xaaaaaa, 0.14, 0.3, 0, 1.2);
      if (M.life <= 0 || M.g.position.y < 0.1) { this.explosion(M.g.position, 0.5); this._kill(i); }
    }
  }
  _kill(i) { this.scene.remove(this.missiles[i].g); this.missiles.splice(i, 1); }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
